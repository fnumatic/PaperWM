import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Settings, Utils, Tiling, Navigator, Scratch, Gestures } from './imports.js';
import { DispatcherMode, Easer } from './utils.js';
import { selectDndTarget, sameDndTarget } from './core/dnd.js';

export let grabbed = false;

/**
 * Sets the cursor type to Grabbing or Default, going through each enum type.
 */
function setCursorGrabbing(cursorType) {
    if (Utils.version[0] >= 50) {
        global.stage.set_cursor_type(cursorType ? Clutter.CursorType.GRABBING : Clutter.CursorType.DEFAULT);
    } else if (Utils.version[0] >= 48) {
        global.display.set_cursor(cursorType ? Meta.Cursor.GRABBING : Meta.Cursor.DEFAULT)
    } else {
        global.display.set_cursor(cursorType ? Meta.Cursor.MOVE_OR_RESIZE_WINDOW : Meta.Cursor.DEFAULT)
    }
}

let dragDriftTimeout;
export function enable() {

}

export function disable() {
    grabbed = null;
    Utils.timeout_remove(dragDriftTimeout);
    dragDriftTimeout = null;
}

/**
 * Returns a virtual keyboard that can be used to
 * "escape" of a drag operation when `grab_end_op` is unavailable
 * (i.e. as of Gnome 44 where `grab_end_op` was removed).
 * @returns Clutter.VirtualInputDevice
*/
let virtualKeyboard;
export function getVirtualKeyboard() {
    if (!virtualKeyboard) {
        virtualKeyboard = (global.stage.get_context?.().get_backend() ??
            Clutter.get_default_backend())
            .get_default_seat()
            .create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    }
    return virtualKeyboard;
}

export class MoveGrab {
    constructor(metaWindow) {
        this.window = metaWindow;
        this.signals = new Utils.Signals();

        this.dragDriftPx = 12;

        this.initialSpace = Tiling.spaces.spaceOfWindow(metaWindow);
        this.zoneActors = new Set();

        // save whether this was tiled window at start of grab
        this.wasTiled = !(this.initialSpace.isFloating(metaWindow) ||
            Scratch.isScratchWindow(metaWindow));

    }

    begin() {
        console.debug("#grab", "begin");

        if (grabbed)
            return;

        this.dispatcher = new Navigator.getActionDispatcher(DispatcherMode.POINTER);
        this.actor = this.dispatcher.actor;

        let metaWindow = this.window;
        let actor = metaWindow.get_compositor_private();
        let clone = metaWindow.clone;
        let space = this.initialSpace;
        let frame = metaWindow.get_frame_rect();

        this.initialY = clone.targetY;
        Easer.removeEase(clone);
        let [gx, gy] = Utils.getPointerCoords();

        let px = (gx - actor.x) / actor.width;
        let py = (gy - actor.y) / actor.height;
        actor.set_pivot_point(px, py);

        let [x, y] = space.globalToScroll(gx, gy);
        if (clone.get_parent() === this.initialSpace.cloneContainer) {
            this.pointerOffset = [x - clone.x, y - clone.y];
            px = (x - clone.x) / clone.width;
            py = (y - clone.y) / clone.height;
        } else {
            this.pointerOffset = [gx - frame.x, gy - frame.y];
            clone.x = frame.x;
            clone.y = frame.y;
            px = (gx - clone.x) / clone.width;
            py = (gy - clone.y) / clone.height;
        }
        clone.set_pivot_point(px, py);

        this.signals.connect(this.actor, "button-release-event", this.end.bind(this));
        this.signals.connect(this.actor, "touch-event", (act, evt) => {
            if (evt.type() === Clutter.EventType.TOUCH_END) {
                this.end();
            }
            else {
                this.motion(act, evt);
            }
        });
        this.signals.connect(this.actor, "motion-event", this.motion.bind(this));
        this.signals.connect(global.display, "window-entered-monitor",
            this.beginDnD.bind(this)
        );

        this.scrollAnchor = x;
        space.startAnimate();
        // Make sure the window actor is visible
        Navigator.getNavigator();
        Tiling.animateWindow(metaWindow);
        Easer.removeEase(space.cloneContainer);
        // GNOME 49-51 have no end_grab_op; publish only successful setup.
        grabbed = true;
        setCursorGrabbing(true);
    }

