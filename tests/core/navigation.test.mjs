import test from 'node:test';
import assert from 'node:assert/strict';

import { nextLinear, stepIndex } from '../../core/navigation.js';

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

test('nextLinear without loop refuses to leave the space', () => {
    assert.equal(
        nextLinear({ columnLengths: [2, 3], index: 1, row: 2, dir: 1, loop: false }),
        null);
});

test('nextLinear returns null without a selected column', () => {
    assert.equal(
        nextLinear({ columnLengths: [2], index: -1, row: 0, dir: 1, loop: true }),
        null);
});

test('stepIndex wraps or refuses at either bound', () => {
    assert.equal(stepIndex({ count: 3, index: 2, delta: 1, loop: true }), 0);
    assert.equal(stepIndex({ count: 3, index: 0, delta: -1, loop: true }), 2);
    assert.equal(stepIndex({ count: 3, index: 2, delta: 1, loop: false }), null);
    assert.equal(stepIndex({ count: 3, index: 1, delta: 1, loop: false }), 2);
});

test('stepIndex handles larger steps and an empty collection', () => {
    assert.equal(stepIndex({ count: 4, index: 3, delta: 2, loop: true }), 1);
    assert.equal(stepIndex({ count: 4, index: 0, delta: -2, loop: true }), 2);
    assert.equal(stepIndex({ count: 0, index: 0, delta: 1, loop: true }), null);
});

test('nextLinear skips empty columns in either direction and when wrapping', () => {
    assert.deepEqual(nextLinear({
        columnLengths: [1, 0, 2], index: 0, row: 0, dir: 1, loop: false,
    }), { index: 2, row: 0 });
    assert.deepEqual(nextLinear({
        columnLengths: [1, 0, 2], index: 2, row: 0, dir: -1, loop: false,
    }), { index: 0, row: 0 });
    assert.equal(nextLinear({
        columnLengths: [0, 0], index: 0, row: 0, dir: 1, loop: true,
    }), null);
});
