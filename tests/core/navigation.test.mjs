import test from 'node:test';
import assert from 'node:assert/strict';

import { nextLinear, stepColumn, stepRow } from '../../core/navigation.js';

test('nextLinear moves down inside the column', () => {
    assert.deepEqual(
        nextLinear({ columnLengths: [3, 2], index: 0, row: 0, dir: 1, loop: false }),
        { index: 0, row: 1 });
});

test('nextLinear moves into the next column at its first row', () => {
    assert.deepEqual(
        nextLinear({ columnLengths: [2, 3], index: 0, row: 1, dir: 1, loop: false }),
        { index: 1, row: 0 });
});

test('nextLinear moves into the previous column at its last row', () => {
    assert.deepEqual(
        nextLinear({ columnLengths: [2, 3], index: 1, row: 0, dir: -1, loop: false }),
        { index: 0, row: 1 });
});

test('nextLinear wraps with loop', () => {
    assert.deepEqual(
        nextLinear({ columnLengths: [2, 3], index: 1, row: 2, dir: 1, loop: true }),
        { index: 0, row: 0 });
    assert.deepEqual(
        nextLinear({ columnLengths: [2, 3], index: 0, row: 0, dir: -1, loop: true }),
        { index: 1, row: 2 });
});

test('nextLinear without loop keeps an out-of-range index for the caller', () => {
    assert.deepEqual(
        nextLinear({ columnLengths: [2, 3], index: 1, row: 2, dir: 1, loop: false }),
        { index: 2, row: 2 });
});

test('nextLinear returns null without a selected column', () => {
    assert.equal(
        nextLinear({ columnLengths: [2], index: -1, row: 0, dir: 1, loop: true }),
        null);
});

test('stepColumn wraps or refuses', () => {
    assert.equal(stepColumn({ count: 3, index: 2, delta: 1, loop: true }), 0);
    assert.equal(stepColumn({ count: 3, index: 0, delta: -1, loop: true }), 2);
    assert.equal(stepColumn({ count: 3, index: 2, delta: 1, loop: false }), null);
    assert.equal(stepColumn({ count: 3, index: 1, delta: 1, loop: false }), 2);
});

test('stepRow wraps or refuses', () => {
    assert.equal(stepRow({ count: 2, row: 1, delta: 1, loop: true }), 0);
    assert.equal(stepRow({ count: 2, row: 0, delta: -1, loop: true }), 1);
    assert.equal(stepRow({ count: 2, row: 1, delta: 1, loop: false }), null);
    assert.equal(stepRow({ count: 2, row: 0, delta: 1, loop: false }), 1);
});
