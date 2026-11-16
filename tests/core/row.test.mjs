import test from 'node:test';
import assert from 'node:assert/strict';

import { planRow } from '../../core/geometry.js';

const base = {
    y: 32,
    targetWidth: 800,
    targetHeight: 500,
    gap: 8,
    verticalMargin: 4,
    workAreaWidth: 1920,
    horizontalMargin: 10,
    resizable: true,
    frameWidth: 800,
    frameHeight: 500,
    maximizedVertically: false,
    preferredWidth: null,
};

test('planRow keeps the given target when nothing overrides it', () => {
    assert.deepEqual(planRow(base), {
        y: 32, width: 800, height: 500, warnings: [],
    });
});

test('planRow applies a pixel preferred width', () => {
    const result = planRow({ ...base, preferredWidth: { value: 600, unit: 'px' } });
    assert.equal(result.width, 600);
});

test('planRow computes a percentage against margins and gap', () => {
    const result = planRow({ ...base, preferredWidth: { value: 50, unit: '%' } });
    assert.equal(result.width, Math.floor((1920 - 20 - 8) * 0.5));
});

test('planRow caps percentages at the full available width', () => {
    const result = planRow({ ...base, preferredWidth: { value: 150, unit: '%' } });
    assert.equal(result.width, 1920 - 20 - 8);
});

test('planRow warns about invalid preferred width values and units', () => {
    assert.deepEqual(
        planRow({ ...base, preferredWidth: { value: 0, unit: 'px' } }).warnings,
        ['invalid preferredWidth value']);
    assert.deepEqual(
        planRow({ ...base, preferredWidth: { value: 100, unit: 'em' } }).warnings,
        ["invalid preferredWidth unit: 'em' (should be 'px' or '%')"]);
});

test('planRow lets a non-resizable window keep its frame size', () => {
    const result = planRow({ ...base, resizable: false, frameWidth: 640, frameHeight: 480 });
    assert.equal(result.width, 640);
    assert.equal(result.height, 480);
});

test('planRow shifts a maximized-vertical row up by the vertical margin', () => {
    assert.equal(planRow({ ...base, maximizedVertically: true }).y, 28);
});

test('planRow does not mutate its input', () => {
    const input = { ...base, preferredWidth: { value: 600, unit: 'px' } };
    const copy = structuredClone(input);
    planRow(input);
    assert.deepEqual(input, copy);
});
