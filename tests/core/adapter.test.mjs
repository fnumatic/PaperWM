import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { swapTarget } from '../../core/arrangement.js';
import {
    planRow, reconcileRow, grabColumnHeights, layoutWorkArea, targetWidthForColumn,
    ensuredX as ensuredXCore,
} from '../../core/geometry.js';
import { selectDndTarget, sameDndTarget } from '../../core/dnd.js';
import { swap } from '../../lib.js';

// Execute the actual method body without importing the GNOME module graph.
function method(file, name, bindings) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    const body = source.match(new RegExp(`^    ${name}\\([^\\n]*\\) \\{[\\s\\S]*?^    \\}`, 'm'));
    assert.ok(body, `${name} method not found`);
    return runInNewContext(`({${body[0]}}).${name}`, bindings);
}

test('Space.swap exchanges entire columns even when the destination is shorter', () => {
    const events = [];
    const space = [['a', 'b', 'c'], ['d']];
    Object.assign(space, {
        selectedWindow: 'c',
        positionOf: () => [0, 2],
        layout: () => events.push('layout'),
        emit: (...args) => events.push(args),
    });
    const swapWindow = method('../../tiling.js', 'swap', {
        swapTarget,
        Lib: { swap },
        Meta: { MotionDirection: { LEFT: 0, RIGHT: 1, DOWN: 2, UP: 3 } },
        ensureViewport: window => events.push(['viewport', window]),
    });
    swapWindow.call(space, 1);
    assert.deepEqual(space.slice(), [['d'], ['a', 'b', 'c']]);
    assert.equal(space.selectedWindow, 'c');
    assert.deepEqual(events[1], ['swapped', 0, 1, 2, 2]);
    assert.deepEqual(events[2], ['viewport', 'c']);
});

test('a stale selected window does not crash Space.swap', () => {
    const swapWindow = method('../../tiling.js', 'swap', {});
    assert.doesNotThrow(() => swapWindow.call({ positionOf: () => false }, 1, 'gone'));
});

test('column advance covers the widest row and preferred widths do not leak to later rows', () => {
    const layout = method('../../tiling.js', 'layoutColumnSimple', {
        planRow, reconcileRow, isMaximized: () => false,
        Settings: { prefs: { window_gap: 8, vertical_margin: 4, horizontal_margin: 10 } },
    });
    function window(width, preferredWidth) {
        let frame = { x: 0, y: 0, width, height: 100 };
        return {
            preferredWidth, clone: { x: 0, y: 0 },
            get_frame_rect: () => frame,
            move_resize_frame: (_, x, y, width, height) => { frame = { x, y, width, height }; },
        };
    }
    const space = { workArea: () => ({ width: 1920 }) };
    for (const windows of [
        [window(800), window(450, { value: 450, unit: 'px' })],
        [window(450, { value: 450, unit: 'px' }), window(800)],
    ]) {
        const result = layout.call(space, windows, 20, 0, 800, [100, 100], 0);
        assert.equal(result[0], 800);
    }
    const windows = [window(450, { value: 450, unit: 'px' }), window(800)];
    layout.call(space, windows, 20, 0, 800, [100, 100], 0);
    assert.equal(windows[1]._targetWidth, 800);
});

test('a rejected shrink leaves enough room for the observed window size', () => {
    const layout = method('../../tiling.js', 'layoutColumnSimple', {
        planRow, reconcileRow, isMaximized: () => false,
        Settings: { prefs: { window_gap: 8, vertical_margin: 4, horizontal_margin: 10 } },
    });
    const windows = [0, 1].map(() => ({
        clone: { x: 0, y: 0 }, preferredWidth: { value: 450, unit: 'px' },
        get_frame_rect: () => ({ x: 0, y: 0, width: 800, height: 200 }),
        move_resize_frame: () => {},
    }));
    const result = layout.call({ workArea: () => ({ width: 1920 }) },
        windows, 20, 0, 800, [100, 100], 0);
    assert.equal(result[0], 800);
    assert.equal(windows[1].clone.targetY, 208);
});

