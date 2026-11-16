/**
 * Pure swipe arithmetic and target selection.
 *
 * Samples and window boxes are plain data. The caller owns shell state, clone
 * coordinates, callbacks and time.
 */

const SWIPE_SAMPLE_COUNT = 3;

/** Keep only the most recent samples; returns a new array. */
export function addSwipeSample(samples, sample) {
    return [...samples, sample].slice(-SWIPE_SAMPLE_COUNT);
}

/**
 * Velocity over the most recent samples.
 *
 * Returns `fallback` when there is no positive elapsed time or a sample is not
 * finite. A non-finite fallback becomes null, so the caller keeps its old
 * velocity exactly as before.
 */
export function swipeVelocity({ samples, fallback = null }) {
    const value = Number.isFinite(fallback) ? fallback : null;
    const recent = samples.slice(-SWIPE_SAMPLE_COUNT);
    if (recent.length < 2)
        return value;

    let distance = 0;
    for (const sample of recent) {
        if (!Number.isFinite(sample.dx) || !Number.isFinite(sample.time))
            return value;
        distance += sample.dx;
    }

    const elapsed = recent.at(-1).time - recent[0].time;
    if (!(elapsed > 0))
        return value;

    const velocity = distance / elapsed;
    return Number.isFinite(velocity) ? velocity : value;
}

/**
 * Project the friction glide from a viewport position and velocity.
 *
 * `friction` keeps its legacy unit and is divided by 16 to obtain px/ms².
 * Non-positive or non-finite friction disables the glide instead of producing
 * an infinite duration. The result is rounded to whole pixels.
 */
export function projectGlide({ targetX, velocity, friction }) {
    if (!Number.isFinite(targetX))
        return { targetX, duration: 0, distance: 0 };
    if (!Number.isFinite(velocity) || !Number.isFinite(friction) || friction <= 0)
        return { targetX: Math.round(targetX), duration: 0, distance: 0 };
    if (velocity === 0)
        return { targetX: Math.round(targetX), duration: 0, distance: 0 };

    const accel = friction / 16;
    const signedAccel = velocity > 0 ? -accel : accel;
    const duration = -velocity / signedAccel;
    const distance = velocity * duration + 0.5 * signedAccel * duration ** 2;
    return {
        targetX: Math.round(targetX - distance),
        duration,
        distance,
    };
}

/**
 * Index into `windows` for the window a horizontal swipe should select.
 *
 * `windows[n].x` is the clone's target x; `selected.x` is the selected clone's
 * live x, matching the shell's two coordinate sources. `direction` is a
 * boolean: true scans right, false scans left. The facade owns the signed
 * -1/1 contract. `fallbackFirst` and `fallbackLast` are indices into the
 * flattened list; the facade supplies the first rows of the first and last
 * columns, so a flick with no reachable window keeps the legacy row.
 */
export function selectTargetWindow({
    windows, selected, targetX, workArea, direction,
    fallbackFirst = 0, fallbackLast = windows.length - 1,
}) {
    if (windows.length === 0)
        return null;

    const right = Boolean(direction);
    const min = workArea.x;
    const max = min + workArea.width;
    if (selected &&
        Number.isInteger(selected.index) &&
        selected.index >= 0 &&
        selected.index < windows.length) {
        const x = selected.x + targetX;
        if (x >= min && x + selected.width <= max)
            return selected.index;
    }

    const candidates = [];
    for (let index = 0; index < windows.length; index++) {
        const window = windows[index];
        const x = window.x + targetX;
        if (!(x + window.width < min || x > max))
            candidates.push({ x: window.x, width: window.width, index });
    }
    if (!right)
        candidates.reverse();

    const visible = candidates.filter(window => {
        const x = window.x + targetX;
        return x >= min && x + window.width <= max;
    });
    if (visible.length > 0)
        return visible[0].index;
    if (candidates.length === 0) {
        const valid = (value, fallback) =>
            Number.isInteger(value) && value >= 0 && value < windows.length
                ? value
                : fallback;
        return right
            ? valid(fallbackLast, windows.length - 1)
            : valid(fallbackFirst, 0);
    }
    if (candidates.length === 1)
        return candidates[0].index;

    // Compare every reachable window, including rows stacked in one column.
    let best = candidates[0];
    let bestRatio = -1;
    for (const window of candidates) {
        const x = window.x + targetX;
        const visible = Math.max(0,
            Math.min(x + window.width, max) - Math.max(x, min));
        const ratio = window.width > 0 ? visible / window.width : 0;
        // The legacy exact tie chose the later candidate in scan order.
        if (ratio >= bestRatio) {
            best = window;
            bestRatio = ratio;
        }
    }
    return best.index;
}

/**
 * Snap a projected viewport to a fully covered edge.
 *
 * `scrollX` is the live offset at glide start. Returns the target to select and
 * a plain edge anchor: 'first', 'last' or null.
 */
export function snapGlideTarget({ targetX, scrollX, containerWidth, viewportWidth }) {
    const full = containerWidth > viewportWidth;
    const snap = !(scrollX >= 0 || scrollX + containerWidth <= viewportWidth);
    if ((snap && targetX > 0) || (full && targetX > viewportWidth * 2))
        return { targetX: 0, anchor: 'first' };
    if ((snap && targetX + containerWidth < viewportWidth) ||
        (full && targetX + containerWidth < -viewportWidth))
        return { targetX: viewportWidth - containerWidth, anchor: 'last' };
    return { targetX, anchor: null };
}

const MINIMUM_GLIDE_DURATION = 200;

/**
 * Shorten the travel time after selection changes the destination, and keep a
 * minimum duration for corrected or edge-snapped glides. Always finite.
 */
export function adjustGlideDuration({
    duration, distance, startX, targetX, projectedTarget, snapped,
}) {
    let value = duration;
    const travel = Math.abs(startX - targetX);
    if (travel < Math.abs(distance))
        value *= Math.abs(travel / distance);
    if (snapped || targetX !== projectedTarget)
        value = Math.max(value, MINIMUM_GLIDE_DURATION);
    return Number.isFinite(value) ? value : 0;
}
