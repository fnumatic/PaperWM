# Core tests

Run with Node 22 or newer; no dependencies needed:

```sh
node --test tests/core/
```

- `layout.test.mjs`: column allocation arithmetic, including legacy edge cases.
- `utils.test.mjs`: existing GI-free helpers (`lib.js`, `acceleratorparse.js`).
- `boundary.test.mjs`: core modules must not import GI, shell, Node or barrel code.

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
`--devkit` is required on GNOME 51; the devkit viewer is not installed here, so
the nested shell runs without a visible window.
