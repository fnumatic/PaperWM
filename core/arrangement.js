/**
 * Pure arrangement decisions: where a new column goes and which slot a swap
 * trades with. The caller keeps the actual arrays and windows.
 */

/**
 * Column index for a newly opened window.
 *
 * `selectedIndex` is -1 when no window is selected. `end` intentionally returns
 * `columnCount + 1`, matching the legacy behaviour.
 */
export function openWindowIndex({ selectedIndex, columnCount, position }) {
    const index = selectedIndex ?? -1;

    switch (position) {
    case 'left':
        return index;
    case 'start':
        return 0;
    case 'end':
        return columnCount + 1;
    default:
        return index + 1;
    }
}

/**
 * Plan for stacking a neighbouring column into the current one.
 *
 * `from` is the neighbour column; `position` is where the window enters the
 * current column. `push` appends, matching the legacy default branch.
 */
export function slurpPlan({ index, columnLengths, direction, insertAt, rowIndex }) {
    if (columnLengths.length < 2)
        return null;

    const from = direction === 'left' || direction === 'start'
        ? index - 1
        : index + 1;

    if (from < 0 || from >= columnLengths.length)
        return null;
    if ((columnLengths[from] ?? 0) === 0)
        return null;

    switch (insertAt) {
    case 'above':
        return { from, position: { index: rowIndex } };
    case 'below':
        return { from, position: { index: rowIndex + 1 } };
    case 'top':
        return { from, position: { index: 0 } };
    default:
        return { from, position: { push: true } };
    }
}

/**
 * Column index for a window expelled from a column, or null when the column
 * holds only that window. `left`/`start` keep the current index, matching the
 * legacy splice order.
 */
export function barfTarget({ index, columnLength, direction }) {
    if (columnLength < 2)
        return null;

    return {
        to: direction === 'left' || direction === 'start' ? index : index + 1,
    };
}

/**
 * Target slot for a swap, or null when it leaves the space.
 *
 * `columnLength` is the source column's row count, as the legacy check used.
 */
export function swapTarget({ index, row, columnCount, columnLength, direction }) {
    let targetIndex = index;
    let targetRow = row;

    switch (direction) {
    case 'left':
        targetIndex--;
        break;
    case 'right':
        targetIndex++;
        break;
    case 'down':
        targetRow++;
        break;
    case 'up':
        targetRow--;
        break;
    }

    if (targetIndex < 0 || targetIndex >= columnCount ||
        targetRow < 0 || targetRow >= columnLength)
        return null;

    return { index: targetIndex, row: targetRow };
}
