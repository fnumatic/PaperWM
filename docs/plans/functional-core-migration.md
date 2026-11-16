# Plan: a functional core for PaperWM

Date: 2026-11-16

Status: proposed implementation plan; no runtime changes authorized by this
document. The user requests a stable logical core isolated from coeffects and
side effects. Exact APIs below are design proposals, not existing exports.

Progress: M0 (test harness, boundary) and M1 (column allocation extraction) are
implemented. M2 is complete for arithmetic: work-area adjustment, column target
widths, per-row planning, the auto-pan decision, the `ensuredX` viewport policy
and the visibility/placeability predicates live in `core/geometry.js`. M3
started: linear and directional navigation arithmetic lives in
`core/navigation.js`; open-window and swap targets live in
`core/arrangement.js`; window-rule matching lives in `core/winprops.js`.
Synchronous resize feedback, stacking order, actor work and the
`ensureViewport` animation path stay in `tiling.js`.
`node --test tests/core/` covers the extracted arithmetic and the import
boundary; parity with the legacy implementation was checked on 20,000 generated
columns, 20,000 rows, 20,000 geometry rounds, 30,000 viewport rounds, 30,000
navigation rounds, 120,000 visibility checks and 60,000 arrangement checks
before replacing it. The isolated M0 harness and the GNOME-run gates are still
outstanding. State ownership and lifecycle changes remain open.

Baseline: `custom-stable`, commit `2d460db` (`v51.0.0`).

## 1. Objective and constraints

Separate window-management decisions from GNOME Shell integration:

- The core computes arrangements, selection, viewport targets, and requested
  actions using explicit data.
- The shell adapter observes the desktop, normalizes observations, executes
  requested actions, and manages resources.
- Given the same state and inputs, the core returns the same result.
- Core tests run without a display server, GNOME, GJS, or a logged-in desktop.
- Preserve current behavior before introducing deliberate behavior changes.
- Keep `main` aligned with upstream `release`. Implement the fork's changes on
  `custom-stable`; upstream synchronization remains explicit, not automatic.
- Do not switch the active desktop between branches during development.
  `~/.local/share/gnome-shell/extensions/paperwm@paperwm.github.com` links to
  `~/src/PaperWM`. A branch switch changes files used by the installed extension.
- Keep the extension UUID, GSettings schemas, stored preferences, CSS loading,
  and keybinding names stable.

Non-goals: rewrite the compositor, replace GNOME, change the UI, migrate to
TypeScript, add a framework, implement event sourcing, or fix every open issue.
Review compliance is a separate workstream. A pure core alone does not solve
timer cleanup, monkey-patch restoration, or extension-site review requirements.

## 2. Corrected baseline

The current implementation is imperative and tightly integrated with the shell,
but it is not devoid of logic that can be tested independently:

- `lib.js:1-4` explicitly describes an independent utility library.
  `findNext`, `findPrev`, `arrayEqual`, and `eq` already use plain inputs.
  `swap` mutates its supplied array; not every utility is pure.
- `acceleratorparse.js` is also GI-free and can receive baseline tests without
  moving production code.
- `settings.js:19-22` defines policy constants, while `settings.js:27-122`
  reads and watches GSettings. Policy data and observation share one module.
- `settings.js:362-443` mixes window-rule matching, precedence, and mutation of
  a global rule list. Matching can accept plain window facts and explicit rules.
- `workspace.js:49-78` couples workspace lookup, identity creation, and
  persistent settings. Identity allocation belongs outside the core.
- `keybindings.js:19-55` owns accelerator wiring and settings overrides.
  Its actions directly call window-management methods.
- `minimap.js:18-76` uses live `Space` state and signals.
  `minimap.js:145-163` creates clones from nested columns of live windows.
- `topbar.js:184-197` directly invokes navigation and focus operations.

`Space` is not a flat array of windows. It contains columns, each containing
vertically stacked windows. Conflating columns, windows, and workspaces would
produce the wrong replacement model. See [the glossary](../../GLOSSARY.md).

### Extraction map verified against the baseline

