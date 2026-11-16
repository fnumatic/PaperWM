import test from 'node:test';
import assert from 'node:assert/strict';

import { fitProportionally, allocateDefault, allocateEqualHeight } from '../../core/layout.js';
import {
    layoutWorkArea, targetWidthForColumn, planRow, ensuredX,
    isAutoCentered, autoPanTargetX, isVisible, isFullyVisible, isPlaceable,
} from '../../core/geometry.js';
import { nextLinear, stepColumn, stepRow } from '../../core/navigation.js';
import { openWindowIndex, swapTarget, slurpPlan, barfTarget } from '../../core/arrangement.js';
import { winpropMatches, selectWinprop } from '../../core/winprops.js';
import { selectDndTarget, sameDndTarget } from '../../core/dnd.js';

/* Freeze nested plain data so accidental mutation throws in strict mode. */
function freezeDeep(value) {
    if (value && typeof value === 'object' && !(value instanceof RegExp)) {
        Object.freeze(value);
        for (const entry of Object.values(value))
            freezeDeep(entry);
    }
    return value;
}

const workArea = freezeDeep({ x: 0, y: 32, width: 1920, height: 1048 });
const frame = freezeDeep({ x: 40, width: 800 });
const columns = freezeDeep([
    { x: 100, width: 800, rows: [{ x: 100, y: 40, width: 800, height: 500 }] },
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
        selectedHeight: 400,
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
    ['ensuredX', () => ensuredX({
        index: 1,
        selectedIndex: 0,
        spaceLength: 3,
        focusMode: 'default',
        fullscreen: false,
        cloneTargetX: 300,
        targetX: -100,
        lastFrameX: 120,
        hasLastFrame: true,
        monitorX: 0,
        isVisible: false,
        frame,
        workArea,
        horizontalMargin: 10,
        windowGap: 8,
        minimumMargin: 6,
    })],
    ['isAutoCentered', () => isAutoCentered({ targetX: 0, containerWidth: 2500, workArea })],
    ['autoPanTargetX', () => autoPanTargetX({ targetX: -200, contentWidth: 1000, workArea })],
    ['isVisible', () => isVisible({ x: 100, width: 500, workArea })],
    ['isFullyVisible', () => isFullyVisible({ x: 0, width: 1919, workArea })],
    ['isPlaceable', () => isPlaceable({
        x: 100, width: 500, workArea, monitorX: 0, stackMargin: 75,
        maximized: false, fullscreen: false,
    })],
    ['nextLinear', () => nextLinear({
        columnLengths: freezeDeep([2, 3]), index: 0, row: 1, dir: 1, loop: false,
    })],
    ['stepColumn', () => stepColumn({ count: 3, index: 2, delta: 1, loop: true })],
    ['stepRow', () => stepRow({ count: 2, row: 1, delta: 1, loop: true })],
    ['openWindowIndex', () => openWindowIndex({ selectedIndex: 1, columnCount: 3, position: 'right' })],
    ['swapTarget', () => swapTarget({
        index: 1, row: 0, columnCount: 3, columnLength: 2, direction: 'down',
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
        columnZoneMargin: 104,
        columnZoneMarginViz: 104,
        rowZoneMargin: 254,
        emptyTargetX: 500,
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
