import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import { planMinimapLayout, planMinimapSelection } from '../../core/minimap.js';

// Execute the actual method body without importing the GNOME module graph.
function method(file, name, bindings) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    const body = source.match(new RegExp(`^    ${name}\\([^\\n]*\\) \\{[\\s\\S]*?^    \\}`, 'm'));
    assert.ok(body, `${name} method not found`);
    return runInNewContext(`({${body[0]}}).${name}`, bindings);
}

function recorder() {
    const calls = [];
    return {
        calls,
        set_position: (...args) => calls.push(['position', ...args]),
        set_size: (...args) => calls.push(['size', ...args]),
        set_clip: (...args) => calls.push(['clip', ...args]),
        show: (...args) => calls.push(['show', ...args]),
        hide: (...args) => calls.push(['hide', ...args]),
    };
}

const monitor = { x: 0, y: 0, width: 1000, height: 800, index: 0 };

function windowRect(frame, buffer = frame) {
    return { frame, buffer };
}

function planFor(columns, bounds = monitor) {
    return planMinimapLayout({
        columns,
        monitor: bounds,
        scale: 0.1,
        gap: 8,
    });
}

test('layout projects plain rects and applies the complete plan once', () => {
    const frame = { x: 0, y: 0, width: 800, height: 600, boxed: 'frame' };
    const buffer = { x: 0, y: 0, width: 800, height: 600, boxed: 'buffer' };
    const container = {
        meta_window: {
            get_buffer_rect: () => buffer,
            get_frame_rect: () => frame,
        },
        clone: recorder(),
        ...recorder(),
    };
    const minimap = [];
    minimap.push([container]);
    Object.assign(minimap, {
        monitor,
        container: recorder(),
        clip: recorder(),
        actor: {
            width: 0,
            height: 0,
            ...recorder(),
        },
        label: { set_style: style => minimap.label.style = style },
        select: () => minimap.selected = (minimap.selected ?? 0) + 1,
    });
    let planned;
    const planLayout = input => {
        planned = input;
        return planMinimapLayout(input);
    };

    method('../../minimap.js', 'layout', {
        planMinimapLayout: planLayout,
        Settings: { prefs: { minimap_scale: 0.1, window_gap: 8 } },
    }).call(minimap);

    const keys = value => Object.keys(value).sort().join(',');
    assert.notEqual(planned.monitor, monitor);
    assert.equal(keys(planned.monitor), 'height,width,x,y');
    assert.equal(planned.monitor.width, monitor.width);
    assert.equal(planned.monitor.height, monitor.height);
    const plannedFrame = planned.columns[0][0].frame;
    const plannedBuffer = planned.columns[0][0].buffer;
    assert.notEqual(plannedFrame, frame);
    assert.notEqual(plannedBuffer, buffer);
    assert.equal(keys(plannedFrame), 'height,width,x,y');
    assert.equal(keys(plannedBuffer), 'height,width,x,y');
    assert.equal(plannedFrame.width, frame.width);
    assert.equal(plannedFrame.height, frame.height);
    assert.equal(plannedBuffer.width, buffer.width);
    assert.equal(plannedBuffer.height, buffer.height);

    assert.deepEqual(container.calls, [
        ['position', 0, 0],
        ['size', 80, 60],
    ]);
    assert.deepEqual(container.clone.calls, [
        ['position', 0, 0],
        ['size', 80, 52],
    ]);
    assert.deepEqual(minimap.container.calls, [['size', 80, 60]]);
    assert.deepEqual(minimap.clip.calls, [
        ['size', 80, 60],
        ['position', 20, 24],
        ['clip', 0, 0, 80, 60],
    ]);
    assert.deepEqual(minimap.actor.calls, [
        ['size', 120, 124],
        ['position', 440, 338],
    ]);
    assert.equal(minimap.label.style, 'max-width: 80px;');
    assert.equal(minimap.selected, 1);
});

function selectFixture() {
    const shades = Array.from({ length: 4 }, () => ({
        opacity: 0,
        shown: 0,
        show() { this.shown++; },
    }));
    const windows = ['zero', 'one', 'two', 'three'].map((title, i) => ({
        title,
        clone: { shade: shades[i] },
    }));
    const minimap = [];
    for (const window of windows)
        minimap.push([{ meta_window: window }]);

    const highlight = { ...recorder(), x: 0, y: 0, width: 0, height: 0 };
    const label = {
        ...recorder(),
        text: '',
        width: 999,
        measured: [],
        get_preferred_width(height) {
            this.measured.push(height);
            return [56, 60];
        },
    };
    const space = {
        positionOf: () => [2, 0],
        getWindows: () => windows,
    };
    Object.assign(minimap, {
        space,
        plan: planFor(Array.from({ length: 4 }, () => [
            windowRect({ x: 0, y: 0, width: 2000, height: 1000 }),
        ]), { x: 0, y: 0, width: 400, height: 800 }),
        container: { x: 0 },
        highlight,
        label,
        actor: { ...recorder(), height: 160 },
    });
    return { minimap, windows, shades, highlight, label, space };
}