| Responsibility | Existing code | Boundary to extract |
| --- | --- | --- |
| Proportional fitting | `tiling.js:5283-5293` | Already plain arithmetic; define zero-sum/empty input behavior |
| Default/equal row allocation | `tiling.js:5295-5340` | Heights, selected row, available height, gap |
| Work area | `tiling.js:518-526`, `681-708` | Explicit panel, monitor, margins and visibility facts |
| Column planning/application | `tiling.js:561-647`, `714-777` | Separate targets from resize and actor operations |
| Layout negotiation | `tiling.js:754-762`, `3780-3896` | Keep observed-size feedback in the shell controller |
| Viewport policy | `tiling.js:770-793`, `4412-4465` | Distinguish layout and navigation conventions |
| Coordinate conversion | `tiling.js:1329-1346` | Explicit current versus target scroll offsets |
| Add/remove/swap | `tiling.js:910-1094` | Arrangement transition plus preserved facade notifications |
| Drag/drop target choice | `grab.js:214-338` | Data-only hit testing; actor work stays in grab adapter |
| Column stacking/unstacking | `tiling.js:5349-5480` | Pure index/arrangement decisions |

Additional constraints:

- `Space.indexOf` returns a column index (`tiling.js:1316-1322`), not a plain
  array lookup. The plain-data core must not inherit this overloaded API.
- `_floating` and `visible` are separate from tiled columns. Attached floating
  windows, sticky windows, and scratch windows need separate adapter handling.
- Existing allocator callbacks accept live windows. Preserve their internal
  caller contract while replacing built-ins; never pass these callbacks into
  the pure core.
- `virtTiling.js` is a development experiment, not an authoritative model:
  it diverges from the production allocator. Do not use it as the parity oracle.
- Current minimum-size behavior relies on accepted client geometry, not a
  complete size-hints model. Do not invent trustworthy constraints at the
  boundary if the adapter cannot actually observe them.
- `extension.js:163-175` has the legacy `user.js` loader commented out;
  `config/user.js:5-10` documents the GNOME 45 break. Live customization uses
  GSettings (including window rules/keybindings) and `user.css`, not loaded
  `user.js` hooks. Reviving JavaScript user configuration is out of scope.

### Lifecycle findings that the core extraction does not solve

These are source-level risks, not newly reproduced desktop failures:

- `extension.js:57-80` enables modules in order and disables them in reverse,
  without tracking successful partial initialization or rolling it back.
- `settings.js:89,92` connects GSettings handlers without storing their IDs;
  disable clears `prefs` and the settings references (`110-116`).
  Audit this together with direct settings connections in `Tiling`.
- `navigator.js:43-50` clears the dispatcher reference. Check whether every
  lifecycle path first calls its destroy/Modal-grab cleanup, including failed
  initialization and disable during navigation.
- Asynchronous monitor initialization can complete after disable. Callback
  generations must cover D-Bus replies as well as timers and animations.

Inventory these in M0. Address verified defects in separate behavior-change
rounds with their own tests, before relying on lifecycle guarantees in M4.
Do not mix them invisibly into arithmetic extraction commits.

## 3. Target boundary

```text
GNOME/GSettings/user configuration
              |
              | observations, preferences, input events
              v
     observation adapter
              |
              | plain data with explicit units and identities
              v
     controller / serialized turn
              |
              v
          pure core
              |
              | next state + requested actions + layout targets
              v
     effect executor / presenter
              |
              v
GNOME windows, actors, focus, animations, persistence
              |
              +---- later observations feed the next turn
```

The core must not import `gi://`, `resource://`, the module barrel `imports.js`,
or a shell adapter. It must not access `global`, GSettings, actors, timers,
display APIs, clocks, random generators, environment variables, or the file
system. It must not receive them indirectly through callback parameters,
objects with getters, or service containers.
It must not import Node built-ins either: the same production modules must
load in GJS. `node:test`, `node:assert`, and test-file access belong in tests.

Coeffects become explicit inputs: current window facts, work areas, preferences,
monitor relationships, current focus, and already-normalized user intent.
Timestamps and generated IDs enter only when required by a concrete operation.
Do not snapshot the whole desktop on every pointer movement.

Side effects remain outside: move/resize, focus, workspace activation, actor
creation/destruction, animation, persistence, process launch, and logging.
The core may return diagnostic data; the adapter decides whether to log it.

## 4. Model and ownership

Use plain ES modules and plain data. Use JSDoc for boundary shapes initially.
This avoids adding a compilation step to the GNOME extension.

