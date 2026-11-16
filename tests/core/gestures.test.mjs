import test from 'node:test';
import assert from 'node:assert/strict';

import {
    addSwipeSample,
    adjustGlideDuration,
    projectGlide,
    selectTargetWindow,
    snapGlideTarget,
    swipeVelocity,
} from '../../core/gestures.js';

function freezeDeep(value) {
    if (value && typeof value === 'object') {
        Object.freeze(value);
        for (const entry of Object.values(value))
            freezeDeep(entry);
    }
    return value;
}

test('sample history keeps only the most recent three samples', () => {
    const history = [];
    let next = addSwipeSample(history, { dx: 1, time: 0 });
    next = addSwipeSample(next, { dx: 2, time: 10 });
    next = addSwipeSample(next, { dx: 3, time: 20 });
    assert.deepEqual(next, [
        { dx: 1, time: 0 },
        { dx: 2, time: 10 },
        { dx: 3, time: 20 },
    ]);
    next = addSwipeSample(next, { dx: 4, time: 30 });
    assert.equal(next.length, 3);
    assert.deepEqual(next.map(sample => sample.dx), [2, 3, 4]);
    assert.deepEqual(history, []);
});

test('velocity uses the last three samples and ignores an extra window', () => {
    const samples = freezeDeep([
        { dx: 100, time: 0 },
        { dx: 1, time: 10 },
        { dx: 1, time: 20 },
        { dx: 1, time: 30 },
    ]);
    assert.equal(swipeVelocity({ samples }), 3 / 20);
    assert.equal(swipeVelocity({ samples, fallback: 7 }), 3 / 20);
});

test('velocity falls back on missing samples, zero elapsed time and non-finite input', () => {
    assert.equal(swipeVelocity({ samples: [] }), null);
    assert.equal(swipeVelocity({ samples: [{ dx: 2, time: 5 }] }), null);
    assert.equal(swipeVelocity({ samples: [{ dx: 2, time: 5 }, { dx: 2, time: 5 }] }), null);
    assert.equal(swipeVelocity({
        samples: [{ dx: 2, time: 5 }, { dx: 2, time: 5 }],
        fallback: 7,
    }), 7);
    assert.equal(swipeVelocity({
        samples: [{ dx: 2, time: 0 }, { dx: Infinity, time: 10 }],
        fallback: 1.5,
    }), 1.5);
    assert.equal(swipeVelocity({
        samples: [{ dx: 2, time: 5 }],
        fallback: NaN,
    }), null);
});

test('friction projection matches the legacy glide arithmetic', () => {
    assert.deepEqual(
        projectGlide({ targetX: -100, velocity: 2, friction: 0.32 }),
        { targetX: -200, duration: 100, distance: 100 });
    assert.deepEqual(
        projectGlide({ targetX: -100, velocity: -2, friction: 0.32 }),
        { targetX: 0, duration: 100, distance: -100 });
    assert.deepEqual(
        projectGlide({ targetX: 100, velocity: 1, friction: 0.32 }),
        { targetX: 75, duration: 50, distance: 25 });
});

test('zero velocity, zero friction and non-finite inputs never solve an infinite glide', () => {
    assert.deepEqual(
        projectGlide({ targetX: 12.6, velocity: 0, friction: 0.32 }),
        { targetX: 13, duration: 0, distance: 0 });
    assert.deepEqual(
        projectGlide({ targetX: 12.6, velocity: 2, friction: 0 }),
        { targetX: 13, duration: 0, distance: 0 });
    assert.deepEqual(
        projectGlide({ targetX: 12.6, velocity: 2, friction: -1 }),
        { targetX: 13, duration: 0, distance: 0 });
    assert.deepEqual(
        projectGlide({ targetX: 12.6, velocity: NaN, friction: 0.32 }),
        { targetX: 13, duration: 0, distance: 0 });
    assert.deepEqual(
        projectGlide({ targetX: 12.6, velocity: 2, friction: Infinity }),
        { targetX: 13, duration: 0, distance: 0 });
});

