/**
 * Pure navigation arithmetic over column lengths.
 *
 * `columnLengths` is the number of rows per column. Windows, stacking order and
 * viewport changes stay with the caller.
 */

/**
 * Move one window up/down in the current column, or into the next/previous
 * column at its first/last row.
 *
 * Returns null when the move leaves the space without looping. Every result is
 * a valid slot; a null result means "no target".
 */
export function nextLinear({ columnLengths, index, row, dir, loop }) {
    const count = columnLengths.length;
    let i = index;
    let r = row;

    if (columnLengths[i] === undefined)
        return null;

    if (row + dir < 0 || row + dir >= columnLengths[i]) {
        i += dir;
        if (loop) {
            if (i >= count)
                i = 0;
            else if (i < 0)
                i = count - 1;
        } else if (i < 0 || i >= count) {
            return null;
        }
        r = dir === 1 ? 0 : columnLengths[i] - 1;
    } else {
        r += dir;
    }

    return { index: i, row: r };
}

/**
 * Step to an adjacent column. Returns null when the step leaves the space and
 * looping is off.
 */
export function stepColumn({ count, index, delta, loop }) {
    let i = index + delta;
    if (loop) {
        if (i >= count)
            i = 0;
        else if (i < 0)
            i = count - 1;
    } else if (i < 0 || i >= count) {
        return null;
    }
    return i;
}

/**
 * Step within a column. Returns null when the step leaves the column and
 * looping is off.
 */
export function stepRow({ count, row, delta, loop }) {
    let r = row + delta;
    if (loop) {
        if (r < 0)
            r = count - 1;
        else if (r >= count)
            r = 0;
    } else if (r < 0 || r >= count) {
        return null;
    }
    return r;
}
