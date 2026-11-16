import test from 'node:test';
import assert from 'node:assert/strict';

import {
    fitProportionally,
    allocateDefault,
    allocateEqualHeight,
} from '../../core/layout.js';

test('fitProportionally scales to the target sum', () => {
    assert.deepEqual(fitProportionally([100, 200], 900), [300, 600]);
});

test('fitProportionally puts the rounding remainder on the first value', () => {
    assert.deepEqual(fitProportionally([100, 100], 999), [499, 500]);
});

test('fitProportionally spreads evenly for a zero total', () => {
    assert.deepEqual(fitProportionally([0, 0], 100), [50, 50]);
    assert.deepEqual(fitProportionally([0, 0, 0], 100), [34, 33, 33]);
});

test('fitProportionally returns an empty array for empty input', () => {
    assert.deepEqual(fitProportionally([], 100), []);
});

test('allocateDefault ignores an invalid selection index', () => {
    assert.deepEqual(
        allocateDefault({ heights: [100, 300], selectedIndex: -1, gap: 0, availableHeight: 800 }),
        [200, 600]);
});

test('allocateDefault gives a single row the whole height', () => {
    assert.deepEqual(
        allocateDefault({ heights: [500], selectedIndex: null, gap: 10, availableHeight: 900 }),
        [900]);
});

test('allocateDefault keeps the selected row and fits the rest', () => {
    assert.deepEqual(
        allocateDefault({
            heights: [400, 600],
            selectedIndex: 0,
            gap: 10,
            availableHeight: 1000,
        }),
        [400, 590]);
});

test('allocateDefault applies the minimum height deficit to the selected row', () => {
    assert.deepEqual(
        allocateDefault({
            heights: [300, 60, 60],
            selectedIndex: 0,
            gap: 5,
            availableHeight: 400,
        }),
        [290, 50, 50]);
});

test('allocateDefault without selection fits all rows', () => {
    assert.deepEqual(
        allocateDefault({
            heights: [100, 300],
            selectedIndex: null,
            gap: 0,
            availableHeight: 800,
        }),
        [200, 600]);
});

test('allocateEqualHeight floors and drops the remainder', () => {
    assert.deepEqual(
        allocateEqualHeight({ count: 3, gap: 10, available: 100 }),
        [26, 26, 26]);
});
