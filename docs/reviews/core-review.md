# Core simplification review

Date: 2026-11-16. Review baseline: `cbb8921`, branch `custom-stable`.
Scope: the six core modules, their direct callers, and regression tests.
Lifecycle, GNOME support, and desktop deployment are outside this round.

This review supersedes the previous report. Repeating a copied implementation
is not an independent specification, and passing parity cases cannot establish
that all differences are intentional.

## Verified defects and corrections

### Swap: the earlier review reversed the actual execution order

`Space.swap` in `tiling.js` swaps rows **in the source column**, then swaps
whole columns. A horizontal move therefore never accesses a row in the
destination column. The earlier "fix" checked the destination's row count and
rejected valid horizontal moves.

Reproduction: move the selected third row of `[['a', 'b', 'c'], ['d']]` right.
The required result is `[['d'], ['a', 'b', 'c']]`. The old check silently did
nothing. The correction validates source rows and destination column bounds.
An adapter contract test executes the actual `Space.swap` method body and
checks the arrangement and emitted signal, without loading GNOME.

### Window rules: regex state violated the pure-core contract

Matching `/Firefox/y` twice produced `true`, then `false`; the first match
advanced the caller's `lastIndex` to 7. Frozen global/sticky regexes threw
instead of matching. The generic contract test deliberately excluded regexes
from freezing and missed the problem.

Matching now clones regex patterns and starts them at zero. A shared field
matcher replaces the duplicated class/title branches. Selection uses `find`
instead of filtering the whole rule list. Rule precedence and the legacy
catch-all fallback remain unchanged.

### Allocation: negative dimensions, overflow, and duplicate selection data

`fitProportionally([1, 1, 1, 1], 2)` returned `[-1, 1, 1, 1]`: concentrating
the entire rounding correction on the first row could make it negative.
Corrections now consume only available height in each row.

`allocateDefault` could give the selected row a negative height in a crowded
column, or reserve more height than available when no row was selected.
Its optional `selectedHeight` input duplicated `heights[selectedIndex]` and
omitting it produced NaN. The input is removed; the budget is computed once.
When the preferred budget for other rows cannot fit, all rows scale down.
Equal-height allocation also clamps an exhausted budget to zero.

The default of 50 is not a hard per-row minimum. It is an aggregate preference
for the other rows. Native requests still need positive dimensions, and clients
can impose larger minimum sizes; the adapter retains observed geometry when a
shrink is pending or refused. Fitting every native window into insufficient
space is not guaranteed by an arithmetic test.

### Navigation and arrangement: one source of bounds

`stepColumn` and `stepRow` contained the same algorithm. They are replaced with
`stepIndex`, including correct multi-step wrapping and an empty-list result.
Linear navigation skips empty columns rather than returning nonexistent rows.

Insertion decisions now return indices in `[0, columnCount]`: `end` returns
the actual append position and `left` without a selection starts at zero.
Slurp plans contain only `{from, row}` instead of nested index/push variants.
Barf returns a numeric insertion index or null; index zero is not rejected as
falsy. Unknown swap directions and missing windows no longer produce a no-op
swap or a destructuring error.

### DnD: precedence, stale targets, and redundant geometry

The extracted hit test returned on the first row hit. The original loop could
instead select a later column's overlapping insertion zone. With 800-unit
columns at x=20 and x=840, gap=20, pointer (750,300), the extracted core
returned `[0,1]` instead of the insertion slot `[1]`. The claimed temporary
parity run did not establish equivalence.

Column insertion zones now run before row zones. The input is just nested row
rectangles plus pointer/viewport facts. The core derives column width from its
widest row and computes the empty-space zone in target-scroll coordinates.
The adapter no longer supplies duplicate width/margin/empty-target facts or
mixes an animated scroll offset with target coordinates.

Leaving all zones previously called `activateDndTarget(null)`, which did
nothing and left the last drop target active. It now deactivates the old
preview and clears the target. The redundant one-element `dndTargets` array
is removed; the actor set remains necessary for fading-preview cleanup.

### Column geometry: widest row, not last row

Preferred widths previously leaked into subsequent rows. Column advance used
the last row's width while DnD used the first row's width. Unequal row widths
could overlap the next column and disagree with drop zones. The adapter plans
each row from the column's base width and advances by the widest requested or
observed width. Invalid plans do not poison subsequent rows' y coordinates.

The preference parser also constructed boxed `Number` values. Pixel widths
then failed the adapter's `Number.isFinite` guard. Values now normalize to
primitive numbers, and tests include that boundary case.

### Overview: the last large block of pure arithmetic

`overviewlayout.js` carried about 240 lines of grid arithmetic inside a GNOME
`LayoutStrategy`. The strategy now only sorts windows, reads settings/monitor
metrics and delegates. `core/overview.js` computes layout rows, scale and slots
from plain boxes.

Verified against the previous implementation on 5,000 generated layouts: scale,
area ratio and every slot matched. The core returns new rows instead of
annotating the caller's layout; the adapter assigns them back because the shell
strategy contract exposes `layout.rows`.

### Drag column heights

The above/anchor/below split during a drag no longer lives in `tiling.js`.
`grabColumnHeights` returns the three values; negative remainders are clamped by
the allocator, not silently passed to a resize.

### Viewport: one decision instead of a duplicated automatic-mode input

Automatic-mode detection and target calculation are one `autoPanTargetX`
operation. It returns null for a manually scrolled viewport. Centered content
that becomes wider now clamps to the work area's left edge instead of retaining
a positive offset. One center formula replaces repeated arithmetic.

The final two minimum-margin branches in `ensuredX` were ineffective for
actual settings: a positive horizontal margin triggered an earlier clamp;
with zero horizontal margin the derived minimum margin was also zero. They
and the redundant input are removed. Fullscreen origin overrides center mode.
Visibility and placeability share one overlap predicate.

## Verification boundaries

- Regression tests reproduce failures before fixing production code.
- Adapter tests use actual extracted method bodies with small dependency fakes;
  they test the seam, not Mutter or Clutter behavior.
- The source boundary check now rejects common ambient effects, dynamic imports,
  side-effect imports, and dependencies outside the core. It is not a proof of
  purity or a security sandbox.
- `tests/gjs-core.js` checks imports and representative results in GJS.
- No GUI session, live settings change, or new deployment is part of this review.

Measured in this round:

- `node --test tests/core/`: 137 passing tests on Node 26.12.1.
- `gjs -m tests/gjs-core.js`: assertions pass on GJS 1.90.0.
- The same GJS smoke passes against modules extracted from the release ZIP.
- JavaScript syntax and `git diff --check` pass.
- The six core JS files shrink from 629 to 445 lines, including comments.
  This is a source-size measurement, not a performance benchmark.

## Deliberately retained

- The shell-facing `visibleRatio` alias remains for compatibility; the core has
  no duplicate function.
- Equal-height allocation still floors each row and can leave a small remainder.
- `isFullyVisible` retains its strict right-edge comparison. The test states
  this legacy convention rather than silently changing it.
- The existing catch-all window-rule fallback remains even when the same rule
  contains another nonmatching field.
- The core remains a stateless decision library. State ownership and complete
  compositor reconciliation are unfinished migration work, not solved here.
