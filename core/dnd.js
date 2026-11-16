/**
 * Pure drag-and-drop hit testing over column and row zones.
 *
 * Coordinates are scroll coordinates. Callers supply measured geometry and
 * receive the chosen slot; actors, animation and the space stay outside.
 *
 * An empty trailing zone (the "new column" target) has no row zones. The
 * legacy code walked it as if it had rows and would throw; this returns no
 * target for it instead.
 */
export function selectDndTarget({
    columns,
    x,
    y,
    gap,
    columnZoneMargin,
    columnZoneMarginViz,
    rowZoneMargin,
    emptyTargetX,
}) {
    const halfGap = gap / 2;
    const all = columns.concat([{
        x: columns.length > 0
            ? columns[columns.length - 1].x + columns[columns.length - 1].width + gap
            : emptyTargetX,
        width: columnZoneMargin,
        rows: [],
    }]);

    for (let j = 0; j < all.length; j++) {
        const { x: colX, width: colW, rows } = all[j];

        // Fast forward if the pointer is not inside the column or its zone
        if (x < colX - gap - columnZoneMargin)
            continue;
        if (colX + colW < x)
            continue;

        const cx = colX - halfGap;
        const l = cx - columnZoneMargin;
        const r = cx + columnZoneMargin;
        if (l <= x && x <= r) {
            return {
                position: [j],
                center: cx,
                originProp: 'x',
                sizeProp: 'width',
                marginA: columnZoneMarginViz,
                marginB: columnZoneMarginViz,
                anchor: { x: colX, width: colW },
            };
        }

        // Must be strictly within the column to tile vertically
        if (x < colX)
            continue;
        if (rows.length === 0)
            continue;

        for (let i = 0; i < rows.length + 1; i++) {
            let row;
            if (i < rows.length) {
                row = rows[i];
            } else {
                const last = rows[i - 1];
                row = { x: last.x, y: last.y + last.height + gap, width: last.width, height: 0 };
            }

            const isFirst = i === 0;
            const isLast = i === rows.length;
            const cy = row.y - halfGap;
            const t = cy - rowZoneMargin;
            const b = cy + rowZoneMargin;
            if (t <= y && y <= b) {
                return {
                    position: [j, i],
                    center: cy,
                    originProp: 'y',
                    sizeProp: 'height',
                    marginA: isFirst ? 0 : rowZoneMargin,
                    marginB: isLast ? 0 : rowZoneMargin,
                    anchor: { x: row.x, width: row.width },
                };
            }
        }
    }

    return null;
}

/**
 * Whether two drop targets describe the same slot. The space is compared by
 * the caller.
 */
export function sameDndTarget(a, b) {
    if (a === b)
        return true;
    if (!a || !b)
        return false;
    if (a.position.length !== b.position.length)
        return false;

    return a.position[0] === b.position[0] &&
        a.position[1] === b.position[1];
}
