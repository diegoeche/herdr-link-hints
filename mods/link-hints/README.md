# Inline selectors

Ctrl+Shift+O selects links, Ctrl+Shift+X selects `!commands`, and
Ctrl+Shift+I selects image paths. Type a badge to perform its action;
Shift copies the selected value. F2 switches inline/window mode and F3
cycles selectors. Escape closes. Selecting a command types `!command` into
the same source terminal, without Enter; review and submit it yourself.
Input errors keep the selector open for correction. Images use the configured
viewer (xdg-open by default).

Edit selectors.json alongside keys.json. The legacy link-hints.json is
used only if selectors.json is absent. Matchers: url, prefix, image-path,
regex. Actions: open-url, type-command, run-command, open-file, process. Local plugins.js
can register additional matcher and action functions. Re-run the project
installer after changing shortcuts, adding selectors, or editing plugins.

Soft-wrapped values retain their full text and start position. Window
rows page with keyboard selection and fit the available height. This is
a snapshot of the program's current screen: Herdr's independently scrolled
viewport and offscreen history are not exposed by the current API. Return
to the bottom before using inline selectors; reopen after output moves.

See the project's README.md and QA.md for configuration, extension examples,
installation, and manual checks. No commands or viewers run until a selection
is activated. Reading uses hc's read-only observer, without input or resize.
