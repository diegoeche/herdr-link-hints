#!/usr/bin/env python3
"""Build self-contained selector mods and merge their configured shortcuts."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
SOURCE = next(path for path in (ROOT / "mods/link-hints", ROOT / "modules/link-hints", ROOT / "link-hints")
              if path.is_dir())


def entries(config):
    defaults = json.loads((ROOT / "selectors.example.json").read_text())["selectors"]
    result = {}
    for name, settings in {**defaults, **config.get("selectors", {})}.items():
        if not re.fullmatch(r"[a-z][a-z0-9-]*", name):
            raise ValueError("Invalid selector name: " + name)
        if settings is False or settings.get("enabled") is False:
            continue
        result[name] = {**defaults.get(name, {}), **settings}
    return result


def mod_name(name):
    return {"links": "link-hints", "execute": "execute-hints", "images": "image-hints"}.get(name, "selector-" + name)


def build_files(config):
    files = {}
    source_files = [p for p in SOURCE.rglob("*") if p.is_file()
                    and p.suffix in (".js", ".py", ".md") and not p.name.endswith(".d.ts")
                    and "__pycache__" not in p.parts]
    # The helper and engine remain available even if the links selector is disabled.
    for file in source_files:
        files[Path("mods/link-hints") / file.relative_to(SOURCE)] = file.read_bytes()
    files[Path("mods/link-hints/mod.json")] = (SOURCE / "mod.json").read_bytes()
    for name, settings in entries(config).items():
        module = mod_name(name)
        if name == "links":
            continue
        folder = Path("mods") / module
        for file in source_files:
            relative = file.relative_to(SOURCE)
            if relative == Path("main.js"):
                relative = Path("selector.js")
            files[folder / relative] = file.read_bytes()
        wrapper = ('import Selectors from "./selector.js";\n'
                   'export default class ConfiguredSelector extends Selectors {\n'
                   '  init(options, cx) {\n'
                   '    super.init({...options, selector: ' + json.dumps(name) + '}, cx);\n'
                   '  }\n}\n')
        files[folder / "main.js"] = wrapper.encode()
        metadata = {"place": "none", "title": settings.get("title", name),
                    "overlay": {"kind": "window", "frame": "none", "at": {"x": 0, "y": 0}, "width": 1, "height": 1}}
        files[folder / "mod.json"] = (json.dumps(metadata, indent=2) + "\n").encode()
        files[folder / ".selector-entry.json"] = (json.dumps({"engine": "link-hints", "selector": name}) + "\n").encode()
    return files


def merge_keys(keys, config, replace=()):
    keys = json.loads(json.dumps(keys))
    global_keys = keys.setdefault("global", {})
    claimed = {}
    enabled = entries(config)
    defaults = json.loads((ROOT / "selectors.example.json").read_text())["selectors"]
    for name in set(defaults) | set(config.get("selectors", {})):
        if name in enabled:
            continue
        module = mod_name(name)
        for chord, binding in list(global_keys.items()):
            if binding == "mod.open:" + module:
                del global_keys[chord]
        keys.pop("mod:" + module, None)
    for name, settings in enabled.items():
        shortcut = settings.get("shortcut")
        if not shortcut:
            continue
        if shortcut in claimed:
            raise ValueError("Duplicate shortcut: " + shortcut)
        claimed[shortcut] = name
        module = mod_name(name)
        action = "mod.open:" + module
        previous = global_keys.get(shortcut)
        if previous and previous != action and shortcut not in replace:
            raise ValueError(f"{shortcut} is already {previous}; use --replace-key {shortcut} to replace it")
        for chord, binding in list(global_keys.items()):
            if binding == action and chord != shortcut:
                del global_keys[chord]
        global_keys[shortcut] = action
        keys.setdefault("mod:" + module, {}).update({"f2": module + ".toggle-mode", "f3": module + ".next-selector"})
    return keys


def write_files(destination, files):
    backup = destination / "selector-backups" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    changed = []
    for relative, content in files.items():
        target = destination / relative
        if target.is_file() and target.read_bytes() == content:
            continue
        if target.exists():
            saved = backup / relative
            saved.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, saved)
        target.parent.mkdir(parents=True, exist_ok=True)
        # Follow existing dotfile symlinks instead of replacing them.
        target.write_bytes(content)
        changed.append(str(relative))
    return changed, backup


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--app-home", type=Path)
    target.add_argument("--build-dir", type=Path)
    parser.add_argument("--config", type=Path)
    parser.add_argument("--replace-key", action="append", default=[])
    args = parser.parse_args()
    destination = (args.app_home or args.build_dir).expanduser().resolve()
    config_path = args.config or destination / "selectors.json"
    if config_path.exists():
        config = json.loads(config_path.read_text())
    elif (destination / "link-hints.json").exists():
        config = {**json.loads((ROOT / "selectors.example.json").read_text()),
                  **json.loads((destination / "link-hints.json").read_text())}
    else:
        config = json.loads((ROOT / "selectors.example.json").read_text())
    files = build_files(config)
    if args.app_home:
        key_path = destination / "keys.json"
        keys = json.loads(key_path.read_text()) if key_path.exists() else {}
        keys = merge_keys(keys, config, args.replace_key)
        for name in entries(config):
            folder = destination / "mods" / mod_name(name)
            if name != "links" and folder.exists() and not (folder / ".selector-entry.json").exists():
                raise ValueError("Existing mod is not a managed selector entry: " + str(folder))
        files[Path("keys.json")] = (json.dumps(keys, indent=2) + "\n").encode()
        files[Path("selectors.json")] = (json.dumps(config, indent=2) + "\n").encode()
    changed, backup = write_files(destination, files)
    link = destination / "mods/link-hints"
    if args.app_home and link.is_symlink():
        replacement = link.with_name(".link-hints-reload")
        if replacement.is_symlink():
            replacement.unlink()
        replacement.symlink_to(os.readlink(link))
        replacement.replace(link)
    print(json.dumps({"destination": str(destination), "changed": changed,
                      "backup": str(backup) if backup.exists() else None}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError) as error:
        raise SystemExit(str(error))
