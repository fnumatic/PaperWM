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