test('grab column advance includes rows wider than the anchor', () => {
    const anchor = { get_frame_rect: () => ({ y: 100, width: 400, height: 300 }) };
    const column = [{ get_frame_rect: () => ({ height: 50 }) }, anchor];
    const layout = method('../../tiling.js', 'layoutGrabColumn', {
        grabColumnHeights, fitProportionally: heights => heights,
        Settings: { prefs: { window_gap: 10 } },
    });
    const space = {
        monitor: { y: 0 },
        layoutColumnSimple: windows => [windows.includes(anchor) ? 400 : 800, false, 410],
    };
    const result = layout.call(space, column, 10, 0, 1000, 0, anchor);
    assert.equal(result[0], 800);
});

test('layout releases its reentrancy guard when an effect throws', () => {
    const layout = method('../../tiling.js', 'layout', {
        Settings: { prefs: { animation_time: 0, window_gap: 8 } },
        Main: { layoutManager: { primaryMonitor: {} } },
        Topbar: { panelBox: { height: 32 } },
        layoutWorkArea: ({ workArea }) => workArea,
    });
    const failure = new Error('startAnimate failed');
    const space = {
        _populated: true,
        selectedIndex: () => -1,
        workArea: () => ({ x: 0, y: 0, width: 1000, height: 800 }),
        startAnimate: () => { throw failure; },
    };
    assert.throws(() => layout.call(space), failure);
    assert.equal(space._inLayout, false);
});

test('zero-width work areas do not start an unfinished animation', () => {
    let animations = 0;
    const layout = method('../../tiling.js', 'layout', {
        Settings: { prefs: { animation_time: 0, window_gap: 8 } },
    });
    const space = {
        _populated: true,
        selectedIndex: () => -1,
        workArea: () => ({ x: 0, y: 0, width: 0, height: 800 }),
        startAnimate: () => { animations++; },
    };
    layout.call(space);
    assert.equal(animations, 0);
    assert.ok(!space._inLayout);
});

test('layout keeps the five-retry budget across columns and ignores actorless selection', () => {
    const monitor = {};
    const attempted = [], allocations = [];
    const gone = { get_compositor_private: () => null };
    const first = {
        get_compositor_private: () => ({}),
        get_frame_rect: () => ({ width: 400, height: 600 }),
    };
    const second = { ...first };
    const layout = method('../../tiling.js', 'layout', {
        Settings: { prefs: { animation_time: 0, window_gap: 8, minimum_margin: 10 } },
        Main: { layoutManager: { primaryMonitor: monitor } },
        Topbar: { panelBox: { height: 32 } },
        inGrab: null, layoutWorkArea, targetWidthForColumn,
        allocateDefault: (_column, _height, selected) => { allocations.push(selected); return [600]; },
        autoPanTargetX: () => null,
    });
    const space = Object.assign([[gone, first], [second]], {
        _populated: true, monitor, selectedWindow: gone,
        showTopBar: true, showPositionBar: false,
        workArea: () => ({ x: 0, y: 32, width: 1000, height: 800 }),
        startAnimate() {}, moveDone() {}, emit() {},
        getWindows: () => [first, second],
        cloneContainer: { width: 1 },
        layoutColumnSimple: windows => { attempted.push(windows[0]); return [400, true]; },
    });
    layout.call(space, false, { centerIfOne: false });
    assert.deepEqual(attempted, [first, first, first, first, first, first, second]);
    assert.deepEqual(allocations, Array(7).fill(null));
    assert.equal(space.cloneContainer.width, 824);
    assert.equal(space._inLayout, false);
});

