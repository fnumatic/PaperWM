/**
 * Pure column-height arithmetic.
 *
 * No GI imports, settings, actors or timers. Callers pass measured values and
 * the current preferences. Results mirror the legacy implementation; the
 * accompanying tests characterize its edge cases instead of changing them.
 */

/**
 * "Fit" values such that they sum to `targetSum`.
 * A zero total produces NaN, as the legacy implementation did. Empty input
 * returns an array containing NaN.
 */
export function fitProportionally(values, targetSum) {
    let sum = values.reduce((a, b) => a + b, 0);
    let weights = values.map(v => v / sum);

    let fitted = values.map((_h, i) => Math.round(targetSum * weights[i]));
    let r = targetSum - fitted.reduce((a, b) => a + b, 0);
    fitted[0] += r;
    return fitted;
}

/**
 * Distribute available height across one column.
 *
 * @param {object} input
 * @param {number[]} input.heights measured (or target) height per row
 * @param {number|null} input.selectedIndex row index, or null without selection
 * @param {number} [input.selectedHeight] measured height of the selected row
 * @param {number} input.gap window gap in the same unit as the heights
 * @param {number} input.availableHeight usable height of the work area
 * @param {number} [input.minHeight] minimum height for non-selected rows
 * @returns {number[]}
 */
export function allocateDefault({ heights, selectedIndex, selectedHeight, gap, availableHeight, minHeight = 50 }) {
    if (heights.length === 1)
        return [availableHeight];

    const hasSelection = selectedIndex !== null && selectedIndex !== undefined;
    let nonSelected = heights.slice();
    if (hasSelection)
        nonSelected.splice(selectedIndex, 1);

    let availableForNonSelected = Math.max(
        0,
        availableHeight -
        (heights.length - 1) * gap -
        (hasSelection ? selectedHeight : 0)
    );

    const deficit = Math.max(
        0, nonSelected.length * minHeight - availableForNonSelected);

    let fitted = fitProportionally(nonSelected, availableForNonSelected + deficit);

    if (hasSelection)
        fitted.splice(selectedIndex, 0, selectedHeight - deficit);

    return fitted;
}

/**
 * Give every row the same height. The remainder is dropped.
 */
export function allocateEqualHeight({ count, gap, available }) {
    available -= (count - 1) * gap;
    return Array.from({ length: count }, () => Math.floor(available / count));
}
