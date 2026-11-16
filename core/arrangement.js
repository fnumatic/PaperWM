/**
 * Pure arrangement decisions: where a new column goes and which slot a swap
 * trades with. The caller keeps the actual arrays and windows.
 */

/**
 * Column index for a newly opened window.
 *
 * Insertion positions include columnCount (append); no negative splice indices.
 */
export function openWindowIndex({ selectedIndex, columnCount, position }) {
    const index = Math.max(-1, Math.min(columnCount - 1, selectedIndex ?? -1));

    switch (position) {
    case 'left':
        return Math.max(0, index);
    case 'start':
        return 0;
    case 'end':
        return columnCount;
    default:
        return index + 1;
    }
}

/**
 * Plan for stacking a neighbouring column into the current one.
 *
 * `from` is the neighbour column; `row` is the insertion position in the target.
 */
export function slurpPlan({ index, columnLengths, direction, insertAt, rowIndex }) {
    if (!(columnLengths[index] > 0))
        return null;

    const from = direction === 'left' || direction === 'start'
        ? index - 1
        : index + 1;

    if (from < 0 || from >= columnLengths.length)
        return null;
    if (columnLengths[from] === 0)
        return null;

    switch (insertAt) {
    case 'above':
        return { from, row: rowIndex };
    case 'below':
        return { from, row: rowIndex + 1 };
    case 'top':
        return { from, row: 0 };
    default:
        return { from, row: columnLengths[index] };
    }
}

/**
 * Column index for a window expelled from a column, or null when the column
 * holds only that window. `left`/`start` keep the current index, matching the
 * legacy splice order.
 */
export function barfTarget({ index, columnLength, direction }) {
    if (index < 0 || columnLength < 2)
        return null;

    return direction === 'left' || direction === 'start' ? index : index + 1;
}

/**
 * Target slot for a swap, or null when it leaves the space.
 *
 * Horizontal moves exchange whole columns. Vertical moves exchange rows
 * inside the source column; the destination column's row count is irrelevant.
 */
export function swapTarget({ index, row, columnLengths, direction }) {
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
    default:
        return null;
    }

    const sourceLength = columnLengths[index] ?? 0;
    if (row < 0 || row >= sourceLength ||
        targetRow < 0 || targetRow >= sourceLength ||
        targetIndex < 0 || targetIndex >= columnLengths.length)
        return null;

    return { index: targetIndex, row: targetRow };
}
