/**
 * Pure overview layout arithmetic.
 *
 * Windows must already be sorted by the caller; ordering depends on shell
 * space state. Each window supplies `boundingBox: {width, height}` and is
 * returned unchanged in the slots.
 */

const windowScale = (window, monitorHeight) =>
    1.5 - 0.5 * (window.boundingBox.height / monitorHeight);

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
        totalWidth += window.boundingBox.width * windowScale(window, monitorHeight);
    const idealRowWidth = totalWidth / numRows;

    const rows = [];
    let index = 0;
    for (let i = 0; i < numRows; i++) {
        const row = {
            x: 0, y: 0, width: 0, height: 0,
            fullWidth: 0, fullHeight: 0, windows: [],
        };
        rows.push(row);
        for (; index < windows.length; index++) {
            const window = windows[index];
            const scale = windowScale(window, monitorHeight);
            const width = window.boundingBox.width * scale;
            row.fullHeight = Math.max(row.fullHeight, window.boundingBox.height * scale);
            if (!keepSameRow(row, width, idealRowWidth, minWindowsPerRow) && i !== numRows - 1)
                break;
            row.windows.push(window);
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
    const hspacing = (layout.maxColumns - 1) * columnSpacing;
    const vspacing = (layout.numRows - 1) * rowSpacing;
    const scale = Math.min(
        (area.width - hspacing) / layout.gridWidth,
        (area.height - vspacing) / layout.gridHeight,
        maxScale);
    const space = (layout.gridWidth * scale + hspacing) *
        (layout.gridHeight * scale + vspacing) / (area.width * area.height);
    return { scale, space };
}

/**
 * Place every window inside the area. Returns new rows because it annotates
 * them with scaled sizes and position; the caller owns the layout object.
 */
export function computeOverviewSlots({
    layout, area, scale, maxScale, columnSpacing, rowSpacing, monitorHeight,
}) {
    const rows = layout.rows.map(row => ({
        ...row,
        width: row.fullWidth * scale + (row.windows.length - 1) * columnSpacing,
        height: row.fullHeight * scale,
    }));

    const heightWithoutSpacing = rows.reduce((sum, row) => sum + row.height, 0);
    const verticalSpacing = (rows.length - 1) * rowSpacing;
    const additionalVerticalScale = Math.min(1,
        (area.height - verticalSpacing) / heightWithoutSpacing);

    let compensation = 0;
    let y = 0;
    for (const row of rows) {
        const horizontalSpacing = (row.windows.length - 1) * columnSpacing;
        const widthWithoutSpacing = row.width - horizontalSpacing;
        const additionalHorizontalScale = Math.min(1,
            (area.width - horizontalSpacing) / widthWithoutSpacing);

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
        for (const window of row.windows) {
            let windowRenderScale = scale * windowScale(window, monitorHeight) * row.additionalScale;
            const cellWidth = window.boundingBox.width * windowRenderScale;
            const cellHeight = window.boundingBox.height * windowRenderScale;
            windowRenderScale = Math.min(windowRenderScale, maxScale);
            const cloneWidth = window.boundingBox.width * windowRenderScale;
            const cloneHeight = window.boundingBox.height * windowRenderScale;
            const cloneY = rows.length === 1
                ? rowY + (rowHeight - cloneHeight) / 2
                : rowY + rowHeight - cellHeight;
            slots.push([
                Math.floor(x + (cellWidth - cloneWidth) / 2),
                Math.floor(cloneY),
                cloneWidth,
                cloneHeight,
                window,
            ]);
            x += cellWidth + columnSpacing;
        }
    }
    return { slots, rows };
}
