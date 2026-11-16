import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import {
    addSwipeSample,
    adjustGlideDuration,
    projectGlide,
    selectTargetWindow,
    snapGlideTarget,
    swipeVelocity,
} from '../../core/gestures.js';

/* Execute the actual gesture module without its GNOME import graph. */
function loadGestures() {
    let source = readFileSync(new URL('../../gestures.js', import.meta.url), 'utf8');
    source = source.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\s*$/gm, '');
    source = source.replace(/^export /gm, '');
    source += `
;({
    update,
    done,
    findTargetWindow,
    horizontalTouchScroll,
    getSamples: () => samples,
    resetSamples: () => { samples = []; },
    setStart: value => { start = value; },
})`;
    return source;
}

function createAdapter({ friction = 0.32, ensuredX = () => 0 } = {}) {
    const events = [];
    const settings = {
        prefs: {
            swipe_sensitivity: [1, 1],
            swipe_friction: [friction, 0.1],
        },
    };
    const tiling = {
        inPreview: true,
        updateSelection: (space, selected) => events.push(['selection', selected]),
        ensuredX,
    };
    const navigator = { finish: () => events.push(['finish']) };
    const easer = {
        removeEase: () => events.push(['removeEase']),
        addEase: (actor, params) => events.push(['addEase', actor, params]),
    };
    const api = runInNewContext(loadGestures(), {
        Clutter: {
            EVENT_STOP: 1,
            EVENT_PROPAGATE: 0,
            TouchpadGesturePhase: { UPDATE: 1, END: 2, CANCEL: 3, BEGIN: 4 },
            EventType: { TOUCHPAD_SWIPE: 10, TOUCH_BEGIN: 11, TOUCH_UPDATE: 12, TOUCH_END: 13, TOUCH_CANCEL: 14 },
            AnimationMode: { EASE_OUT_QUAD: 20, EASE_OUT_BACK: 21 },
        },
        Settings: settings,
        Tiling: tiling,
        Easer: easer,
        Navigator: { getNavigator: () => navigator },
        Patches: { swipeTrackers: [] },
        Utils: {},
        Gio: {},
        GLib: {},
        Meta: {},
        Shell: {},
        Main: { overview: {}, actionMode: 0 },
        addSwipeSample,
        adjustGlideDuration,
        projectGlide,
        selectTargetWindow,
        snapGlideTarget,
        swipeVelocity,
    });
    return { api, settings, tiling, events };
}

function makeWindow(x, width = 200) {
    return {
        clone: { x, targetX: x, width },
        meta_window: { id: `${x}:${width}` },
        lastFrame: { x },
    };
}

function makeSpace({
    windows = [], selectedWindow = null, targetX = 0, width = 1920,
    workArea = { x: 0, width: 1920 }, containerX = targetX, containerWidth = width,
} = {}) {
    const space = windows.slice();
    space.selectedWindow = selectedWindow;
    space.targetX = targetX;
    space.width = width;
    space.vx = 0;
    space.hState = 1;
    space.cloneContainer = { x: containerX, width: containerWidth };
    space.workArea = () => workArea;
    space.getWindows = () => windows;
    space.emit = () => {};
    return space;
}

test('the facade maps -1/false left and 1/true right with the same windows', () => {
    const window0 = makeWindow(0, 100);
    const window1 = makeWindow(500, 100);
    window1.clone.x = -1000; // selected clone is off-screen; direction decides
    const space = makeSpace({
        windows: [window0, window1],
        selectedWindow: window1,
        width: 1000,
        workArea: { x: 0, width: 1000 },
    });
    const { api } = createAdapter();

    assert.equal(api.findTargetWindow(space, 1), window0);
    assert.equal(api.findTargetWindow(space, -1), window1);
    assert.equal(api.findTargetWindow(space, true), window0);
    assert.equal(api.findTargetWindow(space, false), window1);
});

test('a stale selected window is ignored instead of being returned', () => {
    const removed = makeWindow(100);
    const window0 = makeWindow(100);
    const space = makeSpace({
        windows: [window0],
        selectedWindow: removed,
        width: 1000,
        workArea: { x: 0, width: 1000 },
    });
    const { api } = createAdapter();
    assert.equal(api.findTargetWindow(space, 1), window0);
});

