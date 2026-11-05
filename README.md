# Herdr Inline Selectors

Foot-style inline selectors for **links, shell commands, image paths, and local extensions** in Herdr's desktop app. Inline letter badges are the default; F2 switches to a compact window. F3 cycles enabled selectors without rereading the terminal.

| Shortcut | Select | Action |
| --- | --- | --- |
| Ctrl+Shift+O | HTTP(S)/www links, including named hyperlinks | Open in the browser |
| Ctrl+Shift+X | Lines beginning with `!`, such as `!git status` | Type `!command` into the same terminal input |
| Ctrl+Shift+I | Image paths, including quoted paths with spaces | Open the configured viewer |

Type a badge to activate it. Shift on its last letter copies the value instead. Arrows/Tab select; Enter activates; Shift+Enter copies. Escape or an outside click closes the selector. The selector's own shortcut closes it; another selector shortcut switches actions. Duplicate values share a hint. More than 14 values receive equal-length, multi-letter hints.

Selecting a command types it, including the leading `!`, into the exact source Codex/Claude terminal. Review it and press Enter yourself; the selector never submits it. Existing draft text is retained. The assistant's normal command flow displays output, failures and any approval requests in the same conversation. Image viewing defaults to `xdg-open`; replace it with your preferred viewer in configuration.

If input transfer fails, the selector stays open with a visible error and the same command selected. It does not retry automatically. If the connection fails after writing, check the source prompt before retrying to avoid duplicate text. A warning printed by a command alone does not establish that it failed; the assistant's command result determines that.

![Inline mode with letter badges beside terminal URLs](preview-inline.png)

![Compact window mode](preview.png)

Development is hosted on Gitea; GitHub is the public push mirror. The illustrated previews show the original link selector; the same badge interface serves the other actions.

## Install

Requires Herdr desktop 0.1.12, hc 0.1.17, and Python 3.8+. The optional separate-tab runner requires Bash. No packages or services are installed by this project. Review the source first: mods, configured processes, and local plugins run trusted code.

```sh
python3 scripts/install.py --app-home ~/.config/herdr-app
```

The installer builds self-contained launcher mods, merges shortcuts into existing keys.json, and creates selectors.json. Existing changed files are backed up under `selector-backups/`. It preserves existing dotfile symlinks. It refuses to overwrite an unrelated launcher mod or replace an existing shortcut without an explicit replacement option.

Herdr normally uses Ctrl+Shift+O to split a pane and Ctrl+Shift+X to close one. To deliberately replace those bindings:

```sh
python3 scripts/install.py --app-home ~/.config/herdr-app \
  --replace-key ctrl-shift-o --replace-key ctrl-shift-x
```

Check more specific `terminal` or `layout:*` key sections if they override a global shortcut. Install separately into each independently configured app profile. Use `$HERDR_APP_HOME` when it identifies your intended profile.

```sh
herdr-app check ~/.config/herdr-app/mods/link-hints
herdr-app check ~/.config/herdr-app/mods/execute-hints
herdr-app check ~/.config/herdr-app/mods/image-hints
herdr-app status
```

The native runtime requires imports to stay inside each mod directory. The installer copies one canonical engine into the launchers; edit `mods/link-hints/` in this source project and rebuild to update them together. Build without installing with `python3 scripts/install.py --build-dir /tmp/herdr-selectors`.

## Configuration

Edit `<app-home>/selectors.json`. The full defaults are in [selectors.example.json](selectors.example.json):

```json
{
  "mode": "inline",
  "default_selector": "links",
  "selectors": {
    "links": {
      "title": "Links",
      "shortcut": "ctrl-shift-o",
      "match": {"type": "url"},
      "action": {"type": "open-url"}
    },
    "execute": {
      "title": "Commands",
      "shortcut": "ctrl-shift-x",
      "match": {"type": "prefix", "prefix": "!"},
      "action": {"type": "type-command", "prefix": "!"}
    },
    "images": {
      "title": "Images",
      "shortcut": "ctrl-shift-i",
      "match": {"type": "image-path"},
      "action": {"type": "open-file", "argv": ["xdg-open", "{value}"]}
    }
  }
}
```

Built-in selector settings merge with defaults. Set a selector to `false` or set its `enabled` field to `false` to disable it. Settings reload on each opening. F2 and F3 choices last for that opening. The legacy `link-hints.json` is read only when selectors.json is absent; installation migrates its mode and calibration.

After changing shortcuts or adding selectors, rerun the installer. It generates launchers such as `selector-tickets` and updates the matching key bindings. Native keys.json remains the actual shortcut map.

Geometry settings retain their previous names:

```json
{
  "inline": {"device_scale": 1, "cell_height": null, "offset_x": 0, "offset_y": 0},
  "window": {"width": 480, "max_rows": 6}
}
```

Use your monitor scale for device_scale. Leave cell_height null to infer it; offsets are small calibration corrections in GPUI window pixels. Window width is in Herdr logical pixels. Long lists page around keyboard selection, and the number of visible rows shrinks to fit the window. The whole card can scroll when space is especially limited.

