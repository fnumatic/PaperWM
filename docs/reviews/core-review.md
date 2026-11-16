# Core review

Date: 2026-11-16. Scope: `core/` at commit `71d2450` plus the changes in this
round. Read-only findings from code inspection; behavior claims are backed by
the parity scripts, not by a running desktop.

## Fixed in this round

- `layoutWorkArea` applied a panel-height change and immediately reversed it
  when the position bar was visible. Now a single condition
  (`!showTopBar && !showPositionBar`).
- `ensuredX` took a `frame` object but used only `frame.width`, and a
  `hasLastFrame` flag that duplicated `lastFrameX === undefined`. Now
  `frameWidth` plus the existing `lastFrameX` convention.
- `fitProportionally` indexed `weights` through the values array; now maps
  weights directly.
- `slurpPlan` guarded `columnLengths[from]` with `?? 0` after an explicit range
  check; removed.
- `core/README.md` claimed window IDs; the core uses indices only.

## Defects and contradictions (not changed)

1. `navigation.js:41` — `nextLinear` returns an index outside the space when
   `loop` is off and the step leaves the last column. Every other core function
   returns `null` for an impossible result. The adapter then calls
   `getWindow(outOfRange)` (returns `false`) and `ensureViewport(false)`.
   Fix: return `null`; the adapter returns `false` like `switch()` does.
2. `arrangement.js:96` — `swapTarget` checks `targetRow` against the *source*
   column length but the swap happens in the *target* column after the columns
   were exchanged. With different column heights this can trade in an
   `undefined` row. Fix: pass the target column length as well.
3. `geometry.js:211` — `isAutoCentered` compares `targetX <= 0` instead of
   `targetX <= min`. Wrong for a monitor whose work area does not start at 0.
   Legacy behavior, kept.
4. `geometry.js:230` — `autoPanTargetX` compares against `workArea.min`, which
   never exists, so the branch is unreachable. Documented and pinned by tests;
   remove once the intent is confirmed.
5. `layout.js:42` — when `selectedIndex` is `-1` (selected window lost its
   actor and was filtered out), `splice(-1, 1)` removes the last row instead of
   none. Reachable, legacy behavior, not changed.
6. `layout.js:14` — `fitProportionally` yields `NaN` for a zero total. The
   adapter now skips non-finite rows and logs; the core still returns `NaN`.
7. `geometry.js:192` — `isPlaceable` uses the global work area while
   `isVisible` uses the monitor-local one. A coordinate inconsistency inherited
   from the original code.

## Redundancy, left on purpose

- `visibleRatio` is a second name for `isFullyVisible`; the boolean return does
  not match the name.
- `stepColumn` and `stepRow` are identical; separate names document intent.
- `autoPanTargetX` clamps `contentWidth` although the adapter already clamps it.
- `selectDndTarget` returns an `anchor` for column targets that the adapter
  ignores.

## Next candidates

1. Make `nextLinear` return `null` and adapt `switchLinear` — small, testable.
2. Fix `swapTarget` with the target column length — needs a decision about
   existing behavior.
3. Decide on `isAutoCentered` and `autoPanTargetX` monitor-origin handling.

Items 1 and 3 change observable behavior; each needs its own round and test.
