/**
 * Pure overview layout arithmetic.
 *
 * `windows` are dimension snapshots `{width, height}` in the order the caller
 * wants them placed. Rows and slots refer back to those snapshots by index;
 * the adapter maps the indices to Shell window previews.
 */

const windowScale = (window, monitorHeight) =>
    1.5 - 0.5 * (window.height / monitorHeight);

/* Spacing separates columns; an empty row has no column separators. */
const separators = count => Math.max(0, count - 1);

/* Fit content into available space, never producing NaN or a negative scale. */
const fitAdditional = (available, content) =>
    content > 0 ? Math.max(0, Math.min(1, available / content)) : 1;

function keepSameRow(row, width, idealRowWidth, minWindowsPerRow) {
    if (row.windows.length < minWindowsPerRow)
        return true;
    if (row.fullWidth + width <= idealRowWidth)
        return true;
    return Math.abs(1 - (row.fullWidth + width) / idealRowWidth) <
        Math.abs(1 - row.fullWidth / idealRowWidth);
}

export function computeOverviewLayout({ windows, numRows, monitorHeight, minWindowsPerRow }) {
    if (!numRows)
        throw new Error('No numRows given in layout params');

    let totalWidth = 0;
    for (const window of windows)
        totalWidth += window.width * windowScale(window, monitorHeight);
    const idealRowWidth = totalWidth / numRows;

    const rows = [];
    let index = 0;
    for (let i = 0; i < numRows; i++) {
        const row = {
            fullWidth: 0, fullHeight: 0, windows: [],
        };
        rows.push(row);
        for (; index < windows.length; index++) {
            const window = windows[index];
            const scale = windowScale(window, monitorHeight);
            const width = window.width * scale;
            if (!keepSameRow(row, width, idealRowWidth, minWindowsPerRow) && i !== numRows - 1)
                break;
            /* Only accepted windows define the row's height. A rejected window
             * starts the next row and must not inflate this one. */
            row.fullHeight = Math.max(row.fullHeight, window.height * scale);
            row.windows.push(index);
            row.fullWidth += width;
        }
    }

    const maxRow = rows.reduce((max, row) => !max || row.fullWidth > max.fullWidth ? row : max);
    return {
        numRows,
        rows,
        maxColumns: maxRow.windows.length,
        gridWidth: maxRow.fullWidth,
        gridHeight: rows.reduce((sum, row) => sum + row.fullHeight, 0),
    };
}

/** Scale that fits the grid into the area, capped by the configured maximum. */
export function computeOverviewScale({ layout, area, maxScale, columnSpacing, rowSpacing }) {
    const hspacing = separators(layout.maxColumns) * columnSpacing;
    const vspacing = separators(layout.numRows) * rowSpacing;
    const horizontalScale = layout.gridWidth > 0
        ? (area.width - hspacing) / layout.gridWidth
        : Infinity;
    const verticalScale = layout.gridHeight > 0
        ? (area.height - vspacing) / layout.gridHeight
        : Infinity;
    const scale = Math.max(0, Math.min(horizontalScale, verticalScale, maxScale));
    const areaSize = area.width * area.height;
    const space = areaSize > 0
        ? Math.max(0, (layout.gridWidth * scale + hspacing) *
            (layout.gridHeight * scale + vspacing) / areaSize)
        : 0;
    return { scale, space };
}

/**
 * Place every window inside the area. Row annotations stay internal; the
 * returned slots are consumed by the shell. The caller owns the layout object.
 */
export function computeOverviewSlots({
    layout, windows, area, scale, maxScale, columnSpacing, rowSpacing, monitorHeight,
}) {
    const rows = layout.rows.map(row => ({
        ...row,
        width: row.fullWidth * scale + separators(row.windows.length) * columnSpacing,
        height: row.fullHeight * scale,
    }));

    const heightWithoutSpacing = rows.reduce((sum, row) => sum + row.height, 0);
    const verticalSpacing = separators(rows.length) * rowSpacing;
    const additionalVerticalScale = fitAdditional(
        area.height - verticalSpacing, heightWithoutSpacing);

    let compensation = 0;
    let y = 0;
    for (const row of rows) {
        const horizontalSpacing = separators(row.windows.length) * columnSpacing;
        const widthWithoutSpacing = row.width - horizontalSpacing;
        const additionalHorizontalScale = fitAdditional(
            area.width - horizontalSpacing, widthWithoutSpacing);

        row.additionalScale = Math.min(additionalHorizontalScale, additionalVerticalScale);
        if (additionalHorizontalScale < additionalVerticalScale)
            compensation += (additionalVerticalScale - additionalHorizontalScale) * row.height;

        row.x = area.x + Math.max(area.width -
            (widthWithoutSpacing * row.additionalScale + horizontalSpacing), 0) / 2;
        row.y = area.y + Math.max(area.height -
            (heightWithoutSpacing + verticalSpacing), 0) / 2 + y;
        y += row.height * row.additionalScale + rowSpacing;
    }
    compensation /= 2;

    const slots = [];
    for (const row of rows) {
        const rowY = row.y + compensation;
        const rowHeight = row.height * row.additionalScale;
        let x = row.x;
        for (const index of row.windows) {
            const window = windows[index];
            let windowRenderScale = scale * windowScale(window, monitorHeight) * row.additionalScale;
            const cellWidth = window.width * windowRenderScale;
            const cellHeight = window.height * windowRenderScale;
            windowRenderScale = Math.min(windowRenderScale, maxScale);
            const cloneWidth = window.width * windowRenderScale;
            const cloneHeight = window.height * windowRenderScale;
            const cloneY = rows.length === 1
                ? rowY + (rowHeight - cloneHeight) / 2
                : rowY + rowHeight - cellHeight;
            slots.push([
                Math.floor(x + (cellWidth - cloneWidth) / 2),
                Math.floor(cloneY),
                cloneWidth,
                cloneHeight,
                index,
            ]);
            x += cellWidth + columnSpacing;
        }
    }
    return slots;
}