The following is a conceptual shape, not an instruction to implement every
field before the first extraction:

```js
// Domain state: intended arrangement, not a mirror of all Meta.Window fields.
{
    spaces: [
        {
            id: "space-1",
            columns: [["window-a"], ["window-b", "window-c"]],
            selectedWindowId: "window-b",
            viewport: { targetX: 0 },
        },
    ],
}

// Observation: captured by the adapter, not mutated by the core.
{
    windows: [
        {
            id: "window-b",
            frame: { x: 0, y: 0, width: 800, height: 600 },
            buffer: { x: 0, y: 0, width: 800, height: 600 },
            fullscreen: false,
        },
    ],
    workArea: { x: 0, y: 0, width: 1920, height: 1080 },
}
```

Rules:

1. The adapter owns the ID-to-`Meta.Window` registry. The core only sees IDs.
   Never derive identity from title, app ID, or current column index.
2. IDs are session-local unless an existing persistence contract requires
   otherwise. Do not add a settings migration to manufacture persistent IDs.
   The adapter supplies new IDs and operation revisions as inputs; alternatively,
   a deterministic sequence value may be part of explicit core state. No hidden
   module-level counter, clock, or random source may mint either in the core.
3. Keep intended placement separate from observed frame geometry and animated
   actor geometry. A resize request is not proof that the client accepted it.
4. Selection is not always keyboard focus. Navigation can preview a selection
   before committing focus.
5. Keep space identity, workspace identity, and monitor assignment distinct.
   Workspace indices and monitor indices are not durable identities.
6. Keep scratch membership exclusive with tiled membership. Fullscreen and
   maximization are window state, not automatically scratch membership.
   Attached floating windows are a third category, not a scratch alias.
7. Represent policy values as explicit primitives or tagged data. Do not pass
   GSettings wrappers, live regular expressions with mutable matching state,
   or arbitrary `user.js` functions into the core.
8. Preserve live customization through `user.css`, GSettings window rules,
   and keybindings. Do not turn restoring the disabled `user.js` loader into
   a requirement of this refactor.
9. The adapter validates external facts. The core handles valid but inconvenient
   inputs, such as zero-sized work areas and windows closing between events.
10. Core calls do not mutate input or retain mutable references to it.
    Local mutation of newly created arrays is acceptable.

### Coordinate contract

Document each conversion before extraction:

- Monitor/stage position and available work area.
- Window frame versus rendered buffer offsets.
- Space strip coordinates and horizontal viewport offset.
- Actor animation position versus target position.
- Rounding and logical-coordinate units, including negative monitor origins.

Do not insert physical-pixel conversions by assumption. Capture the units used
by the existing Meta and Clutter calls and convert only at named boundaries.
In the conceptual state above, `viewport.targetX` means the strip translation
relative to the monitor-local viewport, not a window's strip coordinate. Replace
that ambiguous field name with `scrollOffsetX` when defining the actual contract.

### Meaning of "stable"

Stability here means a versioned data contract, deterministic results for the
supported inputs, tested invariants, and failures contained at the adapter
boundary. It does not mean every compositor interaction can be proven correct
by a core unit test. Changes to the core's accepted inputs or output semantics
must update the contract, fixtures, and bridge together.

## 5. Core operations and effect protocol

Begin with small functions, not a universal reducer:

```js
allocateColumn(columnFacts, availableHeight, policy)
planLayout(space, windowFacts, workArea, policy)
selectNeighbor(space, windowId, direction, policy)
```

Extract the transition boundary after these operations are characterized:

```js
transition(state, event, observations, policy)
// => { state: nextState, effects: requestedActions }
```

Start with events that replace existing paths: window added/removed, move
selection, commit navigation, move/swap a window, geometry observed, work area
changed, preferences changed. Add drag/gesture events only when their path is
migrated.

An effect is data, not a callback:

```js
{
    type: "resize-window",
    windowId: "window-b",
    target: { width: 900, height: 700 },
    revision: 12,
}
```

Only add effect kinds that an extracted operation needs. Move/resize, focus,
and workspace activation have different ordering requirements; do not turn
them into an unordered bag.

### Reentrancy and compositor feedback

- The controller publishes the next domain state before executing effects.
  Signals triggered synchronously by those effects enter a queue.
- Process queued observations after the current transition, not recursively
  inside it. Never debounce away window destruction or lifecycle boundaries.
