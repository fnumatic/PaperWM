import test from 'node:test';
import assert from 'node:assert/strict';

import { grabColumnHeights } from '../../core/geometry.js';

const base = {
    yGrabRel: 100,
    grabHeight: 300,
    y0: 32,
    gap: 10,
    availableHeight: 1000,
    columnLength: 3,
    index: 1,
};

test('grab heights preserve the anchor and split the remaining room', () => {
    assert.deepEqual(grabColumnHeights(base), {
        above: 58,
        anchor: 300,
        below: 622,
    });
});

test('grab heights handle the first and last row', () => {
    const first = grabColumnHeights({ ...base, index: 0 });
    assert.equal(first.above, 68);
    const last = grabColumnHeights({ ...base, index: 2, columnLength: 3 });
    assert.equal(last.below, 632);
});

test('grab heights can be negative when the drag leaves no room', () => {
    const result = grabColumnHeights({ ...base, yGrabRel: 40, grabHeight: 1200 });
    assert.ok(result.below < 0);
});
