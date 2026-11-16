import test from 'node:test';
import assert from 'node:assert/strict';

import {
    computeOverviewLayout,
    computeOverviewScale,
    computeOverviewSlots,
} from '../../core/overview.js';

const window = (width, height, id = `${width}x${height}`) => ({
    boundingBox: { width, height },
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

function layout(windows, numRows) {
    return computeOverviewLayout({ windows, numRows, ...options });
}

test('overview layout requires at least one row', () => {
    assert.throws(() => layout([window(800, 600)], 0), /No numRows/);
});

test('one window fits one row and stays inside the area', () => {
    const l = layout([window(800, 600)], 1);
    assert.equal(l.rows.length, 1);
    assert.equal(l.maxColumns, 1);
    const { scale } = computeOverviewScale({ layout: l, area, ...options });
    const { slots } = computeOverviewSlots({ layout: l, area, scale, ...options });
    assert.equal(slots.length, 1);
    const [x, y, width, height] = slots[0];
    assert.ok(x >= area.x && x + width <= area.x + area.width);
    assert.ok(y >= area.y && y + height <= area.y + area.height);
});

test('several windows spread across rows without leaving the area', () => {
    const windows = [800, 900, 700, 1000, 600].map((width, i) => window(width, 500 + i * 20));
    const l = layout(windows, 2);
    assert.equal(l.rows.length, 2);
    assert.equal(l.rows.flatMap(row => row.windows).length, windows.length);
    const { scale } = computeOverviewScale({ layout: l, area, ...options });
    const { slots } = computeOverviewSlots({ layout: l, area, scale, ...options });
    assert.equal(slots.length, windows.length);
    for (const [x, y, width, height] of slots) {
        assert.ok(Number.isFinite(x + y + width + height));
        assert.ok(x >= area.x - 1 && x + width <= area.x + area.width + 1);
        assert.ok(y >= area.y - 1 && y + height <= area.y + area.height + 1);
    }
});

test('a single row centers windows vertically and two rows align to the row bottom', () => {
    const one = layout([window(800, 600)], 1);
    const scale = computeOverviewScale({ layout: one, area, ...options }).scale;
    const single = computeOverviewSlots({ layout: one, area, scale, ...options }).slots[0];

    const two = layout([window(800, 600), window(900, 400)], 2);
    const scale2 = computeOverviewScale({ layout: two, area, ...options }).scale;
    const slots = computeOverviewSlots({ layout: two, area, scale: scale2, ...options }).slots;
    assert.ok(slots[0][1] !== single[1]);
    assert.equal(slots.length, 2);
});

test('scale never exceeds the configured maximum', () => {
    const l = layout([window(100, 100)], 1);
    const { scale } = computeOverviewScale({ layout: l, area, ...options });
    assert.ok(scale <= options.maxScale);
});

test('slot computation replaces row annotations instead of mutating the input', () => {
    const l = layout([window(800, 600), window(900, 400)], 1);
    const before = structuredClone(l.rows);
    const scale = computeOverviewScale({ layout: l, area, ...options }).scale;
    const { rows } = computeOverviewSlots({ layout: l, area, scale, ...options });
    assert.deepEqual(l.rows, before);
    assert.notEqual(rows, l.rows);
    assert.ok(rows.every(row => Number.isFinite(row.x) && Number.isFinite(row.y)));
});
