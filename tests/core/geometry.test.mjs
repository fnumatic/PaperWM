import test from 'node:test';
import assert from 'node:assert/strict';

import {
    layoutWorkArea,
    targetWidthForColumn,
    isAutoCentered,
    autoPanTargetX,
} from '../../core/geometry.js';

const workArea = { x: 0, y: 32, width: 1920, height: 1048 };

test('layoutWorkArea removes the panel height when the topbar is hidden on the primary monitor', () => {
    assert.deepEqual(
        layoutWorkArea({
            workArea,
            panelHeight: 32,
            isPrimary: true,
            showTopBar: false,
            showPositionBar: false,
            selectedFullscreen: false,
        }),
        { x: 0, y: 0, width: 1920, height: 1080 });
});

test('layoutWorkArea keeps the position bar space on the primary monitor', () => {
    assert.deepEqual(
        layoutWorkArea({
            workArea,
            panelHeight: 32,
            isPrimary: true,
            showTopBar: false,
            showPositionBar: true,
            selectedFullscreen: false,
        }),
        workArea);
});

test('layoutWorkArea reserves the panel for the position bar on secondary monitors', () => {
    assert.deepEqual(
        layoutWorkArea({
            workArea,
            panelHeight: 32,
            isPrimary: false,
            showTopBar: true,
            showPositionBar: true,
            selectedFullscreen: false,
        }),
        { x: 0, y: 64, width: 1920, height: 1016 });
});

test('layoutWorkArea uses the full monitor for fullscreen and does not mutate input', () => {
    const input = { ...workArea };
    const result = layoutWorkArea({
        workArea: input,
        panelHeight: 32,
        isPrimary: false,
        showTopBar: false,
        showPositionBar: true,
        selectedFullscreen: true,
    });
    assert.deepEqual(result, { ...workArea, y: 0 });
    assert.deepEqual(input, workArea);
});

test('targetWidthForColumn uses the selected width', () => {
    assert.equal(targetWidthForColumn({
        widths: [800, 400],
        selectedWidth: 800,
        workAreaWidth: 1920,
        minimumMargin: 15,
    }), 800);
});

test('targetWidthForColumn uses the widest row without a selection', () => {
    assert.equal(targetWidthForColumn({
        widths: [800, 1200],
        selectedWidth: null,
        workAreaWidth: 1920,
        minimumMargin: 15,
    }), 1200);
});

test('targetWidthForColumn caps to the work area margins', () => {
    assert.equal(targetWidthForColumn({
        widths: [2000],
        selectedWidth: null,
        workAreaWidth: 1920,
        minimumMargin: 15,
    }), 1890);
});

test('isAutoCentered detects centered and right-overflowing content', () => {
    assert.equal(isAutoCentered({
        targetX: 0, containerWidth: 2500, workArea,
    }), true);
    assert.equal(isAutoCentered({
        targetX: Math.round((1920 - 1000) / 2), containerWidth: 1000, workArea,
    }), true);
    assert.equal(isAutoCentered({
        targetX: -500, containerWidth: 1000, workArea,
    }), false);
});

test('autoPanTargetX centers content narrower than the work area', () => {
    assert.equal(autoPanTargetX({
        targetX: -200, contentWidth: 1000, workArea,
    }), 460);
});

test('autoPanTargetX clamps overflowing content to the right edge', () => {
    assert.equal(autoPanTargetX({
        targetX: -4000, contentWidth: 2500, workArea,
    }), -580);
});

test('autoPanTargetX keeps the offset when no branch applies', () => {
    assert.equal(autoPanTargetX({
        targetX: -100, contentWidth: 2500, workArea,
    }), -100);
});
