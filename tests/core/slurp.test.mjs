import test from 'node:test';
import assert from 'node:assert/strict';

import { slurpPlan, barfTarget } from '../../core/arrangement.js';

test('slurpPlan takes the right neighbour by default', () => {
    assert.deepEqual(
        slurpPlan({ index: 0, columnLengths: [2, 1], direction: 'right', insertAt: 'bottom' }),
        { from: 1, position: { push: true } });
});

test('slurpPlan takes the left neighbour for left and start', () => {
    assert.deepEqual(
        slurpPlan({ index: 1, columnLengths: [2, 1], direction: 'left', insertAt: 'top' }),
        { from: 0, position: { index: 0 } });
});

test('slurpPlan inserts above and below the target row', () => {
    assert.deepEqual(
        slurpPlan({ index: 0, columnLengths: [2, 1], direction: 'right', insertAt: 'above', rowIndex: 1 }),
        { from: 1, position: { index: 1 } });
    assert.deepEqual(
        slurpPlan({ index: 0, columnLengths: [2, 1], direction: 'right', insertAt: 'below', rowIndex: 0 }),
        { from: 1, position: { index: 1 } });
});

test('slurpPlan refuses a single column or a missing neighbour', () => {
    assert.equal(
        slurpPlan({ index: 0, columnLengths: [2], direction: 'right', insertAt: 'bottom' }),
        null);
    assert.equal(
        slurpPlan({ index: 1, columnLengths: [2, 1], direction: 'right', insertAt: 'bottom' }),
        null);
    assert.deepEqual(
        slurpPlan({ index: 1, columnLengths: [2, 0], direction: 'left', insertAt: 'bottom' }),
        { from: 0, position: { push: true } });
});

test('barfTarget refuses single-window columns', () => {
    assert.equal(barfTarget({ index: 0, columnLength: 1, direction: 'right' }), null);
});

test('barfTarget places the column left or right of the source', () => {
    assert.deepEqual(barfTarget({ index: 0, columnLength: 2, direction: 'right' }), { to: 1 });
    assert.deepEqual(barfTarget({ index: 1, columnLength: 2, direction: 'left' }), { to: 1 });
});
