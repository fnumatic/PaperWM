/** One bounded/wrapping index operation for both rows and columns. */
export function stepIndex({ count, index, delta, loop }) {
    if (count <= 0)
        return null;
    const next = index + delta;
    return loop ? ((next % count) + count) % count
        : next >= 0 && next < count ? next : null;
}

/** Linear navigation skips empty columns; every result is a valid slot or null. */
export function nextLinear({ columnLengths, index, row, dir, loop }) {
    if ((dir !== 1 && dir !== -1) || row < 0 || row >= (columnLengths[index] ?? 0))
        return null;
    const nextRow = stepIndex({ count: columnLengths[index], index: row, delta: dir, loop: false });
    if (nextRow !== null)
        return { index, row: nextRow };

    for (let visited = 0; visited < columnLengths.length; visited++) {
        index = stepIndex({ count: columnLengths.length, index, delta: dir, loop });
        if (index === null)
            return null;
        if (columnLengths[index] > 0)
            return { index, row: dir === 1 ? 0 : columnLengths[index] - 1 };
    }
    return null;
}
