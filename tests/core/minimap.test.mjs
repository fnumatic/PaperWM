import test from 'node:test';
import assert from 'node:assert/strict';

import * as minimap from '../../core/minimap.js';

const { planMinimapLayout, planMinimapSelection } = minimap;

const monitor = { x: 0, y: 0, width: 1000, height: 800 };
const window = (frame, buffer = frame) => ({ frame, buffer });

function layout(columns, overrides = {}) {
    return planMinimapLayout({
        columns,
        monitor,
        scale: 0.1,
        gap: 10,
        ...overrides,
    });
}

function freezeDeep(value) {
    if (value && typeof value === 'object') {
        Object.freeze(value);
        for (const entry of Object.values(value))
            freezeDeep(entry);
    }
    return value;
}

test('the core exports only its two plans', () => {
    assert.deepEqual(Object.keys(minimap).sort(),
        ['planMinimapLayout', 'planMinimapSelection']);
});

test('clone geometry keeps buffer offsets and the legacy lower gap', () => {
    const plan = layout([[
        window(
            { x: 100, y: 200, width: 800, height: 600 },
            { x: 90, y: 180, width: 820, height: 630 }),
    ]], { gap: 5 });

    const placed = plan.columns[0][0];
    assert.deepEqual(placed.container, { width: 80, height: 60 });
    assert.deepEqual(placed.clone, { x: -1, y: -2, width: 82, height: 58 });
    assert.deepEqual(
        { x: placed.x, y: placed.y },
        { x: 0, y: 0 });
    assert.deepEqual(plan.clip, { x: 17, y: 20, width: 80, height: 60 });
});

test('columns stack rows and advance by the widest row plus the gap', () => {
    const plan = layout([
        [
            window({ x: 0, y: 0, width: 800, height: 600 }),
            window({ x: 0, y: 0, width: 500, height: 300 }),
        ],
        [
            window({ x: 0, y: 0, width: 400, height: 200 }),
        ],
    ]);

    assert.deepEqual(plan.columns.map(column => column[0].x), [0, 90]);
    assert.deepEqual(
        plan.columns.map(column => column[0].container.width),
        [80, 40]);
    assert.deepEqual(
        plan.columns[0].map(clone => ({ x: clone.x, y: clone.y })),
        [{ x: 0, y: 0 }, { x: 0, y: 60 }]);
    assert.deepEqual(plan.content, { width: 130, height: 90 });
    assert.deepEqual(plan.clip, { x: 22, y: 27, width: 130, height: 90 });
});

test('layout is idempotent and centers the complete actor from its content', () => {
    const columns = freezeDeep([[
        window({ x: 0, y: 0, width: 800, height: 600 }),
        window({ x: 0, y: 0, width: 500, height: 300 }),
    ]]);
    const first = layout(columns);
    const second = layout(columns);

    assert.deepEqual(second, first);
    assert.equal(first.actor.height, 157);
    assert.equal(first.actor.width, 124);
    assert.equal(first.actor.x, 438);
    assert.equal(first.actor.y, 321);
    assert.equal(first.actor.height, first.clip.y + first.content.height + 40);
});

test('the clip is capped by the monitor while the actor stays centered', () => {
    const plan = layout([[
        window({ x: 0, y: 0, width: 5000, height: 600 }),
    ]], { monitor: { x: 0, y: 0, width: 500, height: 800 } });

    assert.equal(plan.content.width, 500);
    assert.equal(plan.clip.width, 432);
    assert.equal(plan.actor.width, 476);
    assert.equal(plan.actor.x, 12);
    assert.equal(plan.actor.height, 127);
    assert.equal(plan.actor.y, 336);
});

test('empty and zero-scale layouts stay non-negative', () => {
    const empty = layout([]);
    assert.deepEqual(empty.content, { width: 0, height: 0 });
    assert.deepEqual(empty.clip, { x: 22, y: 27, width: 0, height: 0 });
    assert.equal(empty.actor.width, 44);
    assert.equal(empty.actor.height, 67);
    assert.equal(empty.actor.x, 478);
    assert.equal(empty.actor.y, 366);
    assert.deepEqual(Object.keys(empty).sort(),
        ['actor', 'clip', 'columns', 'content']);

    const trailing = layout([
        [window({ x: 0, y: 0, width: 800, height: 600 })],
        [],
    ]);
    assert.equal(trailing.content.width, 80);

    const tiny = layout([[
        window({ x: 0, y: 0, width: 800, height: 600 }),
    ]], { scale: 0.001, gap: 10 });
    assert.equal(tiny.columns[0][0].clone.height, 0);
    assert.ok(tiny.columns[0][0].clone.width >= 0);
});