- Attach a session generation to delayed work. A callback from an old enable
  cycle must not affect a new one.
- Use per-operation/layout revisions where asynchronous geometry or animation
  results can supersede one another. A global revision must not accidentally
  discard an unrelated valid window observation.
- Execute an effect only if its target is still managed and its preconditions
  still hold. Missing/destroyed windows produce reconciliation, not a crash.
- Compare requested and actual geometry. Suppress equivalent requests using the
  characterized tolerance; bound retries for clients refusing a size.
- Reconcile from observed reality after failure. Never silently claim that a
  focus, resize, or workspace change succeeded.
- Plan disable separately: stop intake, invalidate callbacks, cancel sources,
  restore patches and settings overrides, destroy presenters, clear registries.
  Cleanup must not schedule new work. Verify the exact dependency order.
- Record which initialization steps actually completed. Roll back only those
  steps in reverse dependency order on enable failure; cleanup must tolerate
  partially initialized resources. Test repeated disable and failed enable
  explicitly rather than assuming the existing module lifecycle supports them.

## 6. Proposed file boundaries

Create these lazily, as each extraction needs them:

```text
core/
  layout.js           # allocation, geometry targets, viewport decisions
  navigation.js       # selection and arrangement operations
  transitions.js      # plain state transitions when needed
adapters/
  shell.js            # observations, registry, effect execution
  compatibility.js    # conditional: only when concrete API variation needs it
tests/core/
  fixtures/
  layout.test.mjs
  navigation.test.mjs
  transitions.test.mjs
docs/
  plans/functional-core-migration.md
```

Keep `extension.js` as lifecycle wiring. Existing UI modules remain presenters.
Do not create a framework of ports, buses, repositories, and plugin registries.
Split an adapter file only when concrete responsibilities warrant it.

The transitional `Space` facade preserves existing callers and signals. Its
methods delegate one migrated decision at a time. Do not maintain two independent
writers of the arrangement. Initially the legacy state is authoritative and
the core receives an immutable projection. At the explicit ownership cutover,
the core owns that migrated state and the facade becomes a read projection.
For the arrangement, keep the legacy representation authoritative through M4:
pure transitions produce proposed next arrangements that the bridge commits
there. Perform the arrangement ownership cutover in M5 only after every
remaining writer routes through the controller. Do not retain a second,
independently updated core state between turns before that cutover.

## 7. Migration sequence and acceptance gates

Each milestone is independently reviewable. A failing gate blocks the next
ownership change. Work in an isolated checkout and isolated shell settings.
Do not use branch switching in the installed checkout as a deployment method.

### M0 — Record behavior and establish a safe harness

Deliverables:

- Describe nested/VM development commands supported by the installed shell,
  not an assumed historic `--nested` flag.
- Local GNOME Shell 51.0 advertises `--devkit` and `--wayland`, not `--nested`
  or `--x11`. The candidate invocation inside the fully isolated environment
  is `dbus-run-session -- gnome-shell --devkit --wayland`. It is not yet
  runtime-tested and is not an instruction to run against live settings.
- Prepare a separate development checkout and test extension tree.
  Do not repoint the live extension symlink.
- Isolate GSettings/dconf, configuration, and extension discovery. A private
  D-Bus session alone is not evidence that user settings are isolated.
- Use a private `XDG_DATA_HOME` for the development extension tree and a private
  `XDG_CONFIG_HOME` plus an explicitly isolated dconf profile/backend. Keep the
  UUID deliberately unchanged but ensure only the development tree is discovered.
- Do not run `shell.sh` unmodified: it only changes `XDG_CONFIG_HOME`, still
  discovers the normal extension tree, and executes `dconf reset -f /`.
- Capture baseline scenarios and redacted plain-data fixtures. Freeze the
  enumerated corpus before comparisons; include every scenario in section 8.
  Compare integer allocation targets exactly. For measured/animated geometry,
  choose and record a tolerance from the baseline before enabling comparisons.
- Evaluate `upstream/unit-tests` (`b8eedcd`) before building new integration
  machinery. It contains Behave features, input/visual steps, recordings, and
  Nix VM definitions. It is prior art, not a tested GNOME 51 harness or a pure-core
  test suite. Reuse useful pieces only after validating compatibility and isolation.
