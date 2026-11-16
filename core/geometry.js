/**
 * Pure layout geometry.
 *
 * Mirrors the calculations in `Space.layout` while keeping monitor queries,
 * actors and mutation outside. Inputs are copied, never modified.
 */

/**
 * Apply the topbar/position-bar adjustments to a work area.
 *
 * `selectedFullscreen` also hides the space topbar elements in the shell; that
 * side effect stays with the caller.
 */
export function layoutWorkArea({ workArea, panelHeight, isPrimary, showTopBar, showPositionBar, selectedFullscreen }) {
    const area = { ...workArea };

    if (selectedFullscreen) {
        area.y = 0;
    } else if (isPrimary) {
        if (!showTopBar) {
            area.y -= panelHeight;
            area.height += panelHeight;

            if (showPositionBar) {
                area.y += panelHeight;
                area.height -= panelHeight;
            }
        }
    } else if (showPositionBar) {
        area.y += panelHeight;
        area.height -= panelHeight;
    }

    return area;
}

/**
 * Column width from the selected window, or the widest row, capped to the
 * work area minus both minimum margins.
 *
 * An empty width list yields -Infinity, matching `Math.max()` in the caller.
 */
export function targetWidthForColumn({ widths, selectedWidth, workAreaWidth, minimumMargin }) {
    const base = selectedWidth ?? Math.max(...widths);
    return Math.min(base, workAreaWidth - 2 * minimumMargin);
}

/**
 * Whether the content currently sits centered, or overflows the right edge
 * while starting at or before the left edge.
 */
export function isAutoCentered({ targetX, containerWidth, workArea }) {
    const min = workArea.x;
    return (targetX + containerWidth >= min + workArea.width && targetX <= 0) ||
        targetX === min + Math.round((workArea.width - containerWidth) / 2);
}

/**
 * Target scroll offset for an auto-centered layout.
 *
 * The legacy third branch compared against `workArea.min`, which never exists
 * on a work area, so it stayed unreachable. It is kept as-is and tests pin the
 * current result; changing it needs a separate decision.
 */
export function autoPanTargetX({ targetX, contentWidth, workArea }) {
    const min = workArea.x;
    const width = Math.max(1, contentWidth);

    if (width < workArea.width)
        return min + Math.round((workArea.width - width) / 2);
    if (targetX + width < min + workArea.width)
        return min + workArea.width - width;
    if (targetX > workArea.min)
        return workArea.x;

    return targetX;
}
