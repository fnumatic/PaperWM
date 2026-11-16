import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Patches, Settings, Tiling, Utils, Navigator } from './imports.js';
import { Easer } from './utils.js';
import {
    addSwipeSample,
    adjustGlideDuration,
    projectGlide,
    selectTargetWindow,
    snapGlideTarget,
    swipeVelocity,
} from './core/gestures.js';

const DIRECTIONS = {
    Horizontal: true,
    Vertical: false,
};

let vy, time, vState, navigator, direction, signals;
let handoffToOverview = false;
// 1 is natural scrolling, -1 is unnatural
let natural = 1;
export let gliding = false; // exported

let touchpadSettings;
export function enable(extension) {
    signals = new Utils.Signals();
    // Touchpad swipes only works in Wayland
    if (!Utils.is_wayland_compositor())
        return;

    touchpadSettings = new Gio.Settings({
        schema_id: 'org.gnome.desktop.peripherals.touchpad',
    });

    // monitor gesture-enabled for changes
    const gsettings = extension.getSettings();
    signals.connect(gsettings, 'changed::gesture-enabled', () => {
        gestureEnabled() ? swipeTrackersEnable(false) : swipeTrackersEnable();
    });

    /**
     * Swipetrackers are reset by gnome during overview, once exits overview
     * ensure swipe trackers are reset.
     */
    signals.connect(Main.overview, 'hidden', () => {
        if (gestureEnabled()) {
            swipeTrackersEnable(false);
        }
    });

    /**
       In order for the space.background actors to get any input we need to hide
       all the window actors from the stage.

       The stage takes care of scrolling vertically through the workspace mru.
       Delegating the horizontal scrolling to each space. This way vertical
       scrolling works anywhere, while horizontal scrolling is done on the space
       under the mouse cursor.
     */
    signals.connect(global.stage, 'captured-event', (actor, event) => {
        if (event.type() !== Clutter.EventType.TOUCHPAD_SWIPE) {
            return Clutter.EVENT_PROPAGATE;
        }

        const fingers = event.get_touchpad_gesture_finger_count();
        if (
            fingers <= 2 ||
            (Main.actionMode & Shell.ActionMode.OVERVIEW) > 0
        ) {
            return Clutter.EVENT_PROPAGATE;
        }

        const enabled = gestureEnabled();
        if (!enabled) {
            // switch to default swipe trackers
            swipeTrackersEnable();
        }

        const phase = event.get_gesture_phase();
        const [dx, dy] = event.get_gesture_motion_delta();
        switch (phase) {
        case Clutter.TouchpadGesturePhase.BEGIN:
            if (shouldPropagate(fingers)) {
                return Clutter.EVENT_PROPAGATE;
            }

            // PaperWM behaviour
            time = event.get_time();
            natural = touchpadSettings.get_boolean("natural-scroll") ? 1 : -1;
            direction = undefined;
            handoffToOverview = false;
            navigator = Navigator.getNavigator();
            navigator.connect('destroy', () => {
                vState = -1;
            });
            return Clutter.EVENT_STOP;
        case Clutter.TouchpadGesturePhase.UPDATE:
            if (shouldPropagate(fingers)) {
                return Clutter.EVENT_PROPAGATE;
            }

            if (direction === DIRECTIONS.Horizontal) {
                return Clutter.EVENT_PROPAGATE;
            }

            if (enabled && direction === undefined) {
                if (Math.abs(dx) < Math.abs(dy)) {
                    vy = 0;
                    vState = phase;
                    direction = DIRECTIONS.Vertical;
                }
            }
            if (enabled && direction === DIRECTIONS.Vertical) {
                // if in overview => propagate event to overview
                if (Main.overview.visible) {
                    handoffToOverview = true;
                    return Clutter.EVENT_PROPAGATE;
                }

                // if our vertical gesture is disabled, propagate always!
                // (might be used for a vertical-workspaces addon)
                if (gestureWorkspaceFingers() === 0) {
                    swipeTrackersEnable();
                    handoffToOverview = fingers === 3;
                    return Clutter.EVENT_PROPAGATE;
                }

                let dir_y = -dy * natural * Settings.prefs.swipe_sensitivity[1];
                // if not Tiling.inPreview and swipe is UP => propagate event to overview
                if (!Tiling.inPreview && dir_y > 0) {
                    // enable swipe trackers which enables 3-finger up overview
                    swipeTrackersEnable();
                    handoffToOverview = true;
                    return Clutter.EVENT_PROPAGATE;
                }

                if (gestureWorkspaceFingers() !== fingers) {
                    handoffToOverview = fingers === 3;
                    return Clutter.EVENT_PROPAGATE;
                }

                // initiates workspace stack switching
                handoffToOverview = false;
                swipeTrackersEnable(false);
                updateVertical(dir_y, event.get_time());
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        case Clutter.TouchpadGesturePhase.CANCEL:
        case Clutter.TouchpadGesturePhase.END:
            // If this finger count should be handled by GNOME, never consume
            // completion here (prevents overview from getting stuck in 4-finger mode).
            if (shouldPropagate(fingers)) {
                direction = undefined;
                handoffToOverview = false;
                return Clutter.EVENT_PROPAGATE;
            }

            if (direction === DIRECTIONS.Vertical) {
                // GNOME 49+ can receive UPDATE from us for overview handoff.
                // Do not swallow END/CANCEL in that case or overview gets stuck.
                if (handoffToOverview) {
                    handoffToOverview = false;
                    direction = undefined;
                    return Clutter.EVENT_PROPAGATE;
                }

                vState = phase;
                endVertical();
                handoffToOverview = false;
                return Clutter.EVENT_STOP;
            }
        }
        return Clutter.EVENT_PROPAGATE;
    });
}

function shouldPropagate(fingers) {
    if (
        // gestures disabled ==> gnome default behaviour
        !gestureEnabled()
    ) {
        swipeTrackersEnable();
        return true;
    }
    else if (
        fingers === 3 && gestureHorizontalFingers() !== 3
    ) {
        swipeTrackersEnable();
        return true;
    }
    else if (
        // if gesure enabled AND finger 4 AND horizontal finger != 4
        fingers === 4 &&
        gestureHorizontalFingers() !== 4 &&
        gestureWorkspaceFingers() !== 4
    ) {
        return true;
    }
    else {
        return false;
    }
}

export function disable() {
    signals.destroy();
    signals = null;
    Utils.timeout_remove(endVerticalTimeout);
    endVerticalTimeout = null;
    touchpadSettings = null;
}

export function gestureEnabled() {
    return Settings.prefs.gesture_enabled;
}

export function gestureHorizontalFingers() {
    return Settings.prefs.gesture_horizontal_fingers;
}

export function gestureWorkspaceFingers() {
    return Settings.prefs.gesture_workspace_fingers;
}

/**
   Handle scrolling horizontally in a space. The handler is meant to be
   connected from each space.background and bound to the space.
 */
let start;
let samples = [];
export function horizontalScroll(space, _actor, event) {
    if (event.type() !== Clutter.EventType.TOUCHPAD_SWIPE) {
        return Clutter.EVENT_PROPAGATE;
    }

    const fingers = event.get_touchpad_gesture_finger_count();
    if (
        fingers <= 2 || gestureHorizontalFingers() !== fingers
    ) {
        return Clutter.EVENT_PROPAGATE;
    }
    else if (
        /**
         * If gestures are disabled AND doing a 3-finger swipe (gnome default)
         * AND horizontal fingers are set to 3, then propagate.
         */
        !gestureEnabled() && fingers === 3
    ) {
        return Clutter.EVENT_PROPAGATE;
    }

    const phase = event.get_gesture_phase();
    const [dx] = event.get_gesture_motion_delta();
    switch (phase) {
    case Clutter.TouchpadGesturePhase.UPDATE:
        if (direction !== undefined && direction !== DIRECTIONS.Horizontal) {
            return Clutter.EVENT_PROPAGATE;
        }

        if (direction === undefined) {
            space.vx = 0;
            samples = [];
            space.hState = phase;
            start = space.targetX;
            Easer.removeEase(space.cloneContainer);
            direction = DIRECTIONS.Horizontal;
        }
        return update(space, -dx * natural * Settings.prefs.swipe_sensitivity[0], event.get_time());
    case Clutter.TouchpadGesturePhase.CANCEL:
    case Clutter.TouchpadGesturePhase.END:
        if (direction !== DIRECTIONS.Horizontal) {
            return Clutter.EVENT_PROPAGATE;
        }
        space.hState = phase;
        done(space, event);
        samples = [];
        direction = undefined;
        return Clutter.EVENT_STOP;
    }
}

/**
   Handle scrolling horizontally using a touchscreen. This handler is meant to
   be connected to the global Panel and recreated every time the active space
   is changed.
 */
let walk = 0;
let sdx = null;
export function horizontalTouchScroll(_actor, event) {
    const type = event.type();
    const [myx] = event.get_coords();

    switch (type) {
    case Clutter.EventType.TOUCH_BEGIN:
        this.vx = 0;
        samples = [];
        sdx = myx;
        walk = 0;
        start = this.targetX;
        this.hState = Clutter.TouchpadGesturePhase.UPDATE;
        Easer.removeEase(this.cloneContainer);
        navigator = Navigator.getNavigator();
        direction = DIRECTIONS.Horizontal;
        update(this, 0, event.get_time() * .75);
        return Clutter.EVENT_PROPAGATE;
    case Clutter.EventType.TOUCH_UPDATE: {
        let dx = 0;
        if (sdx !== null) {
            dx = myx - sdx;
        }
        sdx = myx;
        walk += Math.abs(dx);

        /**
         * Here, we ignore the friction setting and reduce the reported time
         * scale, because the distances involved on a touch screen would make
         * the flick motion as understood by the trackpad handler impractical.
         */
        update(this, -dx, event.get_time() * .75);
        return Clutter.EVENT_PROPAGATE;
    }
    case Clutter.EventType.TOUCH_CANCEL:
    case Clutter.EventType.TOUCH_END: {
        const swiped = walk >= 20;
        done(this, event);
        samples = [];
        sdx = null;
        walk = 0;
        this.hState = Clutter.TouchpadGesturePhase.END;
        return swiped ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
    }
    }
}

export function update(space, dx, t) {
    samples = addSwipeSample(samples, { dx, time: t });

    space.cloneContainer.x -= dx;
    space.targetX = space.cloneContainer.x;

    // Check which target window will be selected if we release the swipe at this
    // moment.
    const velocity = swipeVelocity({ samples, fallback: space.vx });
    if (velocity !== null)
        space.vx = velocity;

    const projection = projectGlide({
        targetX: space.targetX,
        velocity: space.vx,
        friction: Settings.prefs.swipe_friction[0],
    });
    const selected = findTargetWindow(
        space,
        start - projection.targetX > 0 ? 1 : -1,
        projection.targetX);
    Tiling.updateSelection(space, selected);
    space.selectedWindow = selected;
    space.emit('select');

    return Clutter.EVENT_STOP;
}

export function done(space) {
    if (!Number.isFinite(space.vx) || space.length === 0) {
        navigator?.finish();
        space.hState = -1;
        return Clutter.EVENT_STOP;
    }

    let startGlide = space.targetX;

    // timetravel
    const projection = projectGlide({
        targetX: space.targetX,
        velocity: space.vx,
        friction: Settings.prefs.swipe_friction[0],
    });
    const snap = snapGlideTarget({
        targetX: projection.targetX,
        scrollX: space.targetX,
        containerWidth: space.cloneContainer.width,
        viewportWidth: space.width,
    });
    let target = snap.targetX;
    const mode = snap.anchor
        ? Clutter.AnimationMode.EASE_OUT_BACK
        : Clutter.AnimationMode.EASE_OUT_QUAD;
    const first = snap.anchor === 'first' ? space[0][0] : undefined;
    const last = snap.anchor === 'last'
        ? space[space.length - 1][0]
        : undefined;

    // Adjust for target window
    const selectionTarget = Math.round(target);
    const selected = last || first ||
        findTargetWindow(space, start - target > 0 ? 1 : -1, selectionTarget);
    if (!selected) {
        navigator?.finish();
        space.hState = -1;
        return Clutter.EVENT_STOP;
    }
    delete selected.lastFrame; // Invalidate frame information
    let x = Tiling.ensuredX(selected, space, selectionTarget);
    target = x - selected.clone.targetX;

    const t = adjustGlideDuration({
        duration: projection.duration,
        distance: projection.distance,
        startX: startGlide,
        targetX: target,
        projectedTarget: selectionTarget,
        snapped: Boolean(snap.anchor),
    });
    space.targetX = target;

    Tiling.updateSelection(space, selected);
    space.selectedWindow = selected;
    space.emit('select');
    gliding = true;
    Easer.addEase(space.cloneContainer, {
        x: space.targetX,
        duration: t,
        mode,
        onStopped: () => {
            gliding = false;
        },
        onComplete: () => {
            if (!Tiling.inPreview)
                Navigator.getNavigator().finish();
        },
    });
}

/**
 * Finds a target window given a space and direction (-1 is left, 1 is right).
 *
 * `targetX` overrides the space's live scroll position for the decision, so
 * callers never need to assign a projected position first.
 * @param {Tiling.Space} space
 * @param {Number|Boolean} direction -1/false left, 1/true right
 * @param {Number} [targetX]
 * @returns
 */
export function findTargetWindow(space, direction, targetX = space.targetX) {
    const windows = space.getWindows();
    const selectedWindow = space.selectedWindow;
    const selectedIndex = selectedWindow ? windows.indexOf(selectedWindow) : -1;
    const clone = selectedWindow?.clone;
    const selected = selectedIndex >= 0 && clone
        ? { index: selectedIndex, x: clone.x, width: clone.width }
        : null;

    const index = selectTargetWindow({
        windows: windows.map(window => ({
            x: window.clone.targetX,
            width: window.clone.width,
        })),
        selected,
        targetX,
        workArea: space.workArea(),
        direction: direction === 1 || direction === true,
    });
    return index === null ? undefined : windows[index];
}

let transition = 'easeOutQuad';
export function updateVertical(dy, t) {
    // if here then initiate workspace stack (for tiling inPreview show)
    if (!Tiling.inPreview) {
        Tiling.spaces.initWorkspaceStack();
    }

    let selected = Tiling.spaces.selectedSpace;
    let monitor = navigator.monitor;
    let v = dy / (t - time);
    time = t;
    const StackPositions = Tiling.StackPositions;
    if (dy > 0 &&
        selected !== navigator.from &&
        (selected.actor.y - dy < StackPositions.up * monitor.height)
    ) {
        dy = 0;
        vy = 1;
        selected.actor.y = StackPositions.up * selected.height;
        Tiling.spaces.selectStackSpace(Meta.MotionDirection.UP, false, transition);
        selected = Tiling.spaces.selectedSpace;
        Easer.removeEase(selected.actor);
        Easer.addEase(selected.actor, {
            scale_x: 0.9, scale_y: 0.9, time:
                Settings.prefs.animation_time, transition,
        });
    } else if (dy < 0 &&
        (selected.actor.y - dy > StackPositions.down * monitor.height)) {
        dy = 0;
        vy = -1;
        selected.actor.y = StackPositions.down * selected.height;
        Tiling.spaces.selectStackSpace(Meta.MotionDirection.DOWN, false, transition);
        selected = Tiling.spaces.selectedSpace;
        Easer.removeEase(selected.actor);
        Easer.addEase(selected.actor, {
            scale_x: 0.9, scale_y: 0.9, time:
                Settings.prefs.animation_time, transition,
        });
    } else if (Number.isFinite(v)) {
        vy = v;
    }

    selected.actor.y -= dy;
    if (selected === navigator.from) {
        let scale = 0.90;
        let s = 1 - (1 - scale) * (selected.actor.y / (0.1 * monitor.height));
        s = Math.max(s, scale);
        Easer.removeEase(selected.actor);
        selected.actor.set_scale(s, s);
    }
}

let endVerticalTimeout;
export function endVertical() {
    let test = vy > 0 ? () => vy < 0 : () => vy > 0;
    let glide = () => {
        if (vState < Clutter.TouchpadGesturePhase.END) {
            endVerticalTimeout = null;
            return false;
        }

        if (!Number.isFinite(vy)) {
            endVerticalTimeout = null;
            return false;
        }

        let selected = Tiling.spaces.selectedSpace;
        let y = selected.actor.y;
        if (selected === navigator.from && y <= 0.1 * selected.height) {
            navigator.finish();
            endVerticalTimeout = null;
            return false;
        }

        if (test()) {
            endVerticalTimeout = null;
            return false;
        }

        let dy = vy * 16;
        let v = vy;
        let accel = Settings.prefs.swipe_friction[1];
        accel = v > 0 ? -accel : accel;
        updateVertical(dy, time + 16);
        vy += accel;
        return true; // repeat
    };

    /**
     * The below timeout_add will be destroyed by the glide
     * function - which returns false (thus destroying this timeout)
     * when user gesture fininshes, a space is selected, etc.
     */
    endVerticalTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, glide);
}

/**
 * Enables (or disables) gnome swipe trackers which take care of the
 * default 3 finger swipe actions.
 * @param {Boolean} option
 */
export function swipeTrackersEnable(option) {
    let enable = option ?? true;
    Patches.swipeTrackers.forEach(t => t.enabled = enable);
}
