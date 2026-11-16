# Core and imperative shell review

Date: 2026-11-16. Baseline: `9f0618e`, branch `custom-stable`.
Scope: overview, horizontal gesture decisions, minimap presentation, row resize
feedback, and their direct shell adapters. No new state owner, settings
migration, support-version change, release or live-session reload.

## Boundary corrections

The previous overview extraction still accepted real `WindowPreview` objects.
Its arithmetic tests did not establish a plain-data boundary. The core now
accepts dimension snapshots and returns indices. Each adapter layout keeps its
own preview list outside the core. No strategy-global preview registry is
needed. Interleaved layout tests verify that indices map to the correct list.

GNOME's layout remains opaque to callers. Slot tuples still end with the exact
preview object, as required by focus ordering and removal. The adapter maps
indices back only at that boundary. Temporary copied-implementation parity
scripts are not a specification or an acceptance gate for this round.

## Extracted decisions

- **Gestures:** bounded recent samples, velocity, friction projection, edge snap,
  duration adjustment, and window selection now use plain facts. Update and
  release share the projection instead of maintaining duplicate formulas.
- **Minimap:** frame/buffer snapshots determine clone sizes, column placement,
  content extent, clip, centered actor and selection presentation. The adapter
  measures label text and applies the plan. No previous actor height is needed
  to derive the next layout.
- **Resize feedback:** `reconcileRow` distinguishes completed requests, unchanged
  pending/refused requests, and synchronous client adjustments. Measurements,
  resize effects, remembered targets and the bounded retry loop stay in `Space`.

## Verified defects

### Overview

A window rejected from a row still increased that row's height. The next row's
tall window therefore consumed space twice. Height now changes only after the
row accepts the window.

Zero-sized areas and empty rows could produce negative scale/occupied area or
NaN. Separator counts are non-negative, and empty dimensions avoid division by
zero. Tests use fixed expected cases, frozen snapshots and repeated allocation.

The sort adapter also treats an absent `Space` as untracked instead of calling
`indexOf` on undefined. This is tested against the method's return contract;
it is not presented as a newly reproduced compositor crash.

### Gestures

The signed `-1` direction from keyboard drift was truthy and selected as if
moving right. Signed intent now normalizes once at the adapter boundary.

The old partial-visibility decision compared only two flattened windows.
Stacked rows could occupy both candidates and hide a better candidate in the
next column. Selection now checks all intersecting windows by visible fraction
of each window's width. Tests include unequal widths and non-zero work areas.
The directional first/last fallback and exact-ratio tie convention are retained.

Projection no longer writes a hypothetical `space.targetX` before selecting.
The proposed offset also reaches `ensuredX` explicitly; passing only the live
offset would silently cancel or alter the glide. Tests forbid hypothetical
writes and check the offset passed across this seam.

Zero friction and equal event times produce finite decisions instead of an
infinite/NaN animation. The adapter keeps only the last three samples instead
of growing two parallel arrays throughout a gesture.

Touch input also reset its traveled distance before checking whether the event
was a swipe, so completion always propagated. It now classifies before cleanup.
Begin/update timestamps use the same touchscreen time factor; previously the
first samples mixed raw and scaled time. Both failures have adapter regressions.

### Minimap

The fixed 500-unit context margin could push the selected tile outside a
narrow clip. The margin is capped to the available space. A stale selection
hides both overlays. The adapter measures the new label instead of using its
previous allocation. Initial/repeated layouts derive the final actor size,
so centering does not depend on the previous render.

### Layout and grab adapters

The grabbed-column path returned only the anchor width. A wider neighboring
row could overlap the next column despite the normal layout path's maximum
width rule. Both paths now advance by their actual maximum.

A thrown layout effect left `_inLayout` true forever. A `finally` releases
the guard at its original boundary, before viewport/facade callbacks. This
does not roll back native effects already performed. Zero-width work areas
return before starting an unfinished animation. Retry tests retain the shared
five-retry limit across columns.

`MoveGrab.end` could destroy its signals twice. It now releases resources only
once. Mutter completion checks the existing `Grab.grabbed` flag, not the
nonexistent `inGrab.grabbed` property. Successful setup publishes that flag
last, so a thrown setup does not block the completion cleanup path. The obsolete
pre-GNOME-49 `end_grab_op` call is removed from setup.

