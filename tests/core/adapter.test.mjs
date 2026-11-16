import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { swapTarget } from '../../core/arrangement.js';
import { planRow } from '../../core/geometry.js';
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
        planRow, isMaximized: () => false,
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
        planRow, isMaximized: () => false,
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
