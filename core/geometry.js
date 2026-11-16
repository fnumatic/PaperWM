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
 * Plan one tiled row: preferred width, non-resizable override and the
 * maximized-vertical offset.
 *
 * The caller applies the result, then feeds the observed frame size back in
 * (synchronous X11 resizes). That feedback deliberately stays in the shell.
 */
export function planRow({
    y,
    targetWidth,
    targetHeight,
    gap,
    verticalMargin,
    workAreaWidth,
    horizontalMargin,
    resizable,
    frameWidth,
    frameHeight,
    maximizedVertically,
    preferredWidth,
}) {
    let width = targetWidth;
    let height = targetHeight;
    const warnings = [];

    if (preferredWidth) {
        const prop = preferredWidth;
        if (prop.value <= 0) {
            warnings.push('invalid preferredWidth value');
        } else if (prop.unit === 'px') {
            width = prop.value;
        } else if (prop.unit === '%') {
            const availableWidth = workAreaWidth - horizontalMargin * 2 - gap;
            width = Math.floor(availableWidth * Math.min(prop.value / 100.0, 1.0));
        } else {
            warnings.push(`invalid preferredWidth unit: '${prop.unit}' (should be 'px' or '%')`);
        }
    }

    if (!resizable) {
        width = frameWidth;
        height = frameHeight;
    }

    if (maximizedVertically)
        y -= verticalMargin;

    return { y, width, height, warnings };
}

/**
 * Horizontal viewport target that makes a window reachable.
 *
 * `focusMode` is 'center', 'edge' or 'default'. Visibility, clone state and
 * monitor lookups are resolved by the caller.
 */
export function ensuredX({
    index,
    selectedIndex,
    spaceLength,
    focusMode,
    fullscreen,
    cloneTargetX,
    targetX,
    lastFrameX,
    hasLastFrame,
    monitorX,
    isVisible,
    frame,
    workArea,
    horizontalMargin,
    windowGap,
    minimumMargin,
}) {
    const neighbour = Math.abs(selectedIndex - index) <= 1;
    const min = workArea.x;
    const max = min + workArea.width;

    let x;
    if (neighbour || isVisible || !hasLastFrame)
        x = Math.round(cloneTargetX) + targetX;
    else
        x = lastFrameX - monitorX;

    if (focusMode === 'center') {
        // window switching should centre focus
        x = workArea.x + Math.round(workArea.width / 2 - frame.width / 2);
    } else if (fullscreen) {
        x = 0;
    } else if (focusMode === 'edge') {
        // Align to the closest edge, with special cases for
        // only (center), first (left), and last (right) windows
        if (index === 0 && spaceLength === 1)
            x = min + Math.round((workArea.width - frame.width) / 2);
        else if (index === 0 || (Math.abs(x - min) < Math.abs(x + frame.width - max) &&
            index !== spaceLength - 1))
            x = min + horizontalMargin;
        else
            x = max - horizontalMargin - frame.width;
    } else if (frame.width > workArea.width * 0.9 - 2 * (horizontalMargin + windowGap)) {
        // Consider the window to be wide and center it
        x = min + Math.round((workArea.width - frame.width) / 2);
    } else if (x + horizontalMargin + frame.width > max) {
        // Align to the right margin
        x = max - horizontalMargin - frame.width;
    } else if (x < min + horizontalMargin) {
        // Align to the left margin
        x = min + horizontalMargin;
    } else if (x + frame.width === max) {
        // When opening new windows at the end, in the background, we want to
        // show some minimup margin
        x = max - minimumMargin - frame.width;
    } else if (x === min) {
        // Same for the start (though the case isn't as common)
        x = min + minimumMargin;
    }

    return x;
}

/**
 * Whether the window's current clone position overlaps the work area.
 *
 * `x` is the clone position in the same space as `workArea` (live position,
 * not the target).
 */
export function isVisible({ x, width, workArea, margin = 0 }) {
    const min = workArea.x;
    return !(x - margin + width < min || x + margin > min + workArea.width);
}

/**
 * Whether the window, at its target position, lies fully inside the work area.
 */
export function isFullyVisible({ x, width, workArea }) {
    const min = workArea.x;
    return min <= x && x + width < min + workArea.width;
}

/**
 * Whether a window can be placed at its current target position.
 *
 * `x` is monitor-local; `stackMargin` keeps a strip free at both edges.
 */
export function isPlaceable({ x, width, workArea, monitorX, stackMargin, maximized, fullscreen }) {
    const min = workArea.x - monitorX;

    if (x + width < min + stackMargin || x > min + workArea.width - stackMargin)
        return false;

    // Fullscreen windows are only placeable on the monitor origin
    if ((maximized && x !== min) || (fullscreen && x !== 0))
        return false;

    return true;
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