test('target selection returns the visible selected window through its live x', () => {
    const windows = freezeDeep([
        { x: 0, width: 100 },
        { x: 950, width: 100 },
    ]);
    const selected = freezeDeep({ index: 1, x: 900, width: 100 });
    assert.equal(selectTargetWindow({
        windows,
        selected,
        targetX: 0,
        workArea: freezeDeep({ x: 0, width: 1000 }),
        direction: true,
    }), 1);
});

test('target selection ignores a stale selected index and uses the windows', () => {
    const windows = freezeDeep([{ x: 100, width: 200 }]);
    assert.equal(selectTargetWindow({
        windows,
        selected: freezeDeep({ index: 4, x: 100, width: 200 }),
        targetX: 0,
        workArea: freezeDeep({ x: 0, width: 1000 }),
        direction: true,
    }), 0);
});

test('target selection scans in the requested direction and handles empty input', () => {
    const windows = freezeDeep([
        { x: 0, width: 100 },
        { x: 500, width: 100 },
    ]);
    const base = {
        windows,
        selected: null,
        targetX: 0,
        workArea: freezeDeep({ x: 0, width: 1000 }),
    };
    assert.equal(selectTargetWindow({ ...base, direction: true }), 0);
    assert.equal(selectTargetWindow({ ...base, direction: false }), 1);
    assert.equal(selectTargetWindow({ ...base, windows: [], direction: true }), null);
});

test('target selection filters partly reachable windows and keeps a single fallback', () => {
    assert.equal(selectTargetWindow({
        windows: freezeDeep([
            { x: -100, width: 50 },
            { x: 20, width: 300 },
        ]),
        selected: null,
        targetX: 0,
        workArea: freezeDeep({ x: 0, width: 1000 }),
        direction: true,
    }), 1);
    assert.equal(selectTargetWindow({
        windows: freezeDeep([{ x: 50, width: 100 }]),
        selected: null,
        targetX: 0,
        workArea: freezeDeep({ x: 100, width: 1000 }),
        direction: true,
    }), 0);
});

test('target selection falls back to the first or last window when none is reachable', () => {
    const windows = freezeDeep([
        { x: -200, width: 100 },
        { x: 2000, width: 100 },
    ]);
    const base = {
        windows,
        selected: null,
        targetX: 0,
        workArea: freezeDeep({ x: 0, width: 1000 }),
    };
    // Legacy fallback: right selects the last window, left selects the first.
    assert.equal(selectTargetWindow({ ...base, direction: true }), 1);
    assert.equal(selectTargetWindow({ ...base, direction: false }), 0);
});

test('target selection uses the work-area origin, not the monitor edge', () => {
    const windows = freezeDeep([
        { x: 50, width: 200 },
        { x: 300, width: 200 },
    ]);
    const workArea = freezeDeep({ x: 100, width: 1000 });
    assert.equal(selectTargetWindow({
        windows,
        selected: null,
        targetX: 0,
        workArea,
        direction: true,
    }), 1);
    assert.equal(selectTargetWindow({
        windows,
        selected: freezeDeep({ index: 0, x: 50, width: 200 }),
        targetX: 0,
        workArea,
        direction: true,
    }), 1);
});

test('target selection compares the most visible width for two candidates', () => {
    assert.equal(selectTargetWindow({
        windows: freezeDeep([
            { x: -150, width: 200 },
            { x: 900, width: 200 },
        ]),
        selected: null,
        targetX: 0,
        workArea: freezeDeep({ x: 0, width: 1000 }),
        direction: true,
    }), 1);
});

test('target selection scans every reachable row in stacked columns', () => {
    const windows = freezeDeep([
        { x: 50, width: 200 },  // left partial row
        { x: 50, width: 200 },  // same column, second row
        { x: 950, width: 300 }, // right partial row
        { x: 300, width: 600 }, // more visible next column
    ]);
    const base = {
        windows,
        selected: null,
        targetX: 0,
        workArea: freezeDeep({ x: 100, width: 1000 }),
    };
    assert.equal(selectTargetWindow({ ...base, direction: true }), 3);
    assert.equal(selectTargetWindow({ ...base, direction: false }), 3);
});

