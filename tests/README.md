# Core tests

Run with Node 22 or newer; no dependencies needed:

```sh
node --test tests/core/
gjs -m tests/gjs-core.js
```

- `layout.test.mjs`: column allocation arithmetic, including legacy edge cases.
- `utils.test.mjs`: existing GI-free helpers (`lib.js`, `acceleratorparse.js`).
- `boundary.test.mjs`: core modules must not import GI, shell, Node or barrel code.
- `invariants.test.mjs`: bounded dimension/slot checks over fixed input grids.
- `adapter.test.mjs`: actual method bodies with small fakes; not a GNOME runtime test.
- `gestures*.test.mjs`, `minimap*.test.mjs`, `overview*.test.mjs`: plain
  decisions plus their real adapter functions with small fakes. These cover
  snapshot mapping, stale selections, projected offsets and repeated layout.
- `gjs-core.js`: imports and smoke assertions in GJS, without a desktop.

The boundary scan is a conservative source check, not a proof of purity.
Regression tests must cover side effects hidden in inputs too, such as mutable
RegExp matching state. High line coverage alone does not establish correctness.

Tests are not part of the extension archive. `make release` ignores this folder.

## Nested shell

`scripts/dev-shell.sh` starts GNOME Shell against this checkout with an
isolated extension tree, settings and runtime directory. It reports whether the
live extension symlink points here, and compares the live
`enabled-extensions` value before and after the run.

```sh
./scripts/dev-shell.sh
./scripts/dev-shell.sh --cycle
./scripts/dev-shell.sh --smoke
```

`--cycle` disables and enables the extension three times in the isolated
session, then exits; use it to check lifecycle cleanup in the log.
`--smoke` opens an Alacritty window for a few seconds, then exits. It exercises
a real Wayland client but does not prove the tiling result.

Isolation uses `GSETTINGS_BACKEND=keyfile` and a private `XDG_RUNTIME_DIR`.
Do not replace that with `dconf write`: dconf talks to the running session's
D-Bus service and changes live settings even with a private profile.
The script selects `--devkit` on GNOME 51. Without the devkit viewer it has no
visible window.

GNOME 51 also supports a separate headless test compositor with
`--headless --wayland --virtual-monitor=1920x1080`. That creates a real logical
monitor without `mutter-devkit`; it can exercise native windows, Clutter
allocation and overview previews. Use the same isolated settings, data,
runtime directory and private D-Bus session as above. The current script selects
`--devkit` unconditionally, so do not append `--headless` to it.

Without a viewer or an explicit virtual monitor, a successful enable/disable
run is not evidence that any windows were tiled. Headless adapter invocation
also does not test physical touchpad/touchscreen routing or a multi-monitor
desktop.
