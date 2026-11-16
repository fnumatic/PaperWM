# PaperWM

PaperWM arranges windows in horizontally scrollable spaces. This glossary
distinguishes the arrangement from the desktop objects that display it.

## Language

**Space**:
The ordered arrangement of tiled columns associated with a workspace.
_Avoid_: Screen, flat window list

**Column**:
A position in a space containing one or more vertically stacked tiled windows.
_Avoid_: Window, workspace

**Row**:
A window's position within a column.
_Avoid_: Column index

**Workspace**:
A desktop workspace to which windows belong. A workspace has a space, but is not
the window arrangement itself.
_Avoid_: Monitor

**Monitor**:
A display area on which a workspace is presented.
_Avoid_: Workspace, space

**Viewport**:
The visible portion of a space's horizontal strip.
_Avoid_: Entire space

**Selected window**:
The window selected within a space. Selection during navigation need not yet
change the desktop's keyboard focus.
_Avoid_: Always calling this the focused window

**Scratch window**:
A window managed outside the tiled columns in the floating scratch layer.
_Avoid_: Tiled window

**Attached floating window**:
A non-tiled window associated with a space, such as a transient dialog.
It is not automatically a scratch window.
_Avoid_: Treating every floating window as scratch

**Frame rectangle**:
The outer window geometry used for placement, including window decorations where
applicable.
_Avoid_: Buffer rectangle

**Buffer rectangle**:
The geometry of a window's rendered surface. It can differ from its frame
rectangle.
_Avoid_: Frame rectangle
