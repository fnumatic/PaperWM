import test from 'node:test';
import assert from 'node:assert/strict';
import { selectDndTarget, sameDndTarget } from '../../core/dnd.js';

const base = { gap: 8, viewportWidth: 1920, scrollOffsetX: 0 };
const row = (x = 200, y = 40, width = 800, height = 500) => ({ x, y, width, height });

test('drop target selects a column zone or the trailing insertion zone', () => {
    const columns = [[row()]];
    const left = selectDndTarget({ ...base, columns, x: 100, y: 300 });
    assert.deepEqual(left.position, [0]);
    assert.equal(left.center, 196);
    assert.equal(left.anchor, undefined);
    assert.deepEqual(selectDndTarget({ ...base, columns, x: 1008, y: 300 }).position, [1]);
});

test('vertical drop zones retain each row geometry, including the bottom edge', () => {
    const columns = [[row(), row(200, 548, 900)]];
    const first = selectDndTarget({ ...base, columns, x: 500, y: 200 });
    assert.deepEqual(first.position, [0, 0]);
    assert.equal(first.marginA, 0);
    assert.equal(first.marginB, 254);
    assert.deepEqual(first.anchor, { x: 200, width: 800 });
    const bottom = selectDndTarget({ ...base, columns, x: 500, y: 1100 });
    assert.deepEqual(bottom.position, [0, 2]);
    assert.equal(bottom.marginB, 0);
    assert.deepEqual(bottom.anchor, { x: 200, width: 900 });
});

test('column insertion wins where its zone overlaps an earlier row zone', () => {
    const columns = [[row(20, 40)], [row(840, 40)]];
    assert.deepEqual(selectDndTarget({
        ...base, gap: 20, columns, x: 750, y: 300,
    }).position, [1]);
});

test('column bounds and trailing insertion use the widest row', () => {
    const columns = [[row(20, 40, 450, 400), row(20, 460, 800, 400)]];
    assert.deepEqual(selectDndTarget({
        ...base, gap: 20, columns, x: 600, y: 600,
    }).position, [0, 1]);
});

test('empty-space drop zones use target scroll coordinates, not animated positions', () => {
    assert.deepEqual(selectDndTarget({
        ...base, columns: [], x: 500, y: 10,
    }).position, [0]);
    assert.deepEqual(selectDndTarget({
        ...base, columns: [], scrollOffsetX: -200, x: 700, y: 10,
    }).position, [0]);
    assert.equal(selectDndTarget({
        ...base, columns: [], x: 1500, y: 10,
    }), null);
});

test('empty columns and points outside every zone produce no row target', () => {
    assert.equal(selectDndTarget({
        ...base, columns: [[], [row()]], x: 5000, y: 300,
    }), null);
});

test('sameDndTarget compares slots, including absent targets', () => {
    assert.equal(sameDndTarget({ position: [1, 2] }, { position: [1, 2] }), true);
    assert.equal(sameDndTarget({ position: [1, 2] }, { position: [1, 3] }), false);
    assert.equal(sameDndTarget({ position: [1] }, { position: [1, 0] }), false);
    assert.equal(sameDndTarget(null, { position: [1] }), false);
    assert.equal(sameDndTarget(null, null), true);
});