## Matchers and actions

| Matcher | Settings | Values |
| --- | --- | --- |
| `url` | None | Web URLs and named OSC 8 destinations |
| `prefix` | `prefix`, default `!` | The rest of a logical line after its marker; optional leading whitespace or prompt |
| `image-path` | None | Absolute, relative, home-relative, or file:// image paths; quotes permit spaces |
| `regex` | `pattern`, optional `flags`, `capture` (default 1; 0 is the whole match) | A selected capture from each match |

| Action | Settings | Behavior |
| --- | --- | --- |
| `open-url` | Optional `template` | Open an HTTP(S) destination |
| `type-command` | Optional `prefix`, default `!` | Type into the captured source terminal without Enter |
| `run-command` | None | Run the value in a separate terminal tab using Bash |
| `open-file` | Optional `argv` | Resolve a local path and open a viewer |
| `process` | `argv`, optional `terminal` | Run a configured program directly, or in a new terminal tab |

In templates and argv elements, `{value}` inserts the exact selected value and `{encoded}` inserts its URL-encoded form. Process arguments stay separate; shell syntax in a selected value is interpreted only by the explicit run-command action.

The type-command helper uses the [documented hc attach protocol](https://github.com/herdrdev/herdr-core/blob/master/schema/README.md#attach-streams) to send exact UTF-8 text at the terminal's current dimensions. It sends no Enter or resize frame and changes no clipboard content. It refuses blocked approval dialogs and control characters. The run-command action remains available if you deliberately want a separate shell tab instead.

For example, select ticket references and open your tracker:

```json
{
  "selectors": {
    "tickets": {
      "title": "Tickets",
      "shortcut": "ctrl-shift-j",
      "match": {"type": "regex", "pattern": "PROJ-([0-9]+)", "capture": 1},
      "action": {"type": "open-url", "template": "https://tracker.example/ticket/{encoded}"}
    }
  }
}
```

## Local plugins

For mechanisms beyond configuration, edit `mods/link-hints/plugins.js` in this source project. Export matcher functions and action functions by name, then reference those names from selectors.json. Reinstall after editing plugins. The installer also copies additional local .js modules imported by plugins.js.

```js
export const matchers = {
  issue(text) {
    return [...text.matchAll(/ISSUE-(\d+)/g)].map(m => ({
      value: m[1], match: m[0], label: m[0]
    }));
  }
};

export const actions = {
  issue(value, options, context) {
    context.cx.open_url(`https://tracker.example/${encodeURIComponent(value)}`);
  }
};
```

A matcher receives `(text, options)` and returns `{value, match?, label?}` objects. `value` is passed to the action; `match` is the exact terminal text to locate for the badge; `label` is optional window text. An action receives `(value, options, context)` and may return a promise. Context supplies `cx`, `run`, `exec`, `home`, `machine`, and the captured `target` (including source directory and space). Async actions run in a native task context.

Matchers never perform actions during loading or rendering. Plugins can replace a built-in name deliberately. There is no downloaded plugin registry or dynamic remote code loader.

## Overflow and current limits

Soft-wrapped URLs and commands retain their complete values: hc's logical screen text supplies the value, and the decoded repaint supplies physical badge coordinates. Actual newlines are preserved and never joined speculatively. All list items remain reachable when they exceed the visible rows.

**Scrollback remains a host API limitation.** This mod reads the program's current screen, not Herdr's independently scrolled viewport or offscreen history. Return to the bottom before opening inline selectors. Reopen after output moves; snapshots do not freeze the program.

Inline mode requires reliable positioning, a supported layout, and one visible terminal pane or a zoomed pane. Ambiguous geometry, unsupported repaint edits, window resizing, or font changes fall back to the compact window with a notice. Native font-bound rounding is accounted for. The built-in image viewer handles local files; remote image retrieval requires a custom action.

## Development and QA

Node.js 22+ is required for tests; there are no npm dependencies:

```sh
npm test
python3 scripts/install.py --build-dir /tmp/herdr-selectors
herdr-app check /tmp/herdr-selectors/mods/link-hints
herdr-app check /tmp/herdr-selectors/mods/execute-hints
herdr-app check /tmp/herdr-selectors/mods/image-hints
```

Tests cover extraction, complete wrapped values, cell positions, prefix-free hints, action dispatch, source-directory capture, shell argument handling, image paths, custom regexes, overflow paging, config migration, shortcut collisions, observer cleanup, and the original link controls. Native checks load each launcher once; manual QA is separate. See [QA.md](QA.md) for the checklist and [RECIPE.md](RECIPE.md) for the implementation brief.

No terminal text is saved, uploaded, or fetched by extraction. The observer cannot type or resize. Browser, command, and viewer actions happen only when explicitly selected. Never automate test keys on another person's real terminal.

## License

MIT. Inspired by Foot's interaction; no Foot source is included.
