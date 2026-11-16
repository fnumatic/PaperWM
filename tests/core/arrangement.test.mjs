import test from 'node:test';
import assert from 'node:assert/strict';

import { openWindowIndex, swapTarget } from '../../core/arrangement.js';

test('openWindowIndex puts a new column after the selected one by default', () => {
    assert.equal(openWindowIndex({ selectedIndex: 1, columnCount: 3, position: 'right' }), 2);
});

test('openWindowIndex starts at the beginning without a selection', () => {
    assert.equal(openWindowIndex({ selectedIndex: null, columnCount: 3, position: 'right' }), 0);
});

test('openWindowIndex handles left, start and end', () => {
    assert.equal(openWindowIndex({ selectedIndex: 2, columnCount: 3, position: 'left' }), 2);
    assert.equal(openWindowIndex({ selectedIndex: 2, columnCount: 3, position: 'start' }), 0);
    assert.equal(openWindowIndex({ selectedIndex: 2, columnCount: 3, position: 'end' }), 4);
});

test('swapTarget moves within the space', () => {
    assert.deepEqual(
        swapTarget({ index: 1, row: 1, columnLengths: [2, 2, 2], direction: 'left' }),
        { index: 0, row: 1 });
    assert.deepEqual(
        swapTarget({ index: 1, row: 0, columnLengths: [2, 2, 2], direction: 'down' }),
        { index: 1, row: 1 });
});

test('swapTarget refuses moves outside the space', () => {
    assert.equal(swapTarget({ index: 0, row: 0, columnLengths: [2, 2, 2], direction: 'left' }), null);
    assert.equal(swapTarget({ index: 2, row: 0, columnLengths: [2, 2, 2], direction: 'right' }), null);
    assert.equal(swapTarget({ index: 1, row: 0, columnLengths: [2, 2, 2], direction: 'up' }), null);
    assert.equal(swapTarget({ index: 1, row: 1, columnLengths: [2, 2, 2], direction: 'down' }), null);
});

test('swapTarget checks the target column height', () => {
    assert.equal(
        swapTarget({ index: 0, row: 1, columnLengths: [3, 1], direction: 'right' }),
        null);
    assert.deepEqual(
        swapTarget({ index: 0, row: 1, columnLengths: [3, 3], direction: 'right' }),
        { index: 1, row: 1 });
});
