// Run with `gjs -m tests/gjs-core.js`; no desktop or GI objects required.
import { fitProportionally } from '../core/layout.js';
import { ensuredX, reconcileRow } from '../core/geometry.js';
import { nextLinear, stepIndex } from '../core/navigation.js';
import { openWindowIndex } from '../core/arrangement.js';
import { winpropMatches } from '../core/winprops.js';
import { sameDndTarget, selectDndTarget } from '../core/dnd.js';
import { computeOverviewLayout, computeOverviewScale, computeOverviewSlots } from '../core/overview.js';
import {
    projectGlide, selectTargetWindow, snapGlideTarget, adjustGlideDuration,
} from '../core/gestures.js';
import { planMinimapLayout, planMinimapSelection } from '../core/minimap.js';

function equal(actual, expected) {
    if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

equal(fitProportionally([100, 200], 900), [300, 600]);
equal(fitProportionally([1, 1, 1, 1], 2), [0, 0, 1, 1]);
equal(stepIndex({ count: 4, index: 3, delta: 2, loop: true }), 1);
equal(openWindowIndex({ selectedIndex: 1, columnCount: 3, position: 'right' }), 2);
equal(nextLinear({ columnLengths: [2, 3], index: 0, row: 1, dir: 1, loop: false }),
    { index: 1, row: 0 });
equal(ensuredX({
    index: 0, selectedIndex: 0, spaceLength: 1, focusMode: 'center',
    fullscreen: false, cloneTargetX: 0, targetX: 0, frameWidth: 600,
    workArea: { x: 0, width: 1920 }, horizontalMargin: 10, windowGap: 8,
}), 660);
const pattern = Object.freeze(/Firefox/y);
equal(winpropMatches({ wmClass: 'Firefox' }, { wm_class: pattern }), true);
equal(winpropMatches({ wmClass: 'Firefox' }, { wm_class: pattern }), true);
equal(sameDndTarget({ position: [1, 2] }, { position: [1, 2] }), true);
equal(selectDndTarget({
    columns: [
        [{ x: 20, y: 40, width: 800, height: 500 }],
        [{ x: 840, y: 40, width: 800, height: 500 }],
    ],
    x: 750, y: 300, gap: 20, viewportWidth: 1920, scrollOffsetX: 0,
}).position, [1]);
const overview = computeOverviewLayout({
    windows: [{ width: 800, height: 600 }],
    numRows: 1, monitorHeight: 1080, minWindowsPerRow: 2,
});
const { scale } = computeOverviewScale({
    layout: overview, area: { x: 0, y: 0, width: 1920, height: 1080 },
    maxScale: 0.9, columnSpacing: 10, rowSpacing: 20,
});
const slots = computeOverviewSlots({
    layout: overview, area: { x: 0, y: 0, width: 1920, height: 1080 },
    windows: [{ width: 800, height: 600 }],
    scale, maxScale: 0.9, columnSpacing: 10, rowSpacing: 20, monitorHeight: 1080,
});
equal(slots.length, 1);
equal(slots[0][4], 0);
equal(reconcileRow({
    before: { width: 800, height: 600 },
    requested: { width: 400, height: 300 },
    observed: { width: 500, height: 400 },
}), { width: 500, height: 400, needsRelayout: true });
equal(projectGlide({ targetX: -100, velocity: 2, friction: 0.32 }),
    { targetX: -200, duration: 100, distance: 100 });
equal(snapGlideTarget({
    targetX: 10, scrollX: -50, containerWidth: 2000, viewportWidth: 1000,
}), { targetX: 0, anchor: 'first' });
equal(adjustGlideDuration({
    duration: 100, distance: 100, startX: 0, targetX: -50,
    projectedTarget: -100, snapped: false,
}), 200);
equal(selectTargetWindow({
    windows: [{ x: -150, width: 200 }, { x: 900, width: 200 }],
    selected: null, targetX: 0, workArea: { x: 0, width: 1000 }, direction: true,
}), 1);
const rectangle = { x: 0, y: 0, width: 800, height: 600 };
const minimap = planMinimapLayout({
    columns: [[{ frame: rectangle, buffer: rectangle }]],
    monitor: { x: 0, y: 0, width: 1920, height: 1080 },
    scale: 0.1, gap: 8,
});
equal(minimap.content, { width: 80, height: 60 });
equal(planMinimapSelection({
    layout: minimap, position: [0, 0], labelWidth: 50, gap: 8, containerX: 0,
}).visible, true);
print('Core imports and smoke assertions pass in GJS.');