- Add a documented test command and CI scaffolding without runtime dependencies.
- Start with existing GI-free utilities and accelerator parsing. Do not claim
  `.eslintrc.yml` or interactive debug helpers are an automated test suite.

Gate: reproduce baseline tiling/navigation and enable/disable without modifying
the real desktop or user settings. Verify the loaded extension path, compare
redacted before/after live-settings dumps, and confirm the live symlink target is
unchanged. Record existing failures separately.

### M1 — Establish the boundary and extract one allocation function

Deliverables:

- Define exact numeric and identity contracts for the chosen operation.
- Fix test loading in this milestone: Node 22 LTS or newer, `.test.mjs` tests,
  and a scoped `core/package.json` declaring `"type": "module"` for core `.js`
  files. Add an explicit ignore-rule exception so this metadata is tracked.
  Verify GJS can import the same core modules before accepting the boundary.
- Extract one nontrivial allocator with explicit inputs and targets as output.
- Start with proportional fitting, then the default/equal-height allocators.
  `fitProportionally` already has plain inputs but currently divides by zero
  for all-zero weights; record this before defining a deliberate safe result.
- Test current results, rounding, minimum sizes, and degenerate inputs.
- Add an import/purity boundary check and input-mutation assertions.
- Keep all geometry application in the legacy adapter.
- Update the release file list in the same round that introduces `core/`.
  Assert the archive contains every imported runtime module and install the
  archive in the isolated test tree. A source symlink install is not this check.

Gate: pure tests run without GNOME; the legacy caller produces the same target
geometry for the characterized fixtures; packaged module imports resolve.
New production logic has tests.

Keep compatibility quirks visible: default allocation uses a 50-unit minimum
for non-selected rows and can give the selected row a negative remainder;
equal-height allocation floors values and drops the remainder. First capture
these results as characterization tests. Any correction needs its own explicit
expectation and change, not an unannounced clamp in the refactor.

### M2 — Extract layout planning and viewport policy

Deliverables:

- Move remaining column allocation, preferred-size policy, strip layout, and
  viewport target decisions behind explicit functions.
- Keep observed-size negotiation and animation in the adapter.
- Preserve resize hysteresis (`_targetWidth`/`_targetHeight`) and the existing
  bounded synchronous retry path. A one-shot planner cannot assume a requested
  size has become the measured size.
- Capture old/new planner output for the same snapshot in development.
  The shadow planner must never execute effects.
- Compare results with explicit rounding tolerances and explained differences.
- Preserve leading/trailing strip gaps and distinguish current actor positions
  from target positions. Layout visibility and navigation visibility currently
  use different conventions; do not silently merge them.

Gate: no unexplained layout differences on the scenario corpus. No unbounded
resize feedback loop. Empty spaces and zero-sized work areas remain safe.
Assert at most five synchronous retry requests per layout call, in addition to
the initial attempt, matching `fixPointAttempCount < 5`. Characterize how that
counter spans columns before changing it. Async reconciliation needs its own
explicit per-window/target retry budget in M4; queue deduplication alone does
not prove convergence.

### M3 — Extract arrangement and navigation transitions

Deliverables:

- Move add/remove, selection, row/column navigation, swap, and stacking decisions.
- Preserve navigation preview versus focus commit/cancel behavior.
- Maintain legacy signal payloads for minimap, topbar, and other consumers.
- Make ownership explicit for each migrated operation.

Gate: generated operation sequences preserve membership and selection
invariants in pure tests. Closing the selected window during navigation
produces no dangling selection or stale focus request in the proposed result.
Legacy execution remains authoritative here; live reentrancy/stale-effect
guarantees are an M4 integration gate, not a claim made by these pure tests.

### M4 — Introduce controlled effect execution

Deliverables:

- Centralize observation normalization, the event queue, window registry, and
  the migrated effects.
- Add bounded geometry reconciliation and callback generations.
- Specify the async retry budget from captured baseline cases before enabling
  this executor. Tests enforce that budget and zero resize effects for an
  already-satisfied target observation.
- Integrate focus and workspace changes with their required order.
- Prove disable cancels every owned signal/source/animation callback.

Gate: adapter contract tests cover success, rejection, missing targets,
reentrancy, out-of-order completion, and disable during pending work.
Repeated enable/disable does not increase owned resource counts.

