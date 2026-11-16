/**
 * Pure layout geometry.
 *
 * Mirrors the calculations in `Space.layout` while keeping monitor queries,
 * actors and mutation outside. Inputs are copied, never modified.
 */

const centeredX = (area, width) => area.x + Math.round((area.width - width) / 2);

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
        // Without topbar the panel area is usable; the position bar takes it back.
        if (!showTopBar && !showPositionBar) {
            area.y -= panelHeight;
            area.height += panelHeight;
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
 * Tiny work areas still produce a usable positive target width.
 */
export function targetWidthForColumn({ widths, selectedWidth, workAreaWidth, minimumMargin }) {
    const base = selectedWidth ?? Math.max(1, ...widths);
    return Math.max(1, Math.min(base, workAreaWidth - 2 * minimumMargin));
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
    // Native resize requests need a positive size, even when the row budget is zero.
    let height = Math.max(1, targetHeight);
    const warnings = [];

    if (preferredWidth) {
        const prop = preferredWidth;
        const value = Number(prop.value);
        if (!Number.isFinite(value) || value <= 0) {
            warnings.push('invalid preferredWidth value');
        } else if (prop.unit === 'px') {
            width = value;
        } else if (prop.unit === '%') {
            const availableWidth = Math.max(1, workAreaWidth - horizontalMargin * 2 - gap);
            width = Math.max(1, Math.floor(availableWidth * Math.min(value / 100.0, 1.0)));
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
    monitorX,
    isVisible,
    frameWidth,
    workArea,
    horizontalMargin,
    windowGap,
}) {
    const neighbour = Math.abs(selectedIndex - index) <= 1;
    const min = workArea.x;
    const max = min + workArea.width;

    let x;
    if (neighbour || isVisible || lastFrameX === undefined)
        x = Math.round(cloneTargetX) + targetX;
    else
        x = lastFrameX - monitorX;

    if (fullscreen) {
        x = 0;
    } else if (focusMode === 'center') {
        // window switching should centre focus
        x = centeredX(workArea, frameWidth);
    } else if (focusMode === 'edge') {
        // Align to the closest edge, with special cases for
        // only (center), first (left), and last (right) windows
        if (index === 0 && spaceLength === 1)
            x = centeredX(workArea, frameWidth);
        else if (index === 0 || (Math.abs(x - min) < Math.abs(x + frameWidth - max) &&
            index !== spaceLength - 1))
            x = min + horizontalMargin;
        else
            x = max - horizontalMargin - frameWidth;
    } else if (frameWidth > workArea.width * 0.9 - 2 * (horizontalMargin + windowGap)) {
        // Consider the window to be wide and center it
        x = centeredX(workArea, frameWidth);
    } else if (x + horizontalMargin + frameWidth > max) {
        // Align to the right margin
        x = max - horizontalMargin - frameWidth;
    } else if (x < min + horizontalMargin) {
        // Align to the left margin
        x = min + horizontalMargin;
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
    return x + width >= min + margin && x <= min + workArea.width - margin;
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
export function isPlaceable({ x, width, workArea, stackMargin, maximized, fullscreen }) {
    return isVisible({ x, width, workArea, margin: stackMargin }) &&
        (!maximized || x === workArea.x) && (!fullscreen || x === 0);
}

/**
 * Preserve automatic centering/edge alignment after content changes.
 * Return null when the user has scrolled elsewhere. Widths are already clamped
 * by the caller; offsets and work area are monitor-local.
 */
export function autoPanTargetX({ targetX, containerWidth, contentWidth, workArea }) {
    const min = workArea.x;
    const aligned = targetX + containerWidth >= min + workArea.width && targetX <= min;
    if (!aligned && targetX !== centeredX(workArea, containerWidth))
        return null;
    if (contentWidth < workArea.width)
        return centeredX(workArea, contentWidth);
    return Math.min(min, Math.max(targetX, min + workArea.width - contentWidth));
}
