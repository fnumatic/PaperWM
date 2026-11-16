# PaperWM core

Pure decisions for window placement. No GI imports, no shell objects, no
settings access, no timers, no Node built-ins. Inputs are plain data; results
are plain data. Callers own windows, actors, signals and persistence.

| Module | Responsibility |
| --- | --- |
| `layout.js` | Column height allocation |
| `geometry.js` | Work area, column widths, row targets, viewport targets, visibility |
| `navigation.js` | Linear and directional index arithmetic |
| `arrangement.js` | Open-window, swap, slurp and barf placement |
| `winprops.js` | Window-rule matching |
| `dnd.js` | Drag-and-drop hit testing |

Rules:

- Inputs are never mutated. Callers may pass frozen data.
- The same input returns the same result. No clocks, counters, randomness or
  environment reads.
- Positions are column and row indices supplied by the caller, never objects.
- Requested geometry is not observed geometry. Resize feedback belongs to the
  adapter.
- Legacy quirks are preserved deliberately and marked where they are not
  obvious. Changing one needs its own test and decision.

Tests: `node --test tests/core/` from the repository root. Node 22 or newer.
They are not part of the release archive.
