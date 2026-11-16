import test from 'node:test';
import assert from 'node:assert/strict';

import { selectDndTarget, sameDndTarget } from '../../core/dnd.js';

const base = {
    gap: 8,
    columnZoneMargin: 104,
    columnZoneMarginViz: 104,
    rowZoneMargin: 254,
    emptyTargetX: 500,
};

const column = (x, width, rows) => ({ x, width, rows });

test('selectDndTarget picks a column zone left of the column edge', () => {
    const target = selectDndTarget({
        ...base,
        columns: [column(200, 800, [{ x: 200, y: 40, width: 800, height: 500 }])],
        x: 100,
        y: 300,
    });
    assert.deepEqual(target.position, [0]);
    assert.equal(target.originProp, 'x');
    assert.deepEqual(target.anchor, { x: 200, width: 800 });
});

test('selectDndTarget picks the appended new-column zone', () => {
    const target = selectDndTarget({
        ...base,
        columns: [column(200, 800, [{ x: 200, y: 40, width: 800, height: 500 }])],
        x: 1008,
        y: 300,
    });
    assert.deepEqual(target.position, [1]);
    assert.equal(target.originProp, 'x');
});

test('selectDndTarget splits rows inside a column', () => {
    const columns = [column(200, 800, [
        { x: 200, y: 40, width: 800, height: 500 },
        { x: 200, y: 548, width: 800, height: 500 },
    ])];
    const target = selectDndTarget({ ...base, columns, x: 500, y: 200 });
    assert.deepEqual(target.position, [0, 0]);
    assert.equal(target.originProp, 'y');
    assert.equal(target.marginA, 0);
    assert.equal(target.marginB, 254);
    assert.deepEqual(target.anchor, { x: 200, width: 800 });

    assert.deepEqual(
        selectDndTarget({ ...base, columns, x: 500, y: 600 }).position,
        [0, 1]);
});

test('selectDndTarget returns null outside every zone', () => {
    assert.equal(selectDndTarget({
        ...base,
        columns: [column(200, 800, [{ x: 200, y: 40, width: 800, height: 500 }])],
        x: 5000,
        y: 300,
    }), null);
});

test('selectDndTarget does not throw for an empty trailing zone', () => {
    const target = selectDndTarget({
        ...base,
        columns: [],
        x: 504,
        y: 10,
    });
    assert.deepEqual(target.position, [0]);

    assert.equal(selectDndTarget({
        ...base,
        columns: [],
        x: 700,
        y: 10,
    }), null);
});

test('sameDndTarget compares slots, not objects', () => {
    assert.equal(sameDndTarget({ position: [1, 2] }, { position: [1, 2] }), true);
    assert.equal(sameDndTarget({ position: [1, 2] }, { position: [1, 3] }), false);
    assert.equal(sameDndTarget({ position: [1] }, { position: [1, 0] }), false);
    assert.equal(sameDndTarget(null, { position: [1] }), false);
});
