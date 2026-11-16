# Core review

Date: 2026-11-16. Scope: `core/` after the fixes in this round. Findings come
from code inspection; behavior claims were checked with parity scripts against
the pre-refactor implementation and with the unit tests.

## Fixed: simplification

- `layoutWorkArea` applied a panel-height change and reversed it when the
  position bar was visible. Now a single condition.
- `ensuredX` took a `frame` object but used only `frame.width`, plus a
  `hasLastFrame` flag duplicating `lastFrameX === undefined`. Now `frameWidth`
  and the `lastFrameX` convention.
- `fitProportionally` indexed weights through the values array; now maps
  weights directly.
- `slurpPlan` guarded `columnLengths[from]` with `?? 0` after an explicit range
  check; removed.
- `core/README.md` claimed window IDs; the core uses indices only.

## Fixed: defects

1. `nextLinear` now returns `null` instead of an index outside the space. Every
   core result is a valid slot or `null`. `switchLinear` returns `false` on
   `null`.
2. `swapTarget` checks the target row against the **target** column length,
   after the columns are exchanged. A shorter target column now yields `null`
   instead of exchanging an `undefined` row.
3. `isAutoCentered` compares against `workArea.x` instead of `0`, so monitors
   with a non-zero origin behave correctly.
4. `autoPanTargetX` lost the unreachable `workArea.min` branch.
5. `allocateDefault` treats an invalid `selectedIndex` (`-1`, out of range, not
   an integer) as "no selection" instead of removing the last row.
6. `fitProportionally` spreads evenly for a zero total and returns `[]` for
   empty input, instead of `NaN`.
7. `isPlaceable` uses the monitor-local work area like the other predicates;
   the `monitorX` parameter is gone.

## Deliberate behavior changes

Each item above changes behavior only where the old result was invalid
(`NaN`, `undefined` row, dead branch) or wrong for a non-zero monitor origin.
The unit tests pin the new results. The old parity scripts now report exactly
these differences and are no longer used as a gate.

## Left as is

- `visibleRatio` remains a second name for `isFullyVisible`. Renaming it would
  change the `Space` API.
- `stepColumn` and `stepRow` are identical but carry different names and docs.
- `autoPanTargetX` clamps `contentWidth` although the adapter already does.
- `selectDndTarget` returns an `anchor` for column targets that the adapter
  ignores; it describes the same column geometry.
- `openWindowIndex` returns `columnCount + 1` for `end`. Legacy, tested.

## Verification

- 115 unit tests pass.
- Isolated nested shell: three enable/disable cycles, no JS errors.
- Live settings unchanged during the runs.