### M5 — Integrate remaining inputs and presenters

Deliverables:

- Route keybindings, gestures, drag/drop, scratch transitions, and monitor
  changes through migrated decisions.
- Enumerate all remaining arrangement writers and cut ownership over to core
  state as one bounded change. Before this gate, use a freshly projected legacy
  snapshot; after it, the legacy facade is a read-only view of core state.
- Feed topbar/minimap/selection overlays from explicit outputs or the facade.
- Keep GNOME API quirks in compatibility code, not core policy.
- Preserve settings storage, override restoration, GSettings window rules,
  keybindings, and `user.css` behavior.

Gate: exercise the full compatibility/scenario matrix. No presenter writes
the core's arrangement directly. Verify the ownership inventory has no legacy
writer remaining after cutover. Record and approve any behavior deviations.

### M6 — Remove redundant legacy paths and stabilize

Deliverables:

- Delete old decision code only after consumers migrate and tests prove parity.
- Remove temporary shadow code and development-only toggles.
- Document architecture, boundaries, test commands, and operational rollback.
- Build and inspect the release archive for required core/adapter modules.
  Repeat the archive checks introduced in M1 for every newly added directory.

Gate: clean packaged installation works in an isolated GNOME session. A real
desktop smoke test is the final manual gate, not a substitute for core tests.
`main` remains untouched by fork-specific code.

## 8. Verification strategy

### Pure tests

Use Node's built-in test runner and assertions, with no test framework.
The proposed development minimum is Node 22 LTS; CI must pin and exercise an
available supported release at implementation time. Use the scoped module-mode
configuration established in M1, not runtime syntax detection or a root-wide
module-mode change. No runtime Node dependency may enter the installed extension.
The baseline `.gitignore:7-10` ignores `package.json` and lockfiles. If the test
setup needs tracked package metadata, adjust that rule explicitly; do not leave
an essential module-mode setting in an ignored local file. CI must exercise the
same loading configuration as a clean checkout.

- Golden fixtures: current behavior for chosen inputs.
- Unit tests: allocation, boundaries, rounding, selection, viewport policy.
- Generated invariant tests: a small deterministic seeded generator and fixed
  seed list using standard-library assertions. Include the seed and operation
  sequence in failure output. Node provides neither a property-testing engine
  nor shrinking; add a dependency only if real test cases justify it.
- Frozen inputs and before/after comparison: no caller-visible mutation.
- Replay: the same state and event sequence returns the same states/effects.
- Architecture check: recursively follow core imports and reject shell imports,
  barrels, callbacks/services carrying effects, and forbidden global access.
  An import grep is useful but is not a proof of purity.

Invariants:

1. A live tiled window appears exactly once across spaces/columns.
2. Scratch windows do not appear in tiled columns.
3. Committed arrangements have no empty columns.
4. A selected ID belongs to its space, or is explicitly absent.
5. Geometry is finite. Allocation respects accepted constraints when feasible.
   Define deterministic overflow behavior when constraints cannot all fit.
6. No effect targets a window already removed in that transition.
7. A repeated observation of satisfied geometry does not trigger resize churn.
8. Disable invalidates every pending operation from that enable cycle.

Do not require a focus-visible invariant during every preview/animation:
temporary offscreen selection and delayed focus may be intentional.
The empty-column invariant applies at committed boundaries. Legacy layout
temporarily tolerates empty columns; the bridge must not reject intermediate
legacy state without a defined reconciliation step.

### Adapter tests

Use a small fake registry/executor, not a mocked implementation of all GNOME.
Test ordering, observation mapping, idempotence where appropriate, missing
windows, size rejection, and resource ownership. Verify GNOME-specific API
behavior separately in GJS/nested/VM integration tests.

Do not infer leak freedom from the absence of log errors. Track owned signals,
sources, overrides, and actors in the development harness; compare counts
before enable and after disable, and exercise callbacks after invalidation.
This proves the tracked ownership contract, not absence of every native leak.

### Scenario matrix

- Zero, one, and many windows; one column and multiple stacked rows.
- Insert left/right/start/end/up/down; remove first/last/selected window.
- Normal, fixed-size, size-increment, maximized, fullscreen, and transient windows.
- Scratch entry/exit, picture-in-picture, and restore after disable.
- Repeated next/previous, wrapping, preview commit/cancel, Alt-Tab.
- Rapid close during resize/drag/navigation; unmanaged or not-yet-mapped actors.
- Workspace switches, overview transitions, monitor hotplug, negative origins,
  fractional scaling, work-area changes, and zero-sized work areas.
