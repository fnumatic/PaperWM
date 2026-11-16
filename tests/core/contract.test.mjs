import test from 'node:test';
import assert from 'node:assert/strict';

import { fitProportionally, allocateDefault, allocateEqualHeight } from '../../core/layout.js';
import {
    layoutWorkArea, targetWidthForColumn, planRow, ensuredX,
    autoPanTargetX, isVisible, isFullyVisible, isPlaceable, reconcileRow, grabColumnHeights,
} from '../../core/geometry.js';
import { nextLinear, stepIndex } from '../../core/navigation.js';
import { openWindowIndex, swapTarget, slurpPlan, barfTarget } from '../../core/arrangement.js';
import { winpropMatches, selectWinprop } from '../../core/winprops.js';
import { selectDndTarget, sameDndTarget } from '../../core/dnd.js';

/* Freeze nested plain data so accidental mutation throws in strict mode. */
function freezeDeep(value) {
    if (value && typeof value === 'object') {
        Object.freeze(value);
        for (const entry of Object.values(value))
            freezeDeep(entry);
    }
    return value;
}

const workArea = freezeDeep({ x: 0, y: 32, width: 1920, height: 1048 });
const frame = freezeDeep({ x: 40, width: 800 });
const columns = freezeDeep([
    [{ x: 100, y: 40, width: 800, height: 500 }],
]);
const props = freezeDeep([
    { wm_class: 'Other' },
    { wm_class: '*', scratch_layer: true },
]);

const cases = [
    ['fitProportionally', () => fitProportionally(freezeDeep([100, 200]), 900)],
    ['allocateDefault', () => allocateDefault({
        heights: freezeDeep([400, 600]),
        selectedIndex: 0,
        gap: 10,
        availableHeight: 1000,
    })],
    ['allocateEqualHeight', () => allocateEqualHeight({ count: 3, gap: 10, available: 100 })],
    ['layoutWorkArea', () => layoutWorkArea({
        workArea,
        panelHeight: 32,
        isPrimary: true,
        showTopBar: false,
        showPositionBar: false,
        selectedFullscreen: false,
    })],
    ['targetWidthForColumn', () => targetWidthForColumn({
        widths: freezeDeep([800, 1200]),
        selectedWidth: null,
        workAreaWidth: 1920,
        minimumMargin: 15,
    })],
    ['planRow', () => planRow({
        y: 32,
        targetWidth: 800,
        targetHeight: 500,
        gap: 8,
        verticalMargin: 4,
        workAreaWidth: 1920,
        horizontalMargin: 10,
        resizable: true,
        frameWidth: 800,
        frameHeight: 500,
        maximizedVertically: false,
        preferredWidth: freezeDeep({ value: 50, unit: '%' }),
    })],
    ['reconcileRow', () => reconcileRow(freezeDeep({
        before: { width: 800, height: 600 },
        requested: { width: 400, height: 300 },
        observed: { width: 500, height: 400 },
    }))],
    ['grabColumnHeights', () => grabColumnHeights(freezeDeep({
        yGrabRel: 100, grabHeight: 300, y0: 32, gap: 10,
        availableHeight: 1000, columnLength: 3, index: 1,
    }))],
    ['ensuredX', () => ensuredX({
        index: 1,
        selectedIndex: 0,
        spaceLength: 3,
        focusMode: 'default',
        fullscreen: false,
        cloneTargetX: 300,
        targetX: -100,
        lastFrameX: 120,
        isVisible: false,
        frameWidth: frame.width,
        workArea,
        horizontalMargin: 10,
        windowGap: 8,
    })],
    ['autoPanTargetX', () => autoPanTargetX({
        targetX: -200, containerWidth: 2500, contentWidth: 1000, workArea,
    })],
    ['isVisible', () => isVisible({ x: 100, width: 500, workArea })],
    ['isFullyVisible', () => isFullyVisible({ x: 0, width: 1919, workArea })],
    ['isPlaceable', () => isPlaceable({
        x: 100, width: 500, workArea, stackMargin: 75,
        maximized: false, fullscreen: false,
    })],
    ['nextLinear', () => nextLinear({
        columnLengths: freezeDeep([2, 3]), index: 0, row: 1, dir: 1, loop: false,
    })],
    ['stepIndex', () => stepIndex({ count: 3, index: 2, delta: 1, loop: true })],
    ['openWindowIndex', () => openWindowIndex({ selectedIndex: 1, columnCount: 3, position: 'right' })],
    ['swapTarget', () => swapTarget({
        index: 1, row: 0, columnLengths: freezeDeep([2, 2, 2]), direction: 'down',
    })],
    ['slurpPlan', () => slurpPlan({
        index: 0, columnLengths: freezeDeep([2, 1]), direction: 'right', insertAt: 'bottom',
    })],
    ['barfTarget', () => barfTarget({ index: 0, columnLength: 2, direction: 'right' })],
    ['winpropMatches', () => winpropMatches({ wmClass: 'Firefox', title: 'x' }, props[0])],
    ['selectWinprop', () => selectWinprop({ wmClass: 'Firefox', title: 'x', props })],
    ['selectDndTarget', () => selectDndTarget({
        columns,
        x: 100,
        y: 300,
        gap: 8,
        viewportWidth: 1920,
        scrollOffsetX: 0,
    })],
    ['sameDndTarget', () => sameDndTarget(
        freezeDeep({ position: [1, 2] }), freezeDeep({ position: [1, 2] }))],
];

for (const [name, run] of cases) {
    test(`${name} accepts frozen input and replays deterministically`, () => {
        const first = run();
        const second = run();
        assert.deepEqual(first, second, `${name} is not deterministic`);
    });
}
