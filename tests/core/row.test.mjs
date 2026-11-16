import test from 'node:test';
import assert from 'node:assert/strict';

import { planRow, reconcileRow } from '../../core/geometry.js';

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

test('pixel preferences become primitive numbers, not boxed Number values', () => {
    const result = planRow({ ...base, preferredWidth: { value: Object(600), unit: 'px' } });
    assert.equal(result.width, 600);
    assert.equal(Number.isFinite(result.width), true);
});

test('native targets remain positive when margins or row budgets exhaust the work area', () => {
    const result = planRow({
        ...base, workAreaWidth: 10, targetHeight: 0,
        preferredWidth: { value: 50, unit: '%' },
    });
    assert.equal(result.width, 1);
    assert.equal(result.height, 1);
});

test('non-finite preferred widths warn instead of poisoning a target', () => {
    const result = planRow({ ...base, preferredWidth: { value: NaN, unit: 'px' } });
    assert.equal(result.width, 800);
    assert.equal(result.warnings.length, 1);
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

test('resize feedback distinguishes completion, pending work and synchronous constraints', () => {
    const before = Object.freeze({ width: 800, height: 600 });
    const requested = Object.freeze({ width: 500, height: 400 });
    assert.deepEqual(reconcileRow({ before, requested, observed: requested }), {
        width: 500, height: 400, needsRelayout: false,
    });
    assert.deepEqual(reconcileRow({ before, requested, observed: before }), {
        width: 800, height: 600, needsRelayout: false,
    });
    const observed = Object.freeze({ width: 550, height: 450 });
    assert.deepEqual(reconcileRow({ before, requested, observed }), {
        width: 550, height: 450, needsRelayout: true,
    });
});

test('a pending growth reserves the requested size but accepted feedback takes precedence', () => {
    const before = { width: 500, height: 400 };
    const requested = { width: 800, height: 600 };
    assert.deepEqual(reconcileRow({ before, requested, observed: before }), {
        width: 800, height: 600, needsRelayout: false,
    });
    assert.deepEqual(reconcileRow({ before, requested, observed: { width: 750, height: 550 } }), {
        width: 800, height: 550, needsRelayout: true,
    });
});
