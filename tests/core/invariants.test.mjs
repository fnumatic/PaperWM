import test from 'node:test';
import assert from 'node:assert/strict';
import { fitProportionally, allocateDefault, allocateEqualHeight } from '../../core/layout.js';
import { nextLinear } from '../../core/navigation.js';
import { openWindowIndex } from '../../core/arrangement.js';

test('rounding a proportional fit never creates negative row heights', () => {
    const result = fitProportionally([1, 1, 1, 1], 2);
    assert.ok(result.every(height => height >= 0), JSON.stringify(result));
    assert.equal(result.reduce((sum, height) => sum + height, 0), 2);
});

test('default allocation derives selection height from the supplied heights', () => {
    assert.deepEqual(allocateDefault({
        heights: [400, 600], selectedIndex: 0, gap: 10, availableHeight: 1000,
    }), [400, 590]);
});

test('cramped default allocations stay non-negative and within the row budget', () => {
    for (const [heights, selectedIndex, availableHeight] of [
        [[20, 100], 0, 50],
        [[100, 100, 100], null, 100],
    ]) {
        const result = allocateDefault({
            heights, selectedIndex,
            gap: 10, availableHeight,
        });
        const budget = availableHeight - (heights.length - 1) * 10;
        assert.ok(result.every(height => height >= 0), JSON.stringify(result));
        assert.equal(result.reduce((sum, height) => sum + height, 0), budget);
    }
});

test('linear navigation does not return a row in an empty column', () => {
    const columnLengths = [1, 0, 1];
    const result = nextLinear({ columnLengths, index: 0, row: 0, dir: 1, loop: false });
    assert.ok(result === null || result.row < columnLengths[result.index]);
});

test('insertion decisions return positions in the closed range zero to count', () => {
    for (const position of ['left', 'right', 'start', 'end']) {
        const index = openWindowIndex({ selectedIndex: null, columnCount: 3, position });
        assert.ok(index >= 0 && index <= 3, `${position}: ${index}`);
    }
});

test('small exhaustive allocations satisfy dimension and budget invariants', () => {
    for (let count = 1; count <= 20; count++) {
        for (const availableHeight of [0, 3, 50, 100, 500, 1008]) {
            for (const gap of [0, 8, 20, 60]) {
                const heights = Array.from({ length: count }, (_, i) => (i % 4) * 50);
                const budget = Math.max(0, availableHeight - (count - 1) * gap);
                for (const selectedIndex of [null, -1, 0, count - 1]) {
                    const result = allocateDefault({ heights, selectedIndex, gap, availableHeight });
                    assert.equal(result.length, count);
                    assert.ok(result.every(height => Number.isFinite(height) && height >= 0));
                    assert.equal(result.reduce((sum, height) => sum + height, 0), budget);
                }
                const equal = allocateEqualHeight({ count, gap, available: availableHeight });
                assert.ok(equal.every(height => Number.isFinite(height) && height >= 0));
                assert.ok(equal.reduce((sum, height) => sum + height, 0) <= budget);
            }
        }
    }
});

test('navigation across sparse columns always returns an existing row or null', () => {
    for (const columnLengths of [[0], [1, 0], [0, 2], [1, 0, 2], [0, 0, 0]]) {
        for (let index = 0; index < columnLengths.length; index++) {
            for (let row = 0; row < columnLengths[index]; row++) {
                for (const dir of [-1, 1]) {
                    for (const loop of [false, true]) {
                        const target = nextLinear({ columnLengths, index, row, dir, loop });
                        if (target) {
                            assert.ok(target.index >= 0 && target.index < columnLengths.length);
                            assert.ok(target.row >= 0 && target.row < columnLengths[target.index]);
                        }
                    }
                }
            }
        }
    }
});
