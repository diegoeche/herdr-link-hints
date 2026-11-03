# Link hints

Local mod for Herdr app 0.1.12. Requires hc and Python 3.8+; no third-party packages.

Ctrl+Shift+O opens a temporary overlay for the focused terminal. Type a hint
to open its URL in the default browser. Hold Shift on the last letter to
copy it instead. Arrow keys/Tab and Enter also work; Shift+Enter copies.
Escape, Ctrl+C or Ctrl+Shift+O closes it. Backspace removes a hint letter.

The compact popup sits in the bottom-right corner, without dimming the
terminal, and fits its content (up to six visible rows). Hover a truncated
URL to read the complete address. Clicking outside dismisses it.
The explicit far-corner position in mod.json uses Herdr's native popup
clamping: it keeps an 8px window margin, including after window resizing.

Uses Foot's `sadfjklewcmpgh` hint alphabet. With more than 14 links, hints
use multiple letters of equal length. Duplicate URLs appear once.

The mod makes one `hc read --json --lines 0` request when opened, in the
current profile. A bundled Python helper also briefly attaches with
`hc attach --observe --history 0` to read hidden OSC 8 link destinations.
The observer cannot send input or resize the terminal, and exits after a
bounded snapshot. It does not send keystrokes, scroll the terminal, create
panes, fetch links, save terminal text, or load external code. URLs open
only in response to a hint, Enter, or click. It follows the current theme.

Supported links: visible http://, https:// and www. addresses, plus named
OSC 8 http(s) hyperlinks. If the helper is unavailable, visible URLs still
work and a notice explains that named links were not read. The read API
provides the program's current screen, not the app's independently scrolled
viewport. URLs broken by actual newlines are not guessed or joined.

The current mod API cannot paint hint labels into the terminal grid, so
these labels appear in a list. Terminal search and keyboard copy/scroll
mode are separate app features, not implemented here.