    beginDnD() {
        if (this.dnd) {
            return;
        }

        this.dnd = true;
        console.debug("#grab", "begin DnD");
        Navigator.getNavigator().minimaps.forEach(m => typeof m === 'number'
            ? Utils.timeout_remove(m) : m.hide());
        setCursorGrabbing(true);
        let metaWindow = this.window;
        let clone = metaWindow.clone;
        let space = this.initialSpace;

        let [gx, gy] = global.get_pointer();
        const [dx, dy] = this.pointerOffset;

        let i = space.indexOf(metaWindow);
        let single = i !== -1 && space[i].length === 1;
        space.removeWindow(metaWindow);
        Utils.actor_reparent(clone, Main.uiGroup);
        clone.x = Math.round(gx - dx);
        clone.y = Math.round(gy - dy);
        let newScale = clone.scale_x * space.actor.scale_x;
        clone.set_scale(newScale, newScale);

        clone.__oldOpacity = clone.opacity;
        Easer.addEase(clone, {
            time: Settings.prefs.animation_time, scale_x: 0.5, scale_y: 0.5, opacity: 240,
        });

        this.signals.connect(global.stage, "button-press-event", this.end.bind(this));

        let monitor = Utils.monitorAtPoint(gx, gy);
        let onSame = monitor === space.monitor;

        let [x] = space.globalToViewport(gx, gy);
        if (onSame && single && space[i]) {
            Tiling.move_to(space, space[i][0], { x: x + Settings.prefs.window_gap / 2 });
        } else if (onSame && single && space[i - 1]) {
            Tiling.move_to(space, space[i - 1][0], { x: x - space[i - 1][0].clone.width - Settings.prefs.window_gap / 2 });
        } else if (onSame && space.length === 0) {
            space.targetX = x;
            space.cloneContainer.x = x;
        }

        let [sx, sy] = space.globalToScroll(gx, gy, { useTarget: true });

        Tiling.spaces.forEach(space => {
            this.signals.connect(space.background, "motion-event", this.spaceMotion.bind(this, space));
        });
        this.selectDndZone(space, sx, sy, single && onSame);
    }

    spaceMotion(space, _background, _event) {
        let [gx, gy] = global.get_pointer();
        let [sx, sy] = space.globalToScroll(gx, gy, { useTarget: true });
        this.selectDndZone(space, sx, sy);
    }

    /** x,y in scroll cooridinates */
    selectDndZone(space, x, y, initial = false) {
        const gap = Settings.prefs.window_gap;
        const tilingHeight = space.height - Main.layoutManager.panelBox.height;

        const planned = selectDndTarget({
            columns: space.map(column => column.map(({ clone }) => ({
                x: clone.targetX, y: clone.targetY, width: clone.width, height: clone.height,
            }))),
            x, y, gap, viewportWidth: space.width, scrollOffsetX: space.targetX,
        });

        const vertical = planned?.position.length === 2;
        const target = planned && {
            ...planned,
            space,
            originProp: vertical ? 'y' : 'x',
            sizeProp: vertical ? 'height' : 'width',
            actorParams: vertical
                ? planned.anchor
                : { y: Main.layoutManager.panelBox.height, height: tilingHeight },
        };

        const sameTarget = (a, b) => {
            if (a?.space !== b?.space)
                return false;
            return sameDndTarget(a, b);
        };

        if (!sameTarget(target, this.dndTarget)) {
            this.activateDndTarget(target, initial);
        }
    }