test('grabEnd does not end the custom pointer grab on a Mutter completion signal', () => {
    const source = readFileSync(new URL('../../tiling.js', import.meta.url), 'utf8')
        .match(/^export function grabEnd\([^\n]*\) \{[\s\S]*?^\}/m)[0];
    let ended = 0;
    const grabEnd = runInNewContext(`(${source.replace('export ', '')})`, {
        inGrab: { end: () => { ended++; } }, Grab: { grabbed: true },
    });
    grabEnd();
    assert.equal(ended, 0);
});

test('ensuredX accepts a projected offset without writing shell state', () => {
    const source = readFileSync(new URL('../../tiling.js', import.meta.url), 'utf8')
        .match(/^export function ensuredX\([^\n]*\) \{[\s\S]*?^\}/m)[0];
    const ensuredX = runInNewContext(`(${source.replace('export ', '')})`, {
        ensuredXCore, FocusModes: { CENTER: 1, EDGE: 2 },
        Settings: { prefs: { horizontal_margin: 10, window_gap: 8 } },
    });
    const window = {
        clone: { targetX: 500 },
        get_frame_rect: () => ({ width: 200 }),
    };
    const space = Object.freeze({
        selectedWindow: window, length: 1, targetX: 0, monitor: { x: 0 },
        indexOf: () => 0, isVisible: () => true,
        workArea: () => ({ x: 0, width: 1000 }),
    });
    assert.equal(ensuredX(window, space, -200), 300);
    assert.equal(ensuredX(window, space), 500);
});

test('MoveGrab.end releases owned resources only once', () => {
    let destroyed = 0, layouts = 0;
    const end = method('../../grab.js', 'end', {
        grabbed: true, dragDriftTimeout: null,
        Utils: { timeout_remove() {}, later_add() {} },
        Settings: { prefs: { animation_time: 0 } },
        Tiling: { setInGrab() {} },
        global: { get_pointer: () => [0, 0] },
        setCursorGrabbing() {},
        Meta: { LaterType: { IDLE: 0 } },
    });
    const grab = {
        signals: { destroy: () => { destroyed++; } },
        window: { get_compositor_private: () => null },
        zoneActors: new Set(),
        initialSpace: { layout: () => { layouts++; } },
    };
    end.call(grab);
    assert.doesNotThrow(() => end.call(grab));
    assert.equal(destroyed, 1);
    assert.equal(layouts, 1);
});

test('failed grab setup does not mark the pointer dispatcher as acquired', () => {
    const failure = new Error('pointer modal unavailable');
    const bindings = {
        grabbed: false,
        global: { display: {}, get_current_time: () => 0 },
        setCursorGrabbing() {},
        DispatcherMode: { POINTER: 1 },
        Navigator: { getActionDispatcher: function () { throw failure; } },
    };
    const begin = method('../../grab.js', 'begin', bindings);
    assert.throws(() => begin.call({}), failure);
    assert.equal(bindings.grabbed, false);
});

test('leaving every drop zone clears the previous target and its preview', () => {
    const previous = { position: [0] };
    const deactivated = [];
    const grab = { dndTarget: previous, deactivateDndTarget: zone => deactivated.push(zone) };
    method('../../grab.js', 'activateDndTarget', {}).call(grab, null, false);
    assert.equal(grab.dndTarget, null);
    assert.deepEqual(deactivated, [previous]);
});

test('empty-space DnD uses target scroll offset even while the container is animated', () => {
    let target;
    const space = Object.assign([], {
        width: 1920, height: 1080, targetX: 0, cloneContainer: { x: -200 },
        viewportToScroll: () => { throw new Error('live coordinates must not be queried'); },
    });
    const select = method('../../grab.js', 'selectDndZone', {
        Settings: { prefs: { window_gap: 8 } },
        Main: { layoutManager: { panelBox: { height: 32 } } },
        selectDndTarget, sameDndTarget,
    });
    select.call({ activateDndTarget: zone => { target = zone; } }, space, 500, 10, false);
    assert.deepEqual(target.position, [0]);
});
