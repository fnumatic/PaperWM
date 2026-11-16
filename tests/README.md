# Core tests

Run with Node 22 or newer; no dependencies needed:

```sh
node --test tests/core/
```

- `layout.test.mjs`: column allocation arithmetic, including legacy edge cases.
- `utils.test.mjs`: existing GI-free helpers (`lib.js`, `acceleratorparse.js`).
- `boundary.test.mjs`: core modules must not import GI, shell, Node or barrel code.

Tests are not part of the extension archive. `make release` ignores this folder.
