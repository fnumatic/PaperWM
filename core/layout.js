/** Allocate non-negative dimensions from finite observed heights and a budget. */
export function fitProportionally(values, targetSum) {
    targetSum = Math.max(0, targetSum);
    const weights = values.map(value => Math.max(0, value));
    const sum = weights.reduce((a, b) => a + b, 0);
    const fitted = weights.map(weight => sum
        ? Math.round(targetSum * (weight / sum))
        : Math.floor(targetSum / weights.length));
    let remainder = targetSum - fitted.reduce((a, b) => a + b, 0);
    // Absorb rounding error without making the first (or any later) row negative.
    for (let i = 0; i < fitted.length && remainder !== 0; i++) {
        const correction = Math.max(-fitted[i], remainder);
        fitted[i] += correction;
        remainder -= correction;
    }
    return fitted;
}

/**
 * Keep the selected row's height when possible. minHeight is a preferred
 * aggregate budget for the other rows, not a guaranteed per-row minimum.
 * When that budget cannot fit, scale all rows instead of producing negatives.
 */
export function allocateDefault({ heights, selectedIndex, gap, availableHeight, minHeight = 50 }) {
    const budget = Math.max(0, availableHeight - (heights.length - 1) * gap);
    if (heights.length <= 1 ||
        !Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= heights.length ||
        budget < (heights.length - 1) * minHeight)
        return fitProportionally(heights, budget);

    const others = heights.filter((_, i) => i !== selectedIndex);
    const remaining = Math.max(others.length * minHeight,
        budget - Math.max(0, heights[selectedIndex]));
    const fitted = fitProportionally(others, remaining);
    fitted.splice(selectedIndex, 0, budget - remaining);
    return fitted;
}

/** Equal rows; floor intentionally leaves at most count - 1 units unused. */
export function allocateEqualHeight({ count, gap, available }) {
    const budget = Math.max(0, available - (count - 1) * gap);
    return Array.from({ length: count }, () => Math.floor(budget / count));
}
