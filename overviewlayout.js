import * as Workspace from 'resource:///org/gnome/shell/ui/workspace.js';
import * as Params from 'resource:///org/gnome/shell/misc/params.js';

import { Settings, Tiling } from './imports.js';
import {
    computeOverviewLayout,
    computeOverviewScale,
    computeOverviewSlots,
} from './core/overview.js';

/**
 * GNOME 49-51 keep UnalignedLayoutStrategy private. Their layout contract is
 * computeLayout(windows, {numRows}), computeScaleAndSpace(layout, area) and
 * computeWindowSlots(layout, area); slots end with the WindowPreview. The
 * opaque layout below keeps the preview order next to the pure grid, so the
 * strategy holds no state between calls.
 */
export class UnalignedLayoutStrategy extends Workspace.LayoutStrategy {
    computeLayout(windows, layoutParams) {
        layoutParams = Params.parse(layoutParams, {
            numRows: 0,
        });

        if (layoutParams.numRows === 0)
            throw new Error(`${this.constructor.name}: No numRows given in layout params`);

        const sorted = windows.slice().sort(sortWindows);
        return {
            windows: sorted,
            grid: computeOverviewLayout({
                windows: sorted.map(window => ({
                    width: window.boundingBox.width,
                    height: window.boundingBox.height,
                })),
                numRows: layoutParams.numRows,
                monitorHeight: this._monitor.height,
                minWindowsPerRow: Settings.prefs.overview_min_windows_per_row,
            }),
        };
    }

    computeScaleAndSpace(layout, area) {
        const { scale, space } = computeOverviewScale({
            layout: layout.grid,
            area,
            maxScale: Settings.prefs.overview_max_window_scale,
            columnSpacing: this._columnSpacing,
            rowSpacing: this._rowSpacing,
        });
        layout.scale = scale;
        return [scale, space];
    }

    computeWindowSlots(layout, area) {
        const windows = layout.windows;
        const slots = computeOverviewSlots({
            layout: layout.grid,
            windows: windows.map(window => ({
                width: window.boundingBox.width,
                height: window.boundingBox.height,
            })),
            area,
            scale: layout.scale,
            maxScale: Settings.prefs.overview_max_window_scale,
            columnSpacing: this._columnSpacing,
            rowSpacing: this._rowSpacing,
            monitorHeight: this._monitor.height,
        });
        return slots.map(([x, y, width, height, index]) =>
            [x, y, width, height, windows[index]]);
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
    let ia = spaceA ? spaceA.indexOf(aw) : -1;
    let ib = spaceB ? spaceB.indexOf(bw) : -1;
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