test('layout is a frozen replay and never mutates the snapshot', () => {
    const columns = freezeDeep([
        [window({ x: 10, y: 20, width: 800, height: 600 })],
        [window({ x: 0, y: 0, width: 500, height: 300 })],
    ]);
    const before = JSON.stringify(columns);
    const first = layout(columns);
    const second = layout(columns);
    assert.deepEqual(second, first);
    assert.equal(JSON.stringify(columns), before);
});

test('monitor origins translate only the minimap actor, not its local content', () => {
    const columns = [[window({ x: 0, y: 0, width: 800, height: 600 })]];
    const origin = layout(columns);
    const translated = layout(columns, { monitor: { ...monitor, x: -1920, y: 150 } });
    assert.equal(translated.actor.x, origin.actor.x - 1920);
    assert.equal(translated.actor.y, origin.actor.y + 150);
    assert.deepEqual(translated.columns, origin.columns);
    assert.deepEqual(translated.clip, origin.clip);
});

const selectionMonitor = { x: 0, y: 0, width: 400, height: 800 };

function selectionLayout(frameWidth = 2000, count = 4, bounds = selectionMonitor) {
    return planMinimapLayout({
        columns: Array.from({ length: count }, () => [
            window({ x: 0, y: 0, width: frameWidth, height: 1000 }),
        ]),
        monitor: bounds,
        scale: 0.1,
        gap: 8,
    });
}

test('a selected window beyond the right edge keeps a capped context margin', () => {
    const plan = selectionLayout();
    const selection = planMinimapSelection({
        layout: plan,
        position: [2, 0],
        labelWidth: 60,
        gap: 8,
    });

    assert.equal(selection.visible, true);
    assert.equal(selection.containerX, -416);
    assert.deepEqual(selection.highlight, { x: 16, y: 16, width: 208, height: 108 });
    assert.deepEqual(selection.label, { x: 90, y: 132 });
    assert.deepEqual(Object.keys(selection).sort(),
        ['containerX', 'highlight', 'label', 'visible']);
});

test('a selection already inside the clip keeps the existing scroll', () => {
    const plan = selectionLayout();
    const selection = planMinimapSelection({
        layout: plan,
        position: [1, 0],
        labelWidth: 60,
        gap: 8,
        containerX: -100,
    });

    assert.equal(selection.containerX, -100);
    assert.equal(selection.highlight.x, 124);
});

test('scrolling left aligns the selection with a capped margin', () => {
    const plan = selectionLayout();
    const selection = planMinimapSelection({
        layout: plan,
        position: [1, 0],
        labelWidth: 60,
        gap: 8,
        containerX: -500,
    });

    assert.equal(selection.containerX, -72);
    assert.equal(selection.highlight.x, 152);
});

test('the context margin cannot hide a selection in a narrow viewport', () => {
    const narrow = selectionLayout(1000, 4, { x: 0, y: 0, width: 200, height: 800 });
    assert.equal(narrow.clip.width, 136);
    const selection = planMinimapSelection({
        layout: narrow,
        position: [2, 0],
        labelWidth: 60,
        gap: 8,
    });

    assert.equal(selection.containerX, -216);
    const left = 216 + selection.containerX;
    assert.equal(left, 0);
    assert.equal(left + 100, 100);
    assert.equal(narrow.clip.width - (left + 100), 36);
});

test('a selected window wider than the clip aligns its right edge', () => {
    const plan = selectionLayout(4000, 3);
    const selection = planMinimapSelection({
        layout: plan,
        position: [2, 0],
        labelWidth: 60,
        gap: 8,
    });

    assert.equal(selection.containerX, -880);
    assert.equal(816 + selection.containerX, -64);
    assert.equal(816 + 400 + selection.containerX, plan.clip.width);
});

test('stale positions hide the selection instead of keeping old geometry', () => {
    const plan = selectionLayout();
    for (const position of [false, null, [4, 0], [0, 1], [-1, 0], ['0', 0]]) {
        assert.deepEqual(planMinimapSelection({
            layout: plan,
            position,
            labelWidth: 60,
            gap: 8,
        }), { visible: false });
    }
    assert.deepEqual(planMinimapSelection({
        layout: null,
        position: [0, 0],
        labelWidth: 60,
        gap: 8,
    }), { visible: false });
});

test('a wider label clamps to the clip and selection replay is frozen', () => {
    const plan = freezeDeep(selectionLayout());
    const input = freezeDeep({
        layout: plan,
        position: [2, 0],
        labelWidth: 350,
        gap: 8,
    });
    const first = planMinimapSelection(input);
    const second = planMinimapSelection(input);

    assert.equal(first.label.x, 15);
    assert.equal(first.label.y, 132);
    assert.deepEqual(second, first);
});