- Chromium/Electron on Wayland and a representative XWayland application.
- Preferences/window rules/keybindings changed while windows are present;
  custom CSS.
- Disable/re-enable while timers, gestures, or animations are pending.
- Failed enable after each resource-acquisition step; repeated disable; settings
  changes and asynchronous D-Bus replies after disable.

GNOME 51 is the required acceptance environment for this installation.
Existing metadata advertises 45–51. Do not silently claim that the refactor
tests all these versions. Either run an agreed version matrix before release
or explicitly decide a narrower support range as separate approved work.

### Performance and release

Measure the baseline and candidate under the same scenarios. Track per-event
duration, planning duration, move/resize counts, reconciliation attempts, and
outstanding resources. Establish an acceptance budget from those measurements
before migration rollout; this plan does not invent benchmark results.
Avoid full-state cloning per animation frame and unnecessary layout passes.

Release checks cover source tests, GJS imports, schema validation, archive
contents, isolated install, lifecycle cleanup, and manual desktop behavior.
Core correctness does not guarantee compositor or multi-monitor correctness.

## 9. Rollout, rollback, and upstream maintenance

- Plan only in this round. No runtime code, tests, settings, deployment, branch
  switching, commit, or push is part of producing this document.
- Each implementation round needs a bounded scope and tests before commit.
- Upstream changes enter `main` without custom patches. Integrate them into
  `custom-stable` explicitly and rerun the gates affected by changed files.
- Maintain an inventory of the shrinking legacy seams to make conflicts visible.
- Include the upstream test branch in the integration watchlist. It adds
  per-module `export const name` declarations and test infrastructure that may
  conflict with the same files touched by this extraction. It is not merged
  into this plan's baseline.
- Deployment uses a known tested revision. Do not update live files while
  expecting the already-loaded GJS modules to match them.
- Retain a known-good build/revision for rollback and a recovery path usable
  when the desktop extension fails. Use an explicit deployment plus a new
  shell session when necessary, not a promise that `git checkout` reloads GJS.

## 10. Alternatives and unresolved decisions

Rejected for this goal:

- Merely splitting `tiling.js`: reduces file size but preserves hidden coeffects.
- A big-bang rewrite: loses behavior knowledge and makes desktop regressions
  difficult to isolate.
- A single giant reducer from day one: creates a parallel model before we
  understand the existing layout/negotiation behavior.
- Passing `Meta.Window` wrappers or callbacks to a nominally pure core:
  hides rather than removes the integration dependency.
- Full event sourcing or a universal effect framework: unnecessary for
  deterministic decision tests.

Resolve during M0, before implementing the relevant capability:

1. Which GNOME versions must the fork release support beyond the local GNOME 51?
2. Which existing GSettings window-rule and keybinding cases belong in the
   acceptance corpus? Restoring `user.js` is explicitly separate.
3. Which baseline bugs are retained for parity and which get separate fixes?
4. Which desktop scenarios and hardware are available for acceptance?
5. What measured performance budget prevents regressions?

These do not block planning. They do block unsupported compatibility promises
and the final release gate.

Known characterization candidates include `workArea.min` in the viewport clamp
(`tiling.js:784`), the boolean method named `visibleRatio` (`852-858`), target
reset before comparison in `resizeHandler` (`3821-3839`), and the missing
`try/finally` around the layout guard. These are code-reading findings, not
newly reproduced runtime defects. Evaluate them separately from moving code.

## 11. Definition of done

- Domain decisions run on explicit plain data without GNOME imports or hidden
  environment reads.
- Migrated state has exactly one owner. Observed geometry remains distinct
  from requested geometry.
- Tests demonstrate deterministic outcomes, immutability, invariants, and
  bounded effect feedback.
- Adapters demonstrate correct resource cleanup and stale-callback rejection.
- Agreed behavior and compatibility scenarios pass in a clean packaged install.
- Every intentional behavior difference is documented and approved.
- `main` remains an upstream mirror; `custom-stable` contains the fork.
- Extension-site acceptance is reported separately, not implied by these tests.
