# Link hints

Herdr app 0.1.12 mod. Requires hc and Python 3.8+; no third-party packages.

Ctrl+Shift+O shows links from the focused terminal. Type a hint to open it;
Shift on the final letter copies. Arrows/Tab select, Enter opens, Shift+Enter
copies. Escape, Ctrl+C, or Ctrl+Shift+O closes; Backspace edits a hint.
Click/Shift+click opens/copies. F2 switches inline/window modes when the
`mod:link-hints` binding from the project's key snippet is installed.

Create `link-hints.json` in your app home, alongside `keys.json`:

```json
{
  "mode": "inline",
  "inline": {"device_scale": 1, "cell_height": null, "offset_x": 0, "offset_y": 0},
  "window": {"width": 480, "max_rows": 6}
}
```

The default mode without a config file is `window`. Config is read each
opening; F2's choice lasts until closed. Inline mode calculates badge positions
from the live layout, font advance, and a decoded terminal repaint. It falls
back to a compact bottom-right card if alignment is uncertain. Use your monitor
scale for `device_scale`; leave `cell_height` inferred unless calibrating.
Height/offset overrides use GPUI window pixels; card width uses Herdr logical
pixels. Inline shows only badges, just before the links with a small gap,
without a footer or loading card. Both modes follow the current theme without
dimming the terminal.

Uses Foot's `sadfjklewcmpgh` alphabet with equal-length hints. Duplicate URLs
share one hint, shown at each occurrence inline. Detects visible http/https/www
addresses and named OSC 8 web hyperlinks. Hover a badge or row for the full URL.

Makes one screen read and a bounded Python snapshot per opening. The helper
uses `hc get --json` and `hc attach --observe --history 0`; it cannot type or
resize and cleans up its own observer. It does not fetch URLs, save terminal
text, or load external code. Observer failure retains visible links in window
mode. No polling, scrolling, input forwarding, or pane creation.

Reads the program's current screen, not Herdr's separately scrolled viewport.
Inline labels are a snapshot: reopen if live output moves. Split panes,
unsupported layout/terminal transforms, and uncertain geometry use window
mode. Actual newline fragments are not joined. See the project's README and
RECIPE for installation, supported configuration, implementation, and tests.
