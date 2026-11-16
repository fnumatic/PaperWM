import test from 'node:test';
import assert from 'node:assert/strict';

import { ensuredX } from '../../core/geometry.js';

const base = {
    index: 1,
    selectedIndex: 0,
    spaceLength: 3,
    focusMode: 'default',
    fullscreen: false,
    cloneTargetX: 300,
    targetX: -100,
    lastFrameX: 120,
    monitorX: 0,
    isVisible: false,
    frameWidth: 600,
    workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    horizontalMargin: 10,
    windowGap: 8,
    minimumMargin: 6,
};

test('ensuredX uses the clone target for neighbours', () => {
    assert.equal(ensuredX({ ...base, selectedIndex: 1 }), 200);
});

test('ensuredX uses the last frame for distant, invisible windows', () => {
    assert.equal(ensuredX({ ...base, selectedIndex: 3, cloneTargetX: 900 }), 120);
});

test('ensuredX centers in center focus mode', () => {
    assert.equal(ensuredX({ ...base, focusMode: 'center' }), 660);
});

test('ensuredX returns 0 for fullscreen', () => {
    assert.equal(ensuredX({ ...base, fullscreen: true }), 0);
});

test('ensuredX centers a single window in a single-column space in edge mode', () => {
    assert.equal(ensuredX({
        ...base, focusMode: 'edge', index: 0, selectedIndex: 0, spaceLength: 1,
    }), 660);
});

test('ensuredX aligns the first window to the left margin in edge mode', () => {
    assert.equal(ensuredX({
        ...base, focusMode: 'edge', index: 0, selectedIndex: 0,
    }), 10);
});

test('ensuredX aligns the last window to the right margin in edge mode', () => {
    assert.equal(ensuredX({
        ...base, focusMode: 'edge', index: 2, selectedIndex: 0, cloneTargetX: 1700,
    }), 1310);
});

test('ensuredX centers a very wide window', () => {
    assert.equal(ensuredX({ ...base, frameWidth: 1800 }), 60);
});

test('ensuredX clamps a window that would overflow the right edge', () => {
    assert.equal(ensuredX({ ...base, cloneTargetX: 1500, selectedIndex: 1 }), 1310);
});

test('ensuredX leaves a margin at the exact right edge', () => {
    assert.equal(ensuredX({
        ...base,
        horizontalMargin: 0,
        cloneTargetX: 1420,
        selectedIndex: 1,
        frameWidth: 600,
    }), 1314);
});

test('ensuredX leaves a margin at the exact left edge', () => {
    assert.equal(ensuredX({
        ...base,
        horizontalMargin: 0,
        cloneTargetX: 100,
        selectedIndex: 1,
        frameWidth: 300,
    }), 6);
});
