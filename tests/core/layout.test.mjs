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

test('fitProportionally returns NaN for a zero total (legacy behavior)', () => {
    assert.deepEqual(fitProportionally([0, 0], 100), [NaN, NaN]);
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
            selectedHeight: 400,
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
            selectedHeight: 300,
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