test('partial visibility is a ratio of each window, not absolute width', () => {
    assert.equal(selectTargetWindow({
        windows: freezeDeep([
            { x: -10, width: 50 },    // 40/50 visible
            { x: 500, width: 1000 }, // 500/1000 visible
        ]),
        selected: null,
        targetX: 0,
        workArea: freezeDeep({ x: 0, width: 1000 }),
        direction: true,
    }), 0);
});

test('an exact visibility tie keeps the later candidate in scan direction', () => {
    const windows = freezeDeep([
        { x: 0, width: 300 },
        { x: 900, width: 300 },
    ]);
    const base = {
        windows,
        selected: null,
        targetX: 0,
        workArea: freezeDeep({ x: 100, width: 1000 }),
    };
    assert.equal(selectTargetWindow({ ...base, direction: true }), 1);
    assert.equal(selectTargetWindow({ ...base, direction: false }), 0);
});

test('edge snapping uses the live start offset and returns a plain anchor', () => {
    assert.deepEqual(snapGlideTarget({
        targetX: -100, scrollX: -100, containerWidth: 2000, viewportWidth: 1920,
    }), { targetX: -100, anchor: null });
    assert.deepEqual(snapGlideTarget({
        targetX: 50, scrollX: -100, containerWidth: 2200, viewportWidth: 1920,
    }), { targetX: 0, anchor: 'first' });
    assert.deepEqual(snapGlideTarget({
        targetX: -400, scrollX: -100, containerWidth: 2200, viewportWidth: 1920,
    }), { targetX: -280, anchor: 'last' });
    assert.deepEqual(snapGlideTarget({
        targetX: 4000, scrollX: 0, containerWidth: 2200, viewportWidth: 1920,
    }), { targetX: 0, anchor: 'first' });
});

test('glide duration shortens for a nearer target but keeps the minimum when adjusted', () => {
    assert.equal(adjustGlideDuration({
        duration: 100, distance: 200, startX: 0, targetX: -50,
        projectedTarget: -50, snapped: false,
    }), 25);
    assert.equal(adjustGlideDuration({
        duration: 100, distance: 200, startX: 0, targetX: -50,
        projectedTarget: -100, snapped: false,
    }), 200);
    assert.equal(adjustGlideDuration({
        duration: 0, distance: 0, startX: 0, targetX: -100,
        projectedTarget: -100, snapped: true,
    }), 200);
    assert.equal(adjustGlideDuration({
        duration: NaN, distance: 0, startX: 0, targetX: 0,
        projectedTarget: 0, snapped: false,
    }), 0);
});

test('frozen samples and geometry replay the same glide decision', () => {
    const samples = freezeDeep([
        { dx: 3, time: 0 },
        { dx: -1, time: 16 },
        { dx: 4, time: 32 },
        { dx: 2, time: 48 },
    ]);
    const windows = freezeDeep([
        { x: 0, width: 600 },
        { x: 600, width: 600 },
    ]);
    const workArea = freezeDeep({ x: 0, width: 1920 });
    const run = () => {
        const velocity = swipeVelocity({ samples, fallback: 0 });
        const projection = projectGlide({ targetX: 0, velocity, friction: 0.32 });
        return {
            velocity,
            projection,
            selected: selectTargetWindow({
                windows,
                selected: null,
                targetX: projection.targetX,
                workArea,
                direction: true,
            }),
        };
    };
    assert.deepEqual(run(), run());
    assert.deepEqual(run(), {
        velocity: 0.15625,
        projection: { targetX: -1, duration: 7.8125, distance: 0.6103515625 },
        selected: 1,
    });
});

test('target selection does not mutate frozen inputs', () => {
    const windows = freezeDeep([
        { x: -150, width: 200 },
        { x: 900, width: 200 },
    ]);
    const selected = freezeDeep({ index: 0, x: -200, width: 200 });
    const workArea = freezeDeep({ x: 0, width: 1000 });
    const before = JSON.stringify({ windows, selected, workArea });
    selectTargetWindow({
        windows, selected, targetX: 0, workArea, direction: false,
    });
    assert.equal(JSON.stringify({ windows, selected, workArea }), before);
});
