import test from 'node:test';
import assert from 'node:assert/strict';

import {
    computeOverviewLayout,
    computeOverviewScale,
    computeOverviewSlots,
} from '../../core/overview.js';

const window = (width, height, id = `${width}x${height}`) => ({
    width,
    height,
    id,
});
const area = { x: 0, y: 0, width: 1920, height: 1080 };
const options = {
    monitorHeight: 1080,
    minWindowsPerRow: 2,
    maxScale: 0.9,
    columnSpacing: 10,
    rowSpacing: 20,
};
const windowScale = height => 1.5 - 0.5 * (height / options.monitorHeight);

function layout(windows, numRows) {
    return computeOverviewLayout({ windows, numRows, ...options });
}

function freezeDeep(value) {
    if (value && typeof value === 'object') {
        Object.freeze(value);
        for (const entry of Object.values(value))
            freezeDeep(entry);
    }
    return value;
}

test('overview layout requires at least one row', () => {
    assert.throws(() => layout([window(800, 600)], 0), /No numRows/);
});

test('one window fits one row and stays inside the area', () => {
    const l = layout([window(800, 600)], 1);
    assert.equal(l.rows.length, 1);
    assert.equal(l.maxColumns, 1);
    assert.deepEqual(l.rows[0].windows, [0]);
    const { scale } = computeOverviewScale({ layout: l, area, ...options });
    const slots = computeOverviewSlots({
        layout: l, windows: [window(800, 600)], area, scale, ...options,
    });
    assert.equal(slots.length, 1);
    const [x, y, width, height, index] = slots[0];
    assert.equal(index, 0);
    assert.ok(x >= area.x && x + width <= area.x + area.width);
    assert.ok(y >= area.y && y + height <= area.y + area.height);
});

test('several windows spread across rows and keep snapshot indices', () => {
    const windows = [800, 900, 700, 1000, 600]
        .map((width, i) => window(width, 500 + i * 20, `w${i}`));
    const l = layout(windows, 2);
    assert.equal(l.rows.length, 2);
    const indices = l.rows.flatMap(row => row.windows);
    assert.equal(indices.length, windows.length);
    assert.deepEqual([...indices].sort((a, b) => a - b),
        windows.map((_, i) => i));
    const { scale } = computeOverviewScale({ layout: l, area, ...options });
    const slots = computeOverviewSlots({
        layout: l, windows, area, scale, ...options,
    });
    assert.equal(slots.length, windows.length);
    assert.deepEqual(slots.map(slot => slot[4]).sort((a, b) => a - b),
        windows.map((_, i) => i));
    for (const [x, y, width, height] of slots) {
        assert.ok(Number.isFinite(x + y + width + height));
        assert.ok(x >= area.x - 1 && x + width <= area.x + area.width + 1);
        assert.ok(y >= area.y - 1 && y + height <= area.y + area.height + 1);
    }
});

test('a single row centers windows vertically and two rows align to the row bottom', () => {
    const one = layout([window(800, 600)], 1);
    const scale = computeOverviewScale({ layout: one, area, ...options }).scale;
    const single = computeOverviewSlots({
        layout: one, windows: [window(800, 600)], area, scale, ...options,
    })[0];

    const windows = [window(800, 600), window(900, 400)];
    const two = layout(windows, 2);
    const scale2 = computeOverviewScale({ layout: two, area, ...options }).scale;
    const slots = computeOverviewSlots({
        layout: two, windows, area, scale: scale2, ...options,
    });
    assert.ok(slots[0][1] !== single[1]);
    assert.equal(slots.length, 2);
});

test('scale never exceeds the configured maximum', () => {
    const l = layout([window(100, 100)], 1);
    const { scale } = computeOverviewScale({ layout: l, area, ...options });
    assert.ok(scale <= options.maxScale);
});

test('a rejected window does not inflate the previous row height', () => {
    const windows = [
        window(1000, 400),
        window(1000, 400),
        window(1000, 800),
    ];
    const l = layout(windows, 2);
    assert.deepEqual(l.rows[0].windows, [0, 1]);
    assert.deepEqual(l.rows[1].windows, [2]);
    assert.ok(Math.abs(l.rows[0].fullHeight - 400 * windowScale(400)) < 1e-9);
    assert.ok(Math.abs(l.rows[1].fullHeight - 800 * windowScale(800)) < 1e-9);
    assert.ok(Math.abs(l.gridHeight - (
        400 * windowScale(400) + 800 * windowScale(800))) < 1e-9);
});