    _dragDrfit(space, dx, xfunc) {
        // only dift is more than one tiled window
        if (space.getWindows().filter(w => Tiling.isTiled(w)).length <= 0) {
            return;
        }

        Utils.timeout_remove(dragDriftTimeout);
        dragDriftTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1, () => {
            const [px] = global.get_pointer();
            if (xfunc(px)) {
                return false;
            }
            if (space !== Tiling?.spaces?.activeSpace) {
                return false;
            }
            Gestures.update(space, dx, 1);
            return true;
        });
    }

    motion(_actor, event) {
        const metaWindow = this.window;
        let [gx, gy] = global.get_pointer();

        // drift move
        const monitor = Utils.monitorAtPoint(gx, gy);
        if (gx >= monitor.x && gx <= monitor.x + this.dragDriftPx) {
            this._dragDrfit(
                this.initialSpace,
                -1 * Settings.prefs.drag_drift_speed, x => x > monitor.x + this.dragDriftPx
            );
        }
        if (gx <= monitor.x + monitor.width && gx >= monitor.x + monitor.width - this.dragDriftPx) {
            this._dragDrfit(
                this.initialSpace,
                Settings.prefs.drag_drift_speed, x => x < monitor.x + monitor.width - this.dragDriftPx
            );
        }

        if (event.type() === Clutter.EventType.TOUCH_UPDATE) {
            [gx, gy] = event.get_coords();
            // We update global pointer to match touch event
            Utils.warpPointer(gx, gy, false);
        }
        let [dx, dy] = this.pointerOffset;
        const clone = metaWindow?.clone;

        // check if window and clone exists
        if (!clone) {
            this.end();
            return;
        }

        let tx = clone.get_transition('x');
        let ty = clone.get_transition('y');

        if (this.dnd) {
            if (tx) {
                tx.set_to(gx - dx);
                ty.set_to(gy - dy);
            } else {
                clone.x = gx - dx;
                clone.y = gy - dy;
            }
            return;
        }

        if (monitor !== this.initialSpace.monitor) {
            this.beginDnD();
            return;
        }

        if (event.get_state() & Clutter.ModifierType.CONTROL_MASK) {
            // NB: only works in wayland
            this.beginDnD();
            return;
        }

        const space = this.initialSpace;
        let [x, y] = space.globalToViewport(gx, gy);
        space.targetX = x - this.scrollAnchor;
        space.cloneContainer.x = space.targetX;

        clone.y = y - dy;

        const threshold = 300;
        dy = Math.min(threshold, Math.abs(clone.y - this.initialY));
        let s = 1 - Math.pow(dy / 500, 3);
        let actor = metaWindow.get_compositor_private();
        actor.set_scale(s, s);
        clone.set_scale(s, s);

        if (dy >= threshold) {
            this.beginDnD();
        }
    }

    end() {
        if (!this.signals)
            return;
        grabbed = null;
        Utils.timeout_remove(dragDriftTimeout);
        console.debug("#grab", "end");
        try {
            this.signals.destroy();
            this.signals = null;

            let metaWindow = this.window;
            let actor = metaWindow.get_compositor_private();
            let clone = metaWindow.clone;
            let [gx, gy] = global.get_pointer();

            this.zoneActors.forEach(actor => actor.destroy());
            let params = {
                time: Settings.prefs.animation_time,
                scale_x: 1,
                scale_y: 1,
                opacity: clone?.__oldOpacity ?? 255,
            };

            if (clone && this.dnd) {
                const dndTarget = this.dndTarget;
                if (dndTarget) {
                    const space = dndTarget.space;
                    space.showSelection();

                    if (Scratch.isScratchWindow(metaWindow)) {
                        Scratch.unmakeScratch(metaWindow);
                    }

                    // Remember the global coordinates of the clone
                    let [x] = clone.get_position();
                    space.addWindow(metaWindow, ...dndTarget.position);

                    let [sx, sy] = space.globalToScroll(gx, gy);
                    let [dx, dy] = this.pointerOffset;
                    clone.x = sx - dx;
                    clone.y = sy - dy;
                    let newScale = clone.scale_x / space.actor.scale_x;
                    clone.set_scale(newScale, newScale);

                    actor.set_scale(1, 1);
                    actor.set_pivot_point(0, 0);

                    // Tiling.animateWindow(metaWindow);
                    params.onStopped = () => {
                        space.moveDone();
                        clone.set_pivot_point(0, 0);
                    };
                    Easer.addEase(clone, params);

                    space.targetX = space.cloneContainer.x;
                    space.selectedWindow = metaWindow;
                    space.layout(true, { customAllocators: { [dndTarget.position[0]]: Tiling.allocateEqualHeight } });
                    Tiling.move_to(space, metaWindow, { x: x - space.monitor.x });
                    Tiling.ensureViewport(metaWindow, space);

                    Utils.actor_raise(clone);
                }
                else if (clone) {
                    metaWindow.move_frame(true, clone.x, clone.y);
                    Scratch.makeScratch(metaWindow);
                    this.initialSpace.moveDone();
                    this.initialSpace.showSelection();

                    actor.set_scale(clone.scale_x, clone.scale_y);
                    actor.opacity = clone.opacity;

                    clone.opacity = clone.__oldOpacity || 255;
                    clone.set_scale(1, 1);
                    clone.set_pivot_point(0, 0);

                    const halftime = 0.5 * Settings.prefs.animation_time;
                    params.time = halftime;
                    params.onComplete = () => {
                        Easer.addEase(actor, {
                            time: halftime,
                            onComplete: () => {
                                Scratch.unmakeScratch(metaWindow);
                            },
                        });
                    };
                    Easer.addEase(actor, params);
                }

                Navigator.getNavigator().accept();
            }
            else if (
                clone &&
                this.initialSpace.indexOf(metaWindow) !== -1) {
                let space = this.initialSpace;
                space.targetX = space.cloneContainer.x;

                actor.set_scale(1, 1);
                actor.set_pivot_point(0, 0);

                Tiling.animateWindow(metaWindow);
                params.onStopped = () => {
                    space.moveDone();
                    clone.set_pivot_point(0, 0);
                };
                Easer.addEase(clone, params);

                Tiling.ensureViewport(metaWindow, space);
                Navigator.getNavigator().accept();
            }

            // NOTE: we reset window here so `window-added` will handle the window,
            // and layout will work correctly etc.
            this.window = null;

            this.initialSpace.layout();
            // ensure window is properly activated after layout/ensureViewport tweens
            Utils.later_add(Meta.LaterType.IDLE, () => {
                metaWindow?.get_workspace() && Main.activateWindow(metaWindow);
            });

            // // Make sure the window is on the correct workspace.
            // // If the window is transient this will take care of its parent too.

            /**
             * Gnome 44 removed the ability to manually end_grab_op.
             * Previously we would end the grab_op before doing
             * PaperWM grabs.  In 44, we can't do this so the grab op
             * may still be in progress, which is okay, but won't be ended
             * until we "click out".  We do this here if needed.
             */
            Utils.later_add(Meta.LaterType.IDLE, () => {
                if (!global.display.end_grab_op && this.wasTiled) {
                    let time = Clutter.get_current_event_time();
                
                    // Fakes an 'Escape' keypress to break Mutter's Wayland grab (works for both Touch and Pointer)
                    getVirtualKeyboard().notify_keyval(time, Clutter.KEY_Escape, Clutter.KeyState.PRESSED);
                    getVirtualKeyboard().notify_keyval(time, Clutter.KEY_Escape, Clutter.KeyState.RELEASED);
                }
            });
        } finally {
            Tiling.setInGrab(false);
            try {
                if (this.dispatcher) {
                    Navigator.dismissDispatcher(DispatcherMode.POINTER);
                    this.dispatcher = null;
                }
            } finally {
                setCursorGrabbing(false);
            }
        }
    }

    activateDndTarget(zone, first) {
        if (this.dndTarget)
            this.deactivateDndTarget(this.dndTarget);
        this.dndTarget = zone;
        if (!zone) {
            return;
        }
        zone.actor = new St.Widget({
            style_class: "tile-preview",
            x: 0, y: 0, width: 0, height: 0,
            ...zone.actorParams,
        });

        this.zoneActors.add(zone.actor);
        const raise = () => Utils.actor_raise(zone.actor);

        let params = {
            time: Settings.prefs.animation_time,
            [zone.originProp]: zone.center - zone.marginA,
            [zone.sizeProp]: zone.marginA + zone.marginB,
            onComplete: raise,
        };

        if (first) {
            params.height = zone.actor.height;
            params.y = zone.actor.y;

            let clone = this.window.clone;
            let space = zone.space;
            let [x, y] = space.globalToScroll(...clone.get_transformed_position());
            zone.actor.set_position(x, y);
            zone.actor.set_size(...clone.get_transformed_size());
        } else {
            zone.actor[zone.sizeProp] = 0;
            zone.actor[zone.originProp] = zone.center;
        }

        // zone.space.cloneContainer.add_child(zone.actor);
        Utils.actor_add_child(zone.space.cloneContainer, zone.actor);
        zone.space.hideSelection();
        zone.actor.show();
        raise();
        Easer.addEase(zone.actor, params);
    }

    deactivateDndTarget(zone) {
        if (zone) {
            zone.space.showSelection();
            Easer.addEase(zone.actor, {
                time: Settings.prefs.animation_time,
                [zone.originProp]: zone.center,
                [zone.sizeProp]: 0,
                onComplete: () => {
                    zone.actor.destroy();
                    this.zoneActors.delete(zone.actor);
                },
            });
        }
    }
}

/**
 * Resize grab class currently used to identify window grab type.
 */
export class ResizeGrab {
    end() {

    }
}
