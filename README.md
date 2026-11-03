# Herdr Link Hints

Open links from your keyboard in **Herdr's desktop app**, inspired by Foot's
URL mode. Press **Ctrl+Shift+O**, then type the letter beside a link.

Choose **inline** badges over terminal links or a compact **window** in the
bottom-right corner. Press **F2** while hints are open to switch modes.
Both follow your Herdr theme and leave the terminal undimmed.

Development is hosted on Gitea; GitHub is the public push mirror.

![Illustration of window mode](preview.png)

*Illustrative preview using example URLs. No real terminal content is included.*

## Requirements

- [Herdr desktop app](https://github.com/herdrdev/herdr-app), tested on **0.1.12**.
- `hc` (herdr-core), available to Herdr. Tested on **0.1.17**.
- Python 3.8+ for the bundled read-only snapshot helper.
- A default browser for opening links.

This is a desktop **mod**, not a plugin for the older Herdr TUI. No packages
or additional services are required at runtime.

## Install

Clone this repository and review `RECIPE.md` and the source files in
`mods/link-hints/` before installing. Mods run trusted JavaScript.

1. Find your app folder: `$HERDR_APP_HOME` if set, otherwise
   `~/.config/herdr-app`. Each independently configured profile has its own
   app folder.
2. Copy `mods/link-hints/` into that folder's `mods/` directory. If a
   `link-hints` folder already exists, back it up and compare it first.
3. Back up the app folder's `keys.json`. Merge these bindings into its
   existing sections, replacing the old Ctrl+Shift+O binding:

   ```json
   {
     "global": {
       "ctrl-shift-o": "mod.open:link-hints"
     },
     "mod:link-hints": {
       "f2": "link-hints.toggle-mode"
     }
   }
   ```

   `keys.json` in this repository is a snippet, **not a replacement for your
   entire key file**. In Herdr 0.1.12, Ctrl+Shift+O normally splits a pane;
   this intentionally replaces that shortcut. More specific `terminal` or
   `layout:*` bindings for the same key take precedence; update those too
   if needed. F2 keeps its normal behavior outside this mod.
4. Optionally copy `link-hints.example.json` to `<app-folder>/link-hints.json`
   and choose your preferred mode, as described below.
5. Validate the installed mod, replacing the path for a custom profile:

   ```sh
   herdr-app check ~/.config/herdr-app/mods/link-hints
   herdr-app status
   ```

Herdr reloads ordinary mod files automatically. If the whole mod directory
is a symlink, edits inside it may require refreshing that link or reopening
the app window. Focus a terminal and press Ctrl+Shift+O. Repeat installation
for any other app profiles you use.

You can also ask your coding agent:

> Read this repository's RECIPE.md and source, then install the link-hints
> mod into my Herdr desktop app. Merge its key snippet into my existing
> keys.json, replacing Ctrl+Shift+O's pane split binding. Back up changed
> files and run herdr-app check afterward.

## Controls

| Key | Action |
| --- | --- |
| Ctrl+Shift+O | Open or close link hints |
| F2 | Switch inline / window mode while open |
| Hint letters | Open that link immediately |
| Shift on the final hint letter | Copy that link instead |
| Up / Down, Tab / Shift+Tab | Select a link |
| Enter / Shift+Enter | Open / copy the selection |
| PageUp / PageDown, Home / End | Move through longer lists |
| Backspace | Remove one hint letter |
| Escape / Ctrl+C | Close |
| Click / Shift+click | Open / copy that link |

Clicking outside also dismisses hints. Hover a badge or truncated URL to see
the full address. Inline mode shows the keyboard selection's URL in a small
bottom-right footer.

Hints use Foot's `sadfjklewcmpgh` alphabet. With more than 14 links, all
hints gain another letter, so a short hint never opens the wrong link
while you type a longer one. Duplicate URLs share a hint; inline mode shows
it at each occurrence.

## Configuration

Create `link-hints.json` in your app folder, alongside `keys.json`:

```json
{
  "mode": "inline",
  "inline": {
    "device_scale": 1,
    "cell_height": null,
    "offset_x": 0,
    "offset_y": 0
  },
  "window": {
    "width": 480,
    "max_rows": 6
  }
}
```

Missing settings use these defaults, except that the default `mode` is
`"window"` for compatibility. Configuration is read each time hints open.
F2 changes only the current opening; edit the file to change the default.

- `mode`: `"inline"` or `"window"`.
- `inline.device_scale`: your monitor's scale factor, default `1`. On a
  scaled monitor, set this to the scale reported by your desktop.
- `inline.cell_height`: optional explicit terminal row height in GPUI
  window pixels. Leave `null` to infer it from the current row count.
- `inline.offset_x`, `inline.offset_y`: small positioning corrections in
  GPUI window pixels, default `0`. These are useful for calibration, not
  for following scrolling output.
- `window.width`: card width in Herdr logical pixels, default `480`, allowed
  range `240–1000`; it is also capped to fit the window.
- `window.max_rows`: visible list rows, default `6`, allowed range `1–12`.
  Keyboard navigation reaches the remaining links.

Inline positioning is experimental: the mod calculates the terminal bounds
from the live layout, measures the current font's character advance, and
decodes row/column positions from the observer repaint. It uses a transparent
overlay rather than changing the terminal renderer. If dimensions disagree,
row height is ambiguous, the layout is unsupported, or the terminal has
multiple unzoomed panes, it falls back to window mode with a notice. Window
resize or font/zoom changes while hints are open also trigger that fallback.

## Scope and limitations

- Detects visible `http://`, `https://`, and `www.` addresses.
- Detects named OSC 8 web hyperlinks, such as “GitHub” with a hidden URL.
- Reads the focused terminal's **current program screen** once when opened.
  It does not read the app's independently scrolled viewport or its history.
- Inline badges use that snapshot. Live output is not frozen or tracked;
  close and reopen hints if the terminal text moves.
- URLs broken by actual newlines are not joined or guessed.
- Unsupported terminal editing sequences disable inline positioning; the
  bounded decoder is not a complete terminal emulator.
- Terminal search, keyboard selection, and copy mode are separate features.

## Data access

The mod calls `hc read --json --lines 0 <focused-terminal>` through Herdr's
`hc()` API for visible URLs. Its bundled Python helper reads dimensions with
`hc get --json <focused-terminal>`, then briefly runs
`hc attach --observe --history 0 <focused-terminal>` to capture a repaint,
including hidden OSC 8 destinations and cursor positions. The observer cannot
send input or resize the terminal. It closes after a quiet gap, with a
five-second startup limit and bounded output capture, and cleans up only its
own client. Reads use the current profile and support qualified remote
terminal addresses. If Python or the observer is unavailable, visible URLs
still work in window mode, with a notice that named links could not be read.

Terminal text stays in memory while hints are open. The mod does not fetch
URLs, record terminal text, use telemetry, or store credentials. It opens the
selected URL with Herdr's system-browser API, or writes it to the clipboard
when explicitly requested. Its source has no external imports beyond Herdr's
built-in modules and Python's standard library.

## Update or remove

For updates, compare this repository's `mods/link-hints/` with your installed
copy, back up any local edits, copy the changed files, and run
`herdr-app check` again. Do not overwrite unrelated settings. Users upgrading
from 0.1.x should also merge the new `mod:link-hints` F2 binding.

To remove it, dismiss hints, remove the `mod.open:link-hints` binding and
`mod:link-hints` section from your app's `keys.json`, and remove that app
folder's `mods/link-hints/` directory and optional `link-hints.json` file.
Restore your previous binding if wanted. Repeat for other installed profiles.

## Development

Requires Node.js 22 or newer for the tests; no npm dependencies:

```sh
npm test
herdr-app check "$PWD/mods/link-hints"
```

Tests cover URL extraction, duplicate handling, hint uniqueness, keyboard
open/copy/navigation, focus capture, cancellation, mode switching, config
validation, layout geometry, and fallback conditions. Python tests verify
read-only observer flags, client cleanup, repaint decoding, and positioned
hyperlinks using a fake `hc` executable.
The UI harness mocks Herdr, so also inspect both modes in a running app after
UI changes. Never automate keys on someone else's real terminal to test it.

`RECIPE.md` describes how to rebuild the mod from scratch. `preview.svg` is
the editable source for the illustrative window-mode preview; regenerate
the PNG with `rsvg-convert preview.svg -o preview.png`.

## License

[MIT](LICENSE). Inspired by Foot's interaction; no Foot source is included.
