import test from 'node:test';
import assert from 'node:assert/strict';

import {
    findNext, findPrev, eq, zip, sum, in_bounds, swap,
} from '../../lib.js';
import { AcceleratorParse } from '../../acceleratorparse.js';

test('findNext returns the next larger value and cycles', () => {
    assert.equal(findNext(3, [0, 5, 10]), 5);
    assert.equal(findNext(10, [0, 5, 10]), 0);
});

test('findNext honours slack', () => {
    assert.equal(findNext(5.4, [5, 10], 1), 10);
});

test('findPrev returns the previous value and cycles', () => {
    assert.equal(findPrev(6, [0, 5, 10]), 5);
    assert.equal(findPrev(-1, [0, 5, 10]), 10);
});

test('eq compares with an epsilon', () => {
    assert.equal(eq(1, 1 + 1e-9), true);
    assert.equal(eq(1, 1.1), false);
});

test('zip stops at the shortest array', () => {
    assert.deepEqual(zip([1, 2, 3], ['a', 'b']), [[1, 'a'], [2, 'b']]);
});

test('sum and in_bounds handle empty input', () => {
    assert.equal(sum([]), 0);
    assert.equal(in_bounds([], 0), false);
});

test('swap exchanges two entries in place', () => {
    const values = [1, 2, 3];
    swap(values, 0, 2);
    assert.deepEqual(values, [3, 2, 1]);
});

test('accelerator parsing returns keyval and modifiers', () => {
    const parser = new AcceleratorParse();
    assert.deepEqual(parser.accelerator_parse('<Super>Left'), [true, 65361, 67108864]);
});

test('accelerator parsing rejects an unknown key', () => {
    const parser = new AcceleratorParse();
    assert.equal(parser.accelerator_parse('<Super>NoSuchKey').at(0), false);
});
