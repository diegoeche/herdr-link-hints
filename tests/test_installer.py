import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("selector_installer", ROOT / "scripts/install.py")
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class InstallerTests(unittest.TestCase):
    def test_keys_preserve_unrelated_actions_and_require_explicit_collision_resolution(self):
        keys = {"global": {"ctrl-shift-x": "pane.close", "f2": "tab.rename"},
                "terminal": {"ctrl-c": "terminal"}}
        with self.assertRaisesRegex(ValueError, "already pane.close"):
            installer.merge_keys(keys, {})
        merged = installer.merge_keys(keys, {}, ["ctrl-shift-x"])
        self.assertEqual(merged["global"]["f2"], "tab.rename")
        self.assertEqual(merged["terminal"], keys["terminal"])
        self.assertEqual(merged["global"]["ctrl-shift-x"], "mod.open:execute-hints")
        self.assertEqual(keys["global"]["ctrl-shift-x"], "pane.close")

    def test_disabled_selectors_remove_their_managed_shortcuts(self):
        installed = installer.merge_keys({}, {})
        changed = installer.merge_keys(installed, {"selectors": {"images": False}})
        self.assertNotIn("ctrl-shift-i", changed["global"])
        self.assertNotIn("mod:image-hints", changed)

    def test_custom_selectors_build_self_contained_launchers(self):
        files = installer.build_files({"selectors": {"tickets": {
            "shortcut": "ctrl-shift-j", "match": {"type": "regex", "pattern": "T-(\\d+)"},
            "action": {"type": "open-url", "template": "https://tracker.test/{value}"}}}})
        folder = Path("mods/selector-tickets")
        self.assertIn(b'selector: "tickets"', files[folder / "main.js"])
        self.assertEqual(files[folder / "selector.js"], (ROOT / "mods/link-hints/main.js").read_bytes())
        self.assertIn(folder / "plugins.js", files)
        self.assertIn(folder / "actions.js", files)

    def test_installation_migrates_existing_mode_and_keeps_backups(self):
        with tempfile.TemporaryDirectory() as folder:
            home = Path(folder)
            (home / "keys.json").write_text(json.dumps({"global": {"ctrl-shift-x": "pane.close"}}))
            (home / "link-hints.json").write_text(json.dumps({"mode": "window", "inline": {"offset_x": 7}}))
            result = subprocess.run([sys.executable, str(ROOT / "scripts/install.py"),
                                     "--app-home", folder, "--replace-key", "ctrl-shift-x"],
                                    capture_output=True, text=True, check=True)
            report = json.loads(result.stdout)
            config = json.loads((home / "selectors.json").read_text())
            self.assertEqual(config["mode"], "window")
            self.assertEqual(config["inline"]["offset_x"], 7)
            self.assertIn("execute", config["selectors"])
            self.assertTrue((Path(report["backup"]) / "keys.json").exists())
            self.assertTrue((home / "mods/image-hints/selector.js").exists())

    def test_key_collision_makes_no_partial_installation(self):
        with tempfile.TemporaryDirectory() as folder:
            home = Path(folder)
            (home / "keys.json").write_text('{"global":{"ctrl-shift-x":"pane.close"}}')
            result = subprocess.run([sys.executable, str(ROOT / "scripts/install.py"), "--app-home", folder],
                                    capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((home / "mods").exists())
            self.assertFalse((home / "selectors.json").exists())


if __name__ == "__main__":
    unittest.main()
