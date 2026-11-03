# Herdr Link Hints

A keyboard link picker for Herdr's desktop app, with two configurable modes:
inline letter badges over terminal links, or a compact bottom-right window.
Ctrl+Shift+O opens it; F2 switches modes while open. Use the current theme.

![Illustration of window mode using example URLs](preview.png)

## What you see

Use a transparent, frameless, full-window overlay with no backdrop dimming.
In window mode, place a content-sized card 8 logical pixels inside the
bottom-right edge. Default width is 480, capped at 95% of the viewport;
use padding 10, gap 6, border 1, and radius 8. Show a “Links” header, typed
prefix, count, up to six 28px rows, and a small controls footer. Truncate
long URLs with full-address tooltips; keyboard selection stays visible.

In inline mode, put small accent-colored letter badges over each link's
first terminal cell, shifted left by the badge width plus a 3px gap. Clamp
to the window edge. A duplicate URL has the same hint at every occurrence.
Show only badges in inline mode, with no bottom-right footer. Wait for config,
snapshot, and font measurement before drawing anything; do not flash the
window card while they load. Preserve
the terminal text underneath; do not create panes or alter the terminal.

Colors come from `theme()` tokens. Hints use JetBrains Mono. No image assets
or external libraries are needed by the runtime.

## Capture and extraction

Capture `focused()` before taking keyboard focus: prefer `shown`, then
`terminal`, then `agent`. Never choose an unrelated terminal. Read the
program screen once with `hc(["read", "--json", "--lines", "0", terminal])`.
Show loading, empty, and error states without retry loops.

In parallel, run the bundled Python helper locally. It obtains dimensions
with `hc get --json`, then captures the initial repaint from
`hc attach --observe --history 0`. Keep stdin open without writing. Bound
startup to five seconds, stop after a quiet gap or 0.4 seconds of continuous
output, cap capture at 4 MiB, and clean up only the observer client. No input,
resize, history requests, terminal scrolling, or persistent background work.

Extract visible http/https/www links and OSC 8 http(s) destinations terminated
by BEL or ST. Preserve explicit hyperlink destinations exactly. Trim prose
punctuation from visible URLs, validate with `URL`, and normalize only for
deduplication. Assign uniform-length hints using `sadfjklewcmpgh` so no hint
is a prefix of another. Opening and copying use the preserved URL.

Decode the repaint into a bounded cell grid, including cursor positioning,
erase, common color/mode escapes, OSC 8 spans, and Unicode wide/combining
characters. Extract link occurrences by row and column. Unsupported screen
transformations mark positioning unsafe, while visible URL extraction remains
available. Do not pretend this helper implements a full terminal emulator.

## Inline geometry

Read the current `layout()`, not just the saved layout JSON: sidebar sizes
may have changed. Calculate the active terminal rectangle from the window
viewport, layout splits, weights, gaps, padding, dividers, hidden blocks,
and lone-pane frame. Account for terminal padding and zoom.

Measure the terminal font's medium-weight M advance with an invisible
intrinsic-size text element and `on_size_change`. Use the base font size from
`settings()`; mod styles already apply Herdr's zoom. Infer a unique row
height compatible with the terminal row count and monitor scale, or accept
an explicit configured height. Center the spare vertical pixels and snap
the origin to device pixels as the terminal does. Convert window coordinates
back through mod zoom when placing badges.

Only use inline mode when every link has positions, terminal columns match
the measured width, the row height is unambiguous, the active tab has one
pane (or a zoomed pane), and the viewport/font/zoom have not changed. Fall
back to the compact card with a notice whenever these checks fail. Do not
place speculative badges or partially label a list with unreachable entries.

The screen is a one-time snapshot. Neither read follows Herdr's independent
scrollback viewport, and live output is not frozen. Document that people
should reopen hints after text moves. Do not join actual newline fragments.

## Controls and configuration

Capture keyboard events while open. A completed hint opens the URL; Shift
on its final letter copies it. Up/Down and Tab select; Enter opens and
Shift+Enter copies. Support Backspace, PageUp/PageDown, Home/End. Escape,
Ctrl+C, Ctrl+Shift+O, or an outside click dismisses. Clicking a badge/row
opens it; Shift+click copies. Ignore held hints and unrelated modified keys.
Never open on render, loading, or partial input.

Merge the root `keys.json` snippet with existing keys. Bind global
Ctrl+Shift+O to `mod.open:link-hints`, replacing the default pane split.
Bind F2 only in `mod:link-hints` to `link-hints.toggle-mode`. Receive that
command through `nextCommand()` so F2 keeps its normal behavior elsewhere.
Do not handle it a second time in the keyboard callback.

Read `<app-home>/link-hints.json` on each opening. Normalize invalid fields
and apply defaults: mode `window`; inline device scale 1, inferred row
height, offsets 0; card width 480 and six rows. See
`link-hints.example.json`. F2 changes this opening only, not the saved file.

## Files and APIs

- `mod.json`: `place: "none"`, overlay kind `window`, frame `none`, origin
  `{x:0,y:0}`, and fractional width/height `1` for a transparent surface.
- `main.js`: focused-terminal capture, async reads, keyboard/command handling,
  config, native elements, font probe, inline badges, and window card.
- `links.js`: URL extraction, validation, deduplication, hints, and occurrences.
- `geometry.js`: layout bounds, grid inference, and config normalization.
- `snapshot.py`: bounded observer process lifecycle and JSON response.
- `terminal_grid.py`: bounded repaint-to-cell decoder.

Use built-in `gpui-kit`, `gpui-base`, and `herdr` APIs. Obtain viewport size
from the ambient GPUI `window`. Keep contexts local to callbacks, run reads
in `cx.spawn`, and use `cx.open_url()`/`cx.write_to_clipboard()` only after
selection. `props().overlay` identifies the overlay for `closeOverlay()`.
Stop mouse-down propagation on interactive content to avoid dragging the
full-window native overlay; clicking the transparent background dismisses it.

Read the installed app's `AGENTS.md` and generated type files before changing
APIs. Tested with Herdr app 0.1.12 and hc 0.1.17. Profiles each have their own
app home. Whole-directory mod symlinks support relative imports; individual
source-file symlinks outside the mod root do not.

## Done when

- `npm test` and `herdr-app check <installed-mod>` pass; status has no errors.
- Both modes render in the real app without dimming or creating panes.
- Inline labels align with visible URLs and named OSC 8 links in a supported
  single-pane layout; resized sidebars are included in the calculation.
- Split panes, uncertain geometry, unsupported repaint edits, and unavailable
  observer data fall back to window mode without losing visible URL access.
- F2's mod command switches modes; next opening restores the configured mode.
- Every link is reachable, including duplicate occurrences and long lists.
- Partial hints and unrelated modified keys open nothing; Shift copies.
- Escape and outside click dismiss, returning focus to the terminal.
- No credentials, terminal text, customer paths, or real screenshots are
  included in the published repository.