test('the facade compares the selected clone live x, not its target x', () => {
    const window0 = makeWindow(0, 100);
    const window1 = makeWindow(950, 100);
    window1.clone.x = 900;
    const space = makeSpace({
        windows: [window0, window1],
        selectedWindow: window1,
        width: 1000,
        workArea: { x: 0, width: 1000 },
    });
    const { api } = createAdapter();
    assert.equal(api.findTargetWindow(space, 1), window1);
});

test('update keeps only three samples and leaves the live target in place', () => {
    const window0 = makeWindow(0);
    const space = makeSpace({
        windows: [window0],
        selectedWindow: window0,
        width: 1000,
        workArea: { x: 0, width: 1000 },
    });
    const { api } = createAdapter();
    api.resetSamples();
    api.setStart(0);

    for (const time of [0, 10, 20, 30])
        api.update(space, 10, time);

    assert.equal(space.targetX, -40);
    assert.equal(space.cloneContainer.x, -40);
    assert.equal(space.vx, 1.5);
    assert.equal(api.getSamples().length, 3);
    assert.deepEqual(api.getSamples().map(sample => sample.dx), [10, 10, 10]);
});

test('update without a start and with equal sample times stays finite and bounded', () => {
    const window0 = makeWindow(0);
    const space = makeSpace({
        windows: [window0],
        selectedWindow: window0,
        width: 1000,
        workArea: { x: 0, width: 1000 },
    });
    space.vx = undefined;
    const { api } = createAdapter();
    api.resetSamples();
    api.setStart(undefined);

    for (let i = 0; i < 5; i++)
        api.update(space, 1, 1);

    assert.equal(space.targetX, -5);
    assert.equal(space.cloneContainer.x, -5);
    assert.equal(space.vx, undefined);
    assert.equal(api.getSamples().length, 3);
});

test('update on an empty space does not throw or keep a selected window', () => {
    const space = makeSpace({ width: 1000, workArea: { x: 0, width: 1000 } });
    const { api } = createAdapter();
    api.resetSamples();
    api.setStart(0);
    assert.doesNotThrow(() => api.update(space, 10, 0));
    assert.equal(space.selectedWindow, undefined);
    assert.equal(space.targetX, -10);
});

test('done glides to the ensured target and invalidates the selected frame', () => {
    const window0 = makeWindow(0, 400);
    const space = makeSpace({
        windows: [window0],
        selectedWindow: window0,
        width: 1920,
        workArea: { x: 0, width: 1920 },
        containerWidth: 400,
    });
    space.vx = 2;
    const { api, events } = createAdapter({ ensuredX: () => 0 });
    api.setStart(0);

    api.done(space);

    assert.equal(window0.lastFrame, undefined);
    assert.equal(space.selectedWindow, window0);
    assert.equal(space.targetX, 0);
    const ease = events.find(([name]) => name === 'addEase')[2];
    assert.equal(ease.x, 0);
    assert.equal(ease.duration, 200);
    assert.ok(Number.isFinite(ease.duration));
});

test('done passes the projected target to ensuredX before writing it', () => {
    const window0 = makeWindow(0, 400);
    const space = makeSpace({
        windows: [window0],
        selectedWindow: window0,
        width: 1920,
        workArea: { x: 0, width: 1920 },
        containerWidth: 400,
    });
    space.vx = 2;
    let passedOffset;
    const { api } = createAdapter({
        ensuredX: (selected, passedSpace, offset) => {
            assert.equal(selected, window0);
            assert.equal(passedSpace.targetX, 0);
            passedOffset = offset;
            return 0;
        },
    });
    api.setStart(0);

    api.done(space);

    assert.equal(passedOffset, -100);
    assert.equal(space.targetX, 0);
});

