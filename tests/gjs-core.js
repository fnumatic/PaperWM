// Run with `gjs -m tests/gjs-core.js`; no desktop or GI objects required.
import { fitProportionally } from '../core/layout.js';
import { ensuredX } from '../core/geometry.js';
import { nextLinear, stepIndex } from '../core/navigation.js';
import { openWindowIndex } from '../core/arrangement.js';
import { winpropMatches } from '../core/winprops.js';
import { sameDndTarget, selectDndTarget } from '../core/dnd.js';

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
print('Core imports and smoke assertions pass in GJS.');
