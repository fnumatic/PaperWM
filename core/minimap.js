/**
 * Pure minimap geometry.
 *
 * Inputs are plain screen rectangles. The adapter owns windows, clones, actors,
 * signals, settings and animations. Frame/buffer coordinates are logical
 * compositor units; the result uses scaled minimap coordinates.
 */

const PADDING = 12;
const EDGE_INSET = 24;
const LABEL_GAP = 8;
const LABEL_SLACK = 5;
const BOTTOM_PADDING = 40;
const SCROLL_MARGIN = 500;

const nonNegative = value => Math.max(0, Number.isFinite(value) ? value : 0);

function planClone({ buffer, frame, scale, gap }) {
    return {
        container: {
            width: nonNegative(frame.width * scale),
            height: nonNegative(frame.height * scale),
        },
        clone: {
            x: (buffer.x - frame.x) * scale,
            y: (buffer.y - frame.y) * scale,
            width: nonNegative(buffer.width * scale),
            // The legacy geometry leaves a gap below each minimap tile.
            height: nonNegative(buffer.height * scale - gap),
        },
    };
}

/**
 * Clone geometry, column placement, clip and the complete centered actor.
 *
 * `columns` mirrors the space: one array of `{buffer, frame}` plain rectangles
 * per window, in column order. The adapter applies the returned rectangles;
 * label measurement and animation stay outside.
 */
export function planMinimapLayout({ columns, monitor, scale, gap }) {
    const placed = [];
    let x = 0;
    let contentWidth = 0;
    let contentHeight = 0;

    for (const column of columns) {
        let y = 0;
        let width = 0;
        const clones = [];

        for (const window of column) {
            const geometry = planClone({ ...window, scale, gap });
            clones.push({ x, y, ...geometry });
            width = Math.max(width, geometry.container.width);
            y += geometry.container.height;
        }

        placed.push(clones);
        if (column.length > 0)
            contentWidth = x + width;
        contentHeight = Math.max(contentHeight, y);
        x += width + gap;
    }

    const clipX = PADDING + gap;
    const clipY = PADDING + Math.round(1.5 * gap);
    const clipWidth = Math.max(0, Math.min(contentWidth,
        monitor.width - clipX * 2 - EDGE_INSET));
    const actorWidth = clipWidth + clipX * 2;
    const actorHeight = clipY + contentHeight + BOTTOM_PADDING;

    return {
        columns: placed,
        content: { width: contentWidth, height: contentHeight },
        clip: {
            x: clipX,
            y: clipY,
            width: clipWidth,
            height: contentHeight,
        },
        actor: {
            x: monitor.x + Math.floor((monitor.width - actorWidth) / 2),
            y: monitor.y + Math.floor((monitor.height - actorHeight) / 2),
            width: actorWidth,
            height: actorHeight,
        },
    };
}

/**
 * Scroll, highlight and label placement for one selected clone.
 *
 * A visible selection keeps the caller's scroll offset unless it leaves the
 * clip. The legacy 500px context margin is capped so it can never push the
 * selected window out of a narrow viewport. A null or stale position hides
 * every selection overlay.
 */
export function planMinimapSelection({
    layout,
    position,
    labelWidth,
    gap,
    containerX = 0,
}) {
    const index = position?.[0];
    const row = position?.[1];
    if (!Number.isInteger(index) || !Number.isInteger(row) ||
        index < 0 || row < 0)
        return { visible: false };

    const selected = layout?.columns?.[index]?.[row];
    if (!selected)
        return { visible: false };

    const clip = layout.clip;
    const container = layout.content;
    const width = nonNegative(labelWidth);
    const selectedWidth = selected.container.width;
    const selectedHeight = selected.container.height;
    const selectionRight = selected.x + selectedWidth;
    const visibleMargin = Math.min(
        SCROLL_MARGIN,
        Math.max(0, clip.width - selectedWidth));

    const minX = Math.min(0, clip.width - container.width);
    let x = Number.isFinite(containerX) ? containerX : 0;

    if (selectionRight + x > clip.width)
        x = clip.width - selectionRight - visibleMargin;
    else if (selected.x + x < 0)
        x = -selected.x + visibleMargin;

    // Keep the content inside the clip, but prefer the selection alignment
    // when the selected window is wider than the viewport.
    x = Math.min(0, Math.max(x, minX));

    const highlight = {
        x: Math.round(clip.x + x + selected.x - gap / 2),
        y: Math.round(clip.y + selected.y - gap),
        width: Math.round(selectedWidth + gap),
        height: Math.round(Math.min(selectedHeight, clip.height + gap) + gap),
    };

    let labelX = highlight.x + (highlight.width - width) / 2;
    if (labelX + width > clip.x + clip.width)
        labelX = clip.x + clip.width - width + LABEL_SLACK;
    if (labelX < 0)
        labelX = clip.x - LABEL_SLACK;

    return {
        visible: true,
        containerX: x,
        highlight,
        label: {
            x: Math.round(labelX),
            y: clip.y + clip.height + LABEL_GAP,
        },
    };
}
