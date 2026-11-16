import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import {
    computeOverviewLayout,
    computeOverviewScale,
    computeOverviewSlots,
} from '../../core/overview.js';

// Execute actual source without importing the GNOME module graph.
function sourceOf() {
    return readFileSync(new URL('../../overviewlayout.js', import.meta.url), 'utf8');
}

function method(name, bindings) {
    const body = sourceOf().match(
        new RegExp(`^    ${name}\\([^\\n]*\\) \\{[\\s\\S]*?^    \\}`, 'm'));
    assert.ok(body, `${name} method not found`);
    return runInNewContext(`({${body[0]}}).${name}`, bindings);
}

function exported(name, bindings) {
    const body = sourceOf().match(
        new RegExp(`^export function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?^\\}`, 'm'));
    assert.ok(body, `${name} function not found`);
    return runInNewContext(`(${body[0].replace(/^export /, '')})`, bindings);
}

function makeBindings() {
    const calls = [];
    const record = (name, fn) => input => {
        calls.push({ name, input });
        return fn(input);
    };
    return {
        calls,
        computeOverviewLayout: record('layout', computeOverviewLayout),
        computeOverviewScale: record('scale', computeOverviewScale),
        computeOverviewSlots: record('slots', computeOverviewSlots),
        Settings: {
            prefs: {
                overview_min_windows_per_row: 1,
                overview_max_window_scale: 0.9,
            },
        },
        Params: {
            parse: (params, defaults) => ({ ...defaults, ...params }),
        },
        // Stand-in for the tiled-order comparator: rank is the intended preview order.
        sortWindows: (a, b) => a.rank - b.rank,
    };
}

const area = { x: 0, y: 0, width: 1920, height: 1080 };
const strategy = () => ({
    _monitor: { height: 1080 },
    _rowSpacing: 20,
    _columnSpacing: 10,
});

function freezeDeep(value) {
    if (value && typeof value === 'object') {
        Object.freeze(value);
        for (const entry of Object.values(value))
            freezeDeep(entry);
    }
    return value;
}

function ids(slots) {
    return slots.map(slot => slot[4].id);
}

test('the strategy maps core window indices back to the sorted previews', () => {
    const previews = freezeDeep([
        { id: 'last', rank: 2, boundingBox: { width: 700, height: 500 } },
        { id: 'first', rank: 0, boundingBox: { width: 800, height: 600 } },
        { id: 'middle', rank: 1, boundingBox: { width: 900, height: 400 } },
    ]);
    const order = ['last', 'first', 'middle'];
    const state = strategy();
    const bindings = makeBindings();
    const computeLayout = method('computeLayout', bindings);
    const computeScaleAndSpace = method('computeScaleAndSpace', bindings);
    const computeWindowSlots = method('computeWindowSlots', bindings);

    const layout = computeLayout.call(state, previews, { numRows: 2 });
    assert.deepEqual(layout.windows.map(preview => preview.id),
        ['first', 'middle', 'last']);
    // Only the wrapper holds previews; the grid carries plain indices.
    assert.ok(!('windows' in layout.grid));
    assert.ok(layout.grid.rows.every(row =>
        row.windows.every(index => Number.isInteger(index))));

    const [scale] = computeScaleAndSpace.call(state, layout, area);
    assert.equal(scale, layout.scale);
    const slots = computeWindowSlots.call(state, layout, area);

    assert.deepEqual(ids(slots), ['first', 'middle', 'last']);
    // The wrapper owns the order, so a later allocation can recompute slots.
    assert.deepEqual(ids(computeWindowSlots.call(state, layout, area)),
        ['first', 'middle', 'last']);
    assert.ok(slots.every(([x, y, width, height, preview]) =>
        Number.isFinite(x + y + width + height) &&
        previews.includes(preview)));
    assert.deepEqual(previews.map(preview => preview.id), order);

    for (const call of bindings.calls) {
        if (call.name !== 'layout')
            assert.ok(!('windows' in call.input.layout));
        if (call.name !== 'scale') {
            for (const window of call.input.windows)
                assert.deepEqual(Object.keys(window).sort(), ['height', 'width']);
        }
    }
});

test('interleaved layouts keep their own sorted previews', () => {
    const first = freezeDeep([
        { id: 'a2', rank: 2, boundingBox: { width: 700, height: 500 } },
        { id: 'a0', rank: 0, boundingBox: { width: 800, height: 600 } },
        { id: 'a1', rank: 1, boundingBox: { width: 900, height: 400 } },
    ]);
    const second = freezeDeep([
        { id: 'b1', rank: 1, boundingBox: { width: 600, height: 300 } },
        { id: 'b0', rank: 0, boundingBox: { width: 500, height: 700 } },
    ]);
    const state = strategy();
    const bindings = makeBindings();
    const computeLayout = method('computeLayout', bindings);
    const computeScaleAndSpace = method('computeScaleAndSpace', bindings);
    const computeWindowSlots = method('computeWindowSlots', bindings);

    const layoutA = computeLayout.call(state, first, { numRows: 1 });
    const layoutB = computeLayout.call(state, second, { numRows: 2 });
    computeScaleAndSpace.call(state, layoutA, area);
    computeScaleAndSpace.call(state, layoutB, area);

    assert.deepEqual(ids(computeWindowSlots.call(state, layoutA, area)),
        ['a0', 'a1', 'a2']);
    assert.deepEqual(ids(computeWindowSlots.call(state, layoutB, area)),
        ['b0', 'b1']);
    // Layout A still maps A after B, including across a repeated allocation.
    assert.deepEqual(ids(computeWindowSlots.call(state, layoutA, area)),
        ['a0', 'a1', 'a2']);
    assert.notEqual(layoutA.windows, layoutB.windows);
});

test('the strategy returns no slots for an empty preview list', () => {
    const state = strategy();
    const bindings = makeBindings();
    const computeLayout = method('computeLayout', bindings);
    const computeScaleAndSpace = method('computeScaleAndSpace', bindings);
    const computeWindowSlots = method('computeWindowSlots', bindings);

    const layout = computeLayout.call(state, [], { numRows: 1 });
    computeScaleAndSpace.call(state, layout, area);
    assert.deepEqual(computeWindowSlots.call(state, layout, area), []);
    assert.deepEqual(layout.windows, []);
    assert.ok(layout.grid.rows.every(row =>
        row.windows.every(index => Number.isInteger(index))));
});

test('sortWindows treats a missing workspace Space as untracked', () => {
    const knownWorkspace = { id: 'known' };
    const missingWorkspace = { id: 'missing' };
    const known = {
        metaWindow: {
            get_workspace: () => knownWorkspace,
            get_stable_sequence: () => 1,
        },
    };
    const missing = {
        metaWindow: {
            get_workspace: () => missingWorkspace,
            get_stable_sequence: () => 9,
        },
    };
    const sortWindows = exported('sortWindows', {
        Tiling: {
            spaces: {
                spaceOfWindow: metaWindow =>
                    metaWindow.get_workspace() === knownWorkspace
                        ? { indexOf: () => 0 }
                        : undefined,
            },
        },
    });

    assert.doesNotThrow(() => [known, missing].sort(sortWindows));
    assert.deepEqual([missing, known].sort(sortWindows), [missing, known]);
});
