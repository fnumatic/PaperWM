import test from 'node:test';
import assert from 'node:assert/strict';

import { slurpPlan, barfTarget } from '../../core/arrangement.js';

test('slurpPlan takes the right neighbour by default', () => {
    assert.deepEqual(
        slurpPlan({ index: 0, columnLengths: [2, 1], direction: 'right', insertAt: 'bottom' }),
        { from: 1, row: 2 });
});

test('slurpPlan takes the left neighbour for left and start', () => {
    assert.deepEqual(
        slurpPlan({ index: 1, columnLengths: [2, 1], direction: 'left', insertAt: 'top' }),
        { from: 0, row: 0 });
});

test('slurpPlan inserts above and below the target row', () => {
    assert.deepEqual(
        slurpPlan({ index: 0, columnLengths: [2, 1], direction: 'right', insertAt: 'above', rowIndex: 1 }),
        { from: 1, row: 1 });
    assert.deepEqual(
        slurpPlan({ index: 0, columnLengths: [2, 1], direction: 'right', insertAt: 'below', rowIndex: 0 }),
        { from: 1, row: 1 });
});

test('slurpPlan refuses a single column or a missing neighbour', () => {
    assert.equal(
        slurpPlan({ index: 0, columnLengths: [2], direction: 'right', insertAt: 'bottom' }),
        null);
    assert.equal(
        slurpPlan({ index: 1, columnLengths: [2, 1], direction: 'right', insertAt: 'bottom' }),
        null);
    assert.equal(
        slurpPlan({ index: 1, columnLengths: [2, 0], direction: 'left', insertAt: 'bottom' }), null);
});

test('barfTarget refuses single-window columns', () => {
    assert.equal(barfTarget({ index: 0, columnLength: 1, direction: 'right' }), null);
});

test('barfTarget places the column left or right of the source', () => {
    assert.equal(barfTarget({ index: 0, columnLength: 2, direction: 'right' }), 1);
    assert.equal(barfTarget({ index: 0, columnLength: 2, direction: 'left' }), 0);
    assert.equal(barfTarget({ index: 1, columnLength: 2, direction: 'left' }), 1);
});
