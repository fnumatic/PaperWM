import test from 'node:test';
import assert from 'node:assert/strict';

import { isVisible, isFullyVisible, isPlaceable } from '../../core/geometry.js';

const workArea = { x: 0, y: 0, width: 1920, height: 1080 };

test('isVisible accepts a window inside the work area', () => {
    assert.equal(isVisible({ x: 100, width: 500, workArea }), true);
});

test('isVisible rejects a window hanging off the left or right edge', () => {
    assert.equal(isVisible({ x: -600, width: 500, workArea }), false);
    assert.equal(isVisible({ x: 2000, width: 500, workArea }), false);
});

test('isVisible honours the margin', () => {
    assert.equal(isVisible({ x: -495, width: 500, workArea, margin: 0 }), true);
    assert.equal(isVisible({ x: -495, width: 500, workArea, margin: 10 }), false);
});

test('isFullyVisible requires the whole window inside the area', () => {
    assert.equal(isFullyVisible({ x: 0, width: 1919, workArea }), true);
    assert.equal(isFullyVisible({ x: 0, width: 1920, workArea }), false);
});

test('isPlaceable rejects windows inside the edge strips', () => {
    assert.equal(isPlaceable({
        x: -600, width: 500, workArea, monitorX: 0, stackMargin: 75,
        maximized: false, fullscreen: false,
    }), false);
    assert.equal(isPlaceable({
        x: 1850, width: 500, workArea, monitorX: 0, stackMargin: 75,
        maximized: false, fullscreen: false,
    }), false);
});

test('isPlaceable accounts for a monitor offset', () => {
    assert.equal(isPlaceable({
        x: 100, width: 500, workArea: { x: 1920, y: 0, width: 1920, height: 1080 },
        monitorX: 1920, stackMargin: 75, maximized: false, fullscreen: false,
    }), true);
});

test('isPlaceable restricts maximized and fullscreen windows', () => {
    assert.equal(isPlaceable({
        x: 100, width: 500, workArea, monitorX: 0, stackMargin: 75,
        maximized: true, fullscreen: false,
    }), false);
    assert.equal(isPlaceable({
        x: 100, width: 500, workArea, monitorX: 0, stackMargin: 75,
        maximized: false, fullscreen: true,
    }), false);
    assert.equal(isPlaceable({
        x: 0, width: 500, workArea, monitorX: 0, stackMargin: 75,
        maximized: false, fullscreen: true,
    }), true);
});