test('done delegates edge snapping and animates the anchored column', () => {
    const firstWindow = makeWindow(0, 400);
    const secondWindow = makeWindow(500, 400);
    const space = makeSpace({
        windows: [firstWindow, secondWindow],
        selectedWindow: firstWindow,
        width: 1000,
        workArea: { x: 0, width: 1000 },
        targetX: -100,
        containerX: -100,
        containerWidth: 2200,
    });
    space.length = 0;
    space.push([firstWindow], [secondWindow]);
    space.vx = 8;
    let passedOffset;
    const { api, events } = createAdapter({
        ensuredX: (selected, _space, offset) => {
            passedOffset = offset;
            return selected.clone.targetX;
        },
    });
    api.setStart(-100);

    api.done(space);

    assert.equal(passedOffset, -1200);
    assert.equal(space.selectedWindow, secondWindow);
    assert.equal(space.targetX, 0);
    const ease = events.find(([name]) => name === 'addEase')[2];
    assert.equal(ease.mode, 21);
    assert.equal(ease.x, 0);
    assert.equal(ease.duration, 200);
});

test('done with zero friction still schedules a finite animation', () => {
    const window0 = makeWindow(-300, 400);
    const space = makeSpace({
        windows: [window0],
        selectedWindow: window0,
        targetX: -300,
        containerX: -300,
        width: 1920,
        workArea: { x: 0, width: 1920 },
        containerWidth: 400,
    });
    space.vx = 2;
    const { api, events } = createAdapter({ friction: 0, ensuredX: () => 0 });
    api.setStart(-300);

    assert.doesNotThrow(() => api.done(space));

    const ease = events.find(([name]) => name === 'addEase')[2];
    assert.ok(Number.isFinite(ease.x));
    assert.ok(Number.isFinite(ease.duration));
    assert.ok(ease.duration >= 0);
});

test('done with columns but no windows ends without dereferencing a missing selection', () => {
    const space = makeSpace({ width: 1920, workArea: { x: 0, width: 1920 } });
    space.push([]); // a column exists, but getWindows() stays empty
    space.vx = 2;
    const { api, events } = createAdapter();
    api.setStart(0);

    assert.doesNotThrow(() => api.done(space));
    assert.equal(space.hState, -1);
    assert.equal(events.some(([name]) => name === 'addEase'), false);
});

test('the facade keeps the first row of the last column for the fallback', () => {
    const top = makeWindow(-500, 100);
    const bottom = makeWindow(-500, 100);
    const space = makeSpace({
        windows: [top, bottom],
        width: 1000,
        workArea: { x: 0, width: 1000 },
    });
    space.length = 0;
    space.push([top, bottom]);
    space.getWindow = (index, row) => space[index]?.[row];
    const { api } = createAdapter();
    assert.equal(api.findTargetWindow(space, 1), top);
});

test('the facade accepts a projected target without assigning the space target', () => {
    const window0 = makeWindow(100, 200);
    const space = makeSpace({
        windows: [window0],
        selectedWindow: window0,
        width: 1000,
        workArea: { x: 0, width: 1000 },
    });
    const { api } = createAdapter();
    assert.equal(api.findTargetWindow(space, 1, -500), window0);
    assert.equal(space.targetX, 0);
});

test('touch completion preserves tap propagation but consumes an actual swipe', () => {
    for (const [distance, expected] of [[5, 0], [50, 1]]) {
        const window = makeWindow(0, 400);
        const space = makeSpace({ windows: [window], selectedWindow: window });
        const { api } = createAdapter({ friction: 0 });
        const event = (type, x, time) => ({
            type: () => type, get_coords: () => [x, 0], get_time: () => time,
        });
        api.horizontalTouchScroll.call(space, null, event(11, 0, 10000));
        api.horizontalTouchScroll.call(space, null, event(12, distance, 10100));
        assert.equal(api.horizontalTouchScroll.call(space, null, event(13, distance, 10200)), expected);
    }
});

test('touch samples use the same time scale at begin and update', () => {
    const window = makeWindow(0, 400);
    const space = makeSpace({ windows: [window], selectedWindow: window });
    const { api } = createAdapter();
    const event = (type, x, time) => ({
        type: () => type, get_coords: () => [x, 0], get_time: () => time,
    });
    api.horizontalTouchScroll.call(space, null, event(11, 0, 10000));
    api.horizontalTouchScroll.call(space, null, event(12, 100, 10100));
    assert.equal(space.vx, -100 / 75);
});
