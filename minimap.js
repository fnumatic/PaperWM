import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Pango from 'gi://Pango';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Settings, Utils, Lib } from './imports.js';
import { Easer } from './utils.js';
import { planMinimapLayout, planMinimapSelection } from './core/minimap.js';

export class Minimap extends Array {
    constructor(space, monitor) {
        super();
        this.space = space;
        this.monitor = monitor;
        let actor = new St.Widget({
            name: 'minimap',
            style_class: 'paperwm-minimap switcher-list',
        });
        this.actor = actor;
        let highlight = new St.Widget({
            name: 'minimap-selection',
            style_class: 'paperwm-minimap-selection item-box',
        });
        highlight.add_style_pseudo_class('selected');
        this.highlight = highlight;
        let label = new St.Label({ style_class: 'paperwm-minimap-label' });
        label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this.label = label;

        let clip = new St.Widget({ name: 'container-clip' });
        this.clip = clip;
        let container = new St.Widget({ name: 'minimap-container' });
        this.container = container;

        actor.add_child(highlight);
        actor.add_child(label);
        actor.add_child(clip);
        clip.add_child(container);
        Main.uiGroup.add_child(this.actor);
        this.actor.opacity = 0;
        this.createClones();

        this.signals = new Utils.Signals();
        this.signals.connect(space, 'select', this.select.bind(this));
        this.signals.connect(space, 'window-added', this.addWindow.bind(this));
        this.signals.connect(space, 'window-removed', this.removeWindow.bind(this));
        this.signals.connect(space, 'layout', this.layout.bind(this));
        this.signals.connect(space, 'swapped', this.swapped.bind(this));
        this.signals.connect(space, 'full-layout', this.reset.bind(this));

        this.layout();
    }

    static get [Symbol.species]() { return Array; }

    reset() {
        this.splice(0, this.length).forEach(c => c.forEach(x => x.destroy()));
        this.createClones();
        this.layout();
    }

    addWindow(space, metaWindow, index, row) {
        let clone = this.createClone(metaWindow);
        if (row !== undefined && this[index]) {
            let column = this[index];
            column.splice(row, 0, clone);
        } else {
            row = row || 0;
            this.splice(index, 0, [clone]);
        }
        this.layout();
    }

    removeWindow(space, metaWindow, index, row) {
        let clone = this[index][row];
        let column = this[index];
        column.splice(row, 1);
        if (column.length === 0)
            this.splice(index, 1);
        Utils.actor_remove_child(this.container, clone);
        this.layout();
    }

    swapped(space, index, targetIndex, row, targetRow) {
        let column = this[index];
        Lib.swap(this, index, targetIndex);
        Lib.swap(column, row, targetRow);
        this.layout();
    }

    show(animate) {
        if (this.destroyed)
            return;

        // if minimap_scale preference is 0, then don't show
        if (Settings.prefs.minimap_scale <= 0) {
            return;
        }

        this.layout();
        let time = animate ? Settings.prefs.animation_time : 0;
        this.actor.show();
        Easer.addEase(this.actor,
            { opacity: 255, time, mode: Clutter.AnimationMode.EASE_OUT_EXPO });
    }

    hide(animate) {
        if (this.destroyed)
            return;
        let time = animate ? Settings.prefs.animation_time : 0;
        Easer.addEase(this.actor,
            {
                opacity: 0, time, mode: Clutter.AnimationMode.EASE_OUT_EXPO,
                onComplete: () => this.actor.hide(),
            });
    }

    createClones() {
        for (let column of this.space) {
            this.push(column.map(this.createClone.bind(this)));
        }
    }

    createClone(mw) {
        const windowActor = mw.get_compositor_private();
        const clone = new Clutter.Clone({ source: windowActor });
        const container = new Clutter.Actor({
            name: "window-clone-container",
        });
        container.clone = clone;
        container.meta_window = mw;
        container.add_child(clone);
        this.container.add_child(container);
        return container;
    }

    layout() {
        if (this.destroyed)
            return;

        const rect = value => ({
            x: value.x,
            y: value.y,
            width: value.width,
            height: value.height,
        });
        const plan = planMinimapLayout({
            columns: this.map(column => column.map(container => {
                const metaWindow = container.meta_window;
                return {
                    buffer: rect(metaWindow.get_buffer_rect()),
                    frame: rect(metaWindow.get_frame_rect()),
                };
            })),
            monitor: rect(this.monitor),
            scale: Settings.prefs.minimap_scale,
            gap: Settings.prefs.window_gap,
        });
        this.plan = plan;

        for (let i = 0; i < this.length; i++) {
            for (let j = 0; j < this[i].length; j++) {
                const container = this[i][j];
                const geometry = plan.columns[i][j];
                container.set_position(geometry.x, geometry.y);
                container.set_size(geometry.container.width, geometry.container.height);
                container.clone.set_position(geometry.clone.x, geometry.clone.y);
                container.clone.set_size(geometry.clone.width, geometry.clone.height);
            }
        }

        this.container.set_size(plan.content.width, plan.content.height);
        this.clip.set_size(plan.clip.width, plan.clip.height);
        this.clip.set_position(plan.clip.x, plan.clip.y);
        this.clip.set_clip(0, 0, plan.clip.width, plan.clip.height);
        this.actor.set_size(plan.actor.width, plan.actor.height);
        this.actor.set_position(plan.actor.x, plan.actor.y);
        this.label.set_style(`max-width: ${plan.clip.width}px;`);
        this.select();
    }

    select() {
        const position = this.space.positionOf();
        const selected = position && this[position[0]]?.[position[1]];
        if (!selected || !this.plan) {
            this.highlight.hide();
            this.label.hide();
            return;
        }

        const metaWindow = selected.meta_window;
        this.label.text = metaWindow.title;
        // The allocation is one frame behind a text change; measure the new text.
        const [, labelWidth] = this.label.get_preferred_width(-1);
        const selection = planMinimapSelection({
            layout: this.plan,
            position,
            labelWidth,
            gap: Settings.prefs.window_gap,
            containerX: this.container.x,
        });
        if (!selection.visible) {
            this.highlight.hide();
            this.label.hide();
            return;
        }

        this.highlight.show();
        this.label.show();
        this.container.x = selection.containerX;
        this.highlight.x = selection.highlight.x;
        this.highlight.y = selection.highlight.y;
        this.highlight.set_size(selection.highlight.width, selection.highlight.height);
        this.label.set_position(selection.label.x, selection.label.y);

        const shadeOpacity = Settings.prefs.minimap_shade_opacity;
        const animationTime = Settings.prefs.animation_time;
        for (const window of this.space.getWindows()) {
            const shade = window.clone?.shade;
            if (!shade)
                continue;

            shade.show();
            if (window === metaWindow) {
                shade.opacity = 0;
                continue;
            }

            Easer.addEase(shade, {
                time: animationTime,
                opacity: shadeOpacity,
            });
        }
    }

    destroy() {
        if (this.destroyed)
            return;
        this.space.getWindows()
            .forEach(w => {
                Easer.addEase(w.clone?.shade, {
                    time: Settings.prefs.animation_time,
                    opacity: 0,
                    onComplete: () => w.clone?.shade.hide(),
                });
            });
        this.destroyed = true;
        this.signals.destroy();
        this.signals = null;
        this.plan = null;
        this.splice(0, this.length);
        this.actor.destroy();
        this.actor = null;
    }
}