## Redundancies removed

- The never-used centered-DnD mode, its alternate transform path and `Graphene`
  dependency, unused grab type/space parameters, and unreachable drop branch.
- A single-use preview-actor factory and redundant property copying.
- Parallel width/height-change accumulators in the shell; the core reports one
  feedback decision.
- Column width computation discarded immediately by the grabbed-column path.
- Repeated work-area lookups and preference-unit checks inside the row loop.
- Unused overview row annotations and returned annotation state.
- Duplicate initial minimap shading and derived actor/clip inputs.
- The unused minimap offset export and the child clone's duplicate window pointer;
  the container keeps the only window reference needed by its adapter.

## Follow-up fixes from this review

- `reconcileRow` exposes `widthChanged` and `heightChanged`. `Space` carries an
  accepted synchronous height in a per-layout map through the column retry;
  otherwise the retry would reserve the original request again.
- `MoveGrab.end` wraps teardown in `try/finally`. `Tiling.setInGrab(false)`, the
  pointer dispatcher dismissal and the cursor reset still run when a native
  effect or layout throws.
- `selectTargetWindow` accepts explicit fallback indices. `findTargetWindow`
  maps the right fallback to the first row of the last column, preserving the
  legacy stacked-column row.

## Remaining boundary

`Space` still owns the arrangement. Minimap keeps its rendered geometry plan
because later selection events use that render. Actors, settings, signals,
timers, lifecycle, animations and compositor observations remain imperative.
Vertical workspace gestures and multi-monitor transitions still mix decisions
with stateful effects. This review does not claim to complete the M4/M5
controller or the desktop scenario matrix.

Minimap still assumes its scaled column height fits the monitor. Native clients
can refuse a shrink, so the tiler's requested height budget alone does not prove
that assumption. Vertical overflow/scrolling for such oversized columns is not
implemented by this extraction.

Moving each remaining arithmetic expression into a wrapper would add argument
plumbing without establishing a useful boundary. The next substantial step
needs an explicit state/effect contract, not another parallel desktop model.

## Verification

Measured in this round:

- `node --test tests/core/`: 224 passing tests after the follow-up fixes.
- `gjs -m tests/gjs-core.js`: passes on GJS 1.90.0, from source and from the
  extracted release ZIP. The ZIP contains all nine core modules and no tests.
- JavaScript syntax and `git diff --check` pass.
- The five changed shell files shrink from 7,195 to 7,096 lines, including
  comments. New core code and tests add lines elsewhere; this is not a claim
  about total source size or performance.

### Native integration, not just enable/disable

An ephemeral test extension runs in a fresh private D-Bus session with keyfile
settings, private config/data/runtime directories, and GNOME Shell 51.0:

`gnome-shell --headless --wayland --virtual-monitor=1920x1080`

The test runs against source and the extracted release package. It opens two
real Wayland Alacritty clients and verifies:

- Both clients enter the tiled arrangement with positive native geometry.
- An actual `Minimap` allocates, selects, stays centered and destroys.
- Horizontal update/release produces a finite target and a managed selection.
- The actual pointer dispatcher begins/ends; repeated end leaves no active grab.
- Overview opens with real `WindowPreview` actors. Slot dimensions remain finite
  and the last tuple entry is the correct preview.
- Three disable/enable cycles return PaperWM to ACTIVE.

The final packaged run logs four enables and three disables, with no uncaught
`JS ERROR` or `CRITICAL`. Fresh settings still produce the existing caught warning
about an empty saved-state JSON value. This review does not silently classify
that warning as a clean log or fix it outside the current scope.

The live extension list and installed symlink remain unchanged. No unsafe-mode
override is used. The test extension and its runner are session-local diagnostic
files, not a new maintained integration framework. See the
[testing notes](../../tests/README.md) for the headless/isolation distinction.

This native test invokes adapter methods. It does not test physical touchpad or
touchscreen routing, interactive DnD, multi-monitor behavior, or the entire
desktop scenario matrix. Node fakes and the native check have different limits.
