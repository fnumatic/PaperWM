# PaperWM core

Pure decisions for window placement. No GI imports, no shell objects, no
settings access, no timers, no Node built-ins. Inputs are plain data; results
are plain data. Callers own windows, actors, signals and persistence.

| Module | Responsibility |
| --- | --- |
| `layout.js` | Column height allocation |
| `geometry.js` | Work area, column widths, row targets, viewport targets, visibility |
| `navigation.js` | One bounded index step and linear navigation |
| `arrangement.js` | Open-window, swap, slurp and barf placement |
| `winprops.js` | Window-rule matching |
| `dnd.js` | Drag-and-drop hit testing |

Rules:

- Inputs are never mutated. Callers may pass frozen data.
- The same input returns the same result. No clocks, counters, randomness or
  environment reads.
- Window-rule regexes are read-only patterns. Matching starts at zero and never
  consumes the caller's `lastIndex`, including global and sticky patterns.
- Positions are column and row indices supplied by the caller, never objects.
- Navigation returns a valid slot or `null`; insertion indices include the
  append position. Horizontal swaps exchange whole columns, not rows across
  columns of different heights.
- Allocation derives selection height from the height list. Its 50-unit default
  is a preferred aggregate budget for other rows, not a hard per-window minimum.
  If it cannot fit, all rows scale to the available non-negative budget.
- DnD accepts arrays of target-scroll row rectangles. It derives widths and
  insertion zones once; column zones win over overlapping row zones.
- Requested geometry is not observed geometry. Resize feedback belongs to the
  adapter.
- Legacy quirks are preserved deliberately and marked where they are not
  obvious. Changing one needs its own test and decision.

This is a stateless decision library, not yet an owner of the desktop state.
`Space`, observation feedback, actors, and resource lifecycle remain in the shell.

Tests: `node --test tests/core/` from the repository root. Node 22 or newer.
They are not part of the release archive.
