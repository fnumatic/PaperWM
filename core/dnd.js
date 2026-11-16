/**
 * Drop zones in target-scroll coordinates. Columns contain only row rectangles.
 * Column insertion zones take precedence over overlapping vertical row zones.
 */
export function selectDndTarget({ columns, x, y, gap, viewportWidth, scrollOffsetX }) {
    const halfGap = gap / 2;
    const columnMargin = columns.some(rows => rows.length) ? 100 + halfGap : Math.round(viewportWidth / 4);
    const rowMargin = 250 + halfGap;
    const boxes = columns.map(rows => rows.length
        ? { x: rows[0].x, width: Math.max(...rows.map(row => row.width)) }
        : null);
    const last = boxes.filter(Boolean).at(-1);
    boxes.push({
        x: last ? last.x + last.width + gap
            : Math.round(viewportWidth / 2) - scrollOffsetX + halfGap,
        width: columnMargin,
    });

    for (let j = 0; j < boxes.length; j++) {
        const box = boxes[j];
        if (!box || x > box.x + box.width)
            continue;
        const center = box.x - halfGap;
        if (center - columnMargin <= x && x <= center + columnMargin)
            return { position: [j], center, marginA: 100 + halfGap, marginB: 100 + halfGap };
    }

    for (let j = 0; j < columns.length; j++) {
        const rows = columns[j];
        const box = boxes[j];
        if (!box || x < box.x || x > box.x + box.width)
            continue;
        const lastRow = rows.at(-1);
        const edges = rows.concat({ ...lastRow, y: lastRow.y + lastRow.height + gap });
        for (let i = 0; i < edges.length; i++) {
            const row = edges[i];
            const center = row.y - halfGap;
            if (center - rowMargin <= y && y <= center + rowMargin) {
                return {
                    position: [j, i], center,
                    marginA: i === 0 ? 0 : rowMargin,
                    marginB: i === rows.length ? 0 : rowMargin,
                    anchor: { x: row.x, width: row.width },
                };
            }
        }
    }
    return null;
}

/** Space identity belongs to the adapter; the core compares only insertion slots. */
export function sameDndTarget(a, b) {
    return a === b || Boolean(a && b && a.position.length === b.position.length &&
        a.position[0] === b.position[0] && a.position[1] === b.position[1]);
}