function selectBindings(selection = planMinimapSelection) {
    return {
        planMinimapSelection: selection,
        Settings: {
            prefs: {
                window_gap: 8,
                animation_time: 250,
                minimap_shade_opacity: 160,
            },
        },
        Easer: { addEase: (actor, ease) => actor.ease = ease },
    };
}

test('select measures the new label and applies plan geometry once per shade', () => {
    const { minimap, windows, shades, highlight, label } = selectFixture();
    let planned;
    const spy = input => {
        planned = input;
        return planMinimapSelection(input);
    };

    method('../../minimap.js', 'select', selectBindings(spy)).call(minimap);

    assert.equal(planned.layout, minimap.plan);
    assert.deepEqual(planned.position, [2, 0]);
    assert.equal(planned.labelWidth, 60);
    assert.equal(planned.gap, 8);
    assert.equal(planned.containerX, 0);
    assert.equal(label.text, 'two');
    assert.deepEqual(label.measured, [-1]);
    assert.deepEqual(label.calls, [
        ['show'],
        ['position', 90, 132],
    ]);
    assert.deepEqual(highlight.calls, [
        ['show'],
        ['size', 208, 108],
    ]);
    assert.deepEqual(
        { x: highlight.x, y: highlight.y },
        { x: 16, y: 16 });
    assert.equal(minimap.container.x, -416);
    assert.equal(minimap.actor.height, 160);
    assert.deepEqual(minimap.actor.calls, []);

    for (let i = 0; i < windows.length; i++) {
        assert.equal(shades[i].shown, 1);
        if (i === 2) {
            assert.equal(shades[i].opacity, 0);
            assert.equal(shades[i].ease, undefined);
        } else {
            assert.equal(shades[i].ease.time, 250);
            assert.equal(shades[i].ease.opacity, 160);
        }
    }
});

function staleFixture(position = [9, 9]) {
    const shade = { opacity: 0, shown: 0, show() { this.shown++; } };
    const window = { title: 'stale', clone: { shade } };
    const minimap = [[{ meta_window: window }]];
    const highlight = { ...recorder(), x: 1, y: 2, width: 3, height: 4 };
    const label = {
        ...recorder(),
        text: 'old',
        measured: 0,
        get_preferred_width() { this.measured++; return [0, 50]; },
    };
    Object.assign(minimap, {
        space: {
            positionOf: () => position,
            getWindows: () => [window],
        },
        plan: planFor([[
            windowRect({ x: 0, y: 0, width: 800, height: 600 }),
        ]]),
        container: { x: -20 },
        highlight,
        label,
        actor: { height: 100 },
    });
    return { minimap, highlight, label, shade };
}

test('a stale position hides the highlight and label without shading', () => {
    for (const position of [false, [9, 9]]) {
        const { minimap, highlight, label, shade } = staleFixture(position);
        method('../../minimap.js', 'select', selectBindings()).call(minimap);

        assert.deepEqual(highlight.calls, [['hide']]);
        assert.deepEqual(label.calls, [['hide']]);
        assert.equal(label.text, 'old');
        assert.equal(label.measured, 0);
        assert.equal(shade.shown, 0);
        assert.equal(shade.ease, undefined);
    }
});

test('a selection missing from the layout is hidden even after measuring its label', () => {
    const { minimap, highlight, label, shade } = staleFixture();
    minimap.space.positionOf = () => [0, 0];
    minimap.plan = {
        ...minimap.plan,
        columns: [],
        content: { width: 0, height: 0 },
        clip: { ...minimap.plan.clip, width: 0, height: 0 },
    };
    method('../../minimap.js', 'select', selectBindings()).call(minimap);

    assert.equal(label.text, 'stale');
    assert.equal(label.measured, 1);
    assert.deepEqual(highlight.calls, [['hide']]);
    assert.deepEqual(label.calls, [['hide']]);
    assert.equal(shade.shown, 0);
    assert.equal(shade.ease, undefined);
});
