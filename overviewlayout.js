import * as Workspace from 'resource:///org/gnome/shell/ui/workspace.js';
import * as Params from 'resource:///org/gnome/shell/misc/params.js';

import { Settings, Tiling } from './imports.js';
import {
    computeOverviewLayout,
    computeOverviewScale,
    computeOverviewSlots,
} from './core/overview.js';

/**
 * GNOME 45's UnalignedLayoutStrategy is not exported. This subclass keeps the
 * window order of the tiling space; the arithmetic lives in the core.
 */
export class UnalignedLayoutStrategy extends Workspace.LayoutStrategy {
    computeLayout(windows, layoutParams) {
        layoutParams = Params.parse(layoutParams, {
            numRows: 0,
        });

        if (layoutParams.numRows === 0)
            throw new Error(`${this.constructor.name}: No numRows given in layout params`);

        return computeOverviewLayout({
            windows: windows.slice().sort(sortWindows),
            numRows: layoutParams.numRows,
            monitorHeight: this._monitor.height,
            minWindowsPerRow: Settings.prefs.overview_min_windows_per_row,
        });
    }

    computeScaleAndSpace(layout, area) {
        const { scale, space } = computeOverviewScale({
            layout,
            area,
            maxScale: Settings.prefs.overview_max_window_scale,
            columnSpacing: this._columnSpacing,
            rowSpacing: this._rowSpacing,
        });
        layout.scale = scale;
        return [scale, space];
    }

    computeWindowSlots(layout, area) {
        const { slots, rows } = computeOverviewSlots({
            layout,
            area,
            scale: layout.scale,
            maxScale: Settings.prefs.overview_max_window_scale,
            columnSpacing: this._columnSpacing,
            rowSpacing: this._rowSpacing,
            monitorHeight: this._monitor.height,
        });
        layout.rows = rows;
        return slots;
    }
}

/**
 * Ensures windows are sorted correctly in overview (correctly being the tiled order in the space).
 */
export function sortWindows(a, b) {
    let aw = a.metaWindow;
    let bw = b.metaWindow;
    if (!aw && !bw) {
        return 0;
    }
    if (!aw) {
        return -1;
    }
    if (!bw) {
        return 1;
    }

    let spaceA = Tiling.spaces.spaceOfWindow(aw);
    let spaceB = Tiling.spaces.spaceOfWindow(bw);
    let ia = spaceA.indexOf(aw);
    let ib = spaceB.indexOf(bw);
    if (ia === -1 && ib === -1) {
        return aw.get_stable_sequence() - bw.get_stable_sequence();
    }
    if (ia === -1) {
        return -1;
    }
    if (ib === -1) {
        return 1;
    }
    return ia - ib;
}