test('empty input yields empty rows without NaN or negative space', () => {
    const l = layout([], 3);
    assert.equal(l.rows.length, 3);
    assert.ok(l.rows.every(row => row.windows.length === 0));
    const { scale, space } = computeOverviewScale({ layout: l, area, ...options });
    assert.ok(Number.isFinite(scale) && scale >= 0 && scale <= options.maxScale);
    assert.ok(Number.isFinite(space) && space >= 0);
    const slots = computeOverviewSlots({
        layout: l, windows: [], area, scale, ...options,
    });
    assert.deepEqual(slots, []);
});

test('zero-area layouts get a zero scale and finite slots', () => {
    const windows = [window(800, 600), window(900, 400)];
    const l = layout(windows, 2);
    const zeroArea = { x: 10, y: 20, width: 0, height: 0 };
    const { scale, space } = computeOverviewScale({
        layout: l, area: zeroArea, ...options,
    });
    assert.equal(scale, 0);
    assert.ok(Number.isFinite(space) && space >= 0);
    const slots = computeOverviewSlots({
        layout: l, windows, area: zeroArea, scale, ...options,
    });
    assert.equal(slots.length, 2);
    for (const [x, y, width, height] of slots) {
        assert.ok(Number.isFinite(x + y + width + height));
        assert.equal(width, 0);
        assert.equal(height, 0);
        assert.ok(x >= zeroArea.x && y >= zeroArea.y);
    }
});

test('zero-width or zero-height area with zero spacing stays finite', () => {
    const windows = [window(800, 600), window(900, 400)];
    const l = layout(windows, 2);
    const noSpacing = { ...options, columnSpacing: 0, rowSpacing: 0 };
    for (const degenerate of [
        { x: 0, y: 0, width: 0, height: 1080 },
        { x: 0, y: 0, width: 1920, height: 0 },
    ]) {
        const { scale, space } = computeOverviewScale({
            layout: l, area: degenerate, ...noSpacing,
        });
        assert.ok(Number.isFinite(scale) && scale >= 0);
        assert.ok(Number.isFinite(space) && space >= 0);
        const slots = computeOverviewSlots({
            layout: l, windows, area: degenerate, scale, ...noSpacing,
        });
        for (const [x, y, width, height] of slots)
            assert.ok(Number.isFinite(x + y + width + height));
    }
});

test('zero-sized content and zero area avoid the 0/0 slot scale', () => {
    const windows = [window(0, 0, 'a'), window(0, 0, 'b')];
    const l = layout(windows, 1);
    const zeroArea = { x: 0, y: 0, width: 0, height: 0 };
    const { scale } = computeOverviewScale({ layout: l, area: zeroArea, ...options });
    assert.ok(Number.isFinite(scale) && scale >= 0);
    const slots = computeOverviewSlots({
        layout: l, windows, area: zeroArea, scale, ...options,
    });
    assert.deepEqual(slots.map(slot => slot[4]), [0, 1]);
    for (const [x, y, width, height] of slots)
        assert.ok(Number.isFinite(x + y + width + height));
});

test('frozen snapshots and layout are accepted and not mutated', () => {
    const windows = freezeDeep([
        window(800, 600, 'first'),
        window(900, 400, 'second'),
        window(700, 500, 'third'),
    ]);
    const l = layout(windows, 2);
    assert.deepEqual(windows.map(w => w.id), ['first', 'second', 'third']);
    assert.ok(l.rows.every(row =>
        row.windows.every(index => Number.isInteger(index))));

    const frozen = freezeDeep(l);
    const snapshot = structuredClone(frozen);
    const { scale } = computeOverviewScale({ layout: frozen, area, ...options });
    const slots = computeOverviewSlots({
        layout: frozen, windows, area, scale, ...options,
    });
    assert.deepEqual(frozen, snapshot);
    assert.ok(slots.every(slot => Number.isInteger(slot[4])));
    assert.ok(slots.every(slot =>
        slot.slice(0, 4).every(Number.isFinite)));
});
