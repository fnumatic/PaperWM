import test from 'node:test';
import assert from 'node:assert/strict';

import { winpropMatches, selectWinprop } from '../../core/winprops.js';

test('winpropMatches compares the window class exactly', () => {
    assert.equal(winpropMatches({ wmClass: 'Firefox' }, { wm_class: 'Firefox' }), true);
    assert.equal(winpropMatches({ wmClass: 'Firefox' }, { wm_class: 'Chromium' }), false);
});

test('winpropMatches treats a missing class as empty', () => {
    assert.equal(winpropMatches({}, { wm_class: '' }), true);
    assert.equal(winpropMatches({}, { wm_class: 'Firefox' }), false);
});

test('winpropMatches supports regular expressions', () => {
    assert.equal(
        winpropMatches({ wmClass: 'org.gnome.Nautilus' }, { wm_class: /nautilus/i }),
        true);
});

test('winpropMatches matches titles and combines both fields', () => {
    assert.equal(winpropMatches({ wmClass: 'A', title: 'Scratch' }, { title: 'Scratch' }), true);
    assert.equal(
        winpropMatches({ wmClass: 'A', title: 'Scratch' }, { wm_class: 'B', title: 'Scratch' }),
        false);
});

test('winpropMatches does not throw on a missing title with a title regex', () => {
    assert.equal(winpropMatches({ wmClass: 'A', title: null }, { title: /./ }), false);
});

test('selectWinprop returns the first match', () => {
    const props = [
        { wm_class: 'Other', scratch_layer: false },
        { wm_class: 'Firefox', scratch_layer: true },
        { wm_class: 'Firefox', scratch_layer: false },
    ];
    assert.deepEqual(
        selectWinprop({ wmClass: 'Firefox', title: 'x', props }),
        { wm_class: 'Firefox', scratch_layer: true });
});

test('selectWinprop falls back to the first catch-all rule', () => {
    const props = [
        { wm_class: 'Other' },
        { wm_class: '*', scratch_layer: true },
        { title: '*' },
    ];
    assert.deepEqual(
        selectWinprop({ wmClass: 'Firefox', title: 'x', props }),
        { wm_class: '*', scratch_layer: true });
});

test('selectWinprop returns null without a match', () => {
    assert.equal(
        selectWinprop({ wmClass: 'Firefox', title: 'x', props: [{ wm_class: 'Other' }] }),
        null);
});
