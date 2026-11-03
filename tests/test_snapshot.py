import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "link_snapshot", Path(__file__).resolve().parents[1] / "mods/link-hints/snapshot.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SnapshotTests(unittest.TestCase):
    def test_observer_keeps_hyperlinks_and_cleans_up_its_client(self):
        with tempfile.TemporaryDirectory() as folder:
            helper = Path(folder) / "hc"
            pid_file = Path(folder) / "observer.pid"
            helper.write_text(f"#!{sys.executable}\n" + '''
import os, sys, time
assert sys.argv[1:] == ['attach', '--observe', '--history', '0', 'remote/t9']
with open(os.environ['SNAPSHOT_TEST_PID'], 'w') as file:
    file.write(str(os.getpid()))
sys.stdout.buffer.write(b'\\x1b]8;;https://example.com/docs\\x1b')
sys.stdout.buffer.flush()
time.sleep(0.02)
sys.stdout.buffer.write(b'\\\\Named docs\\x1b]8;;\\x1b\\\\')
sys.stdout.buffer.flush()
sys.stdin.buffer.read()
''')
            helper.chmod(0o755)
            with patch.dict(os.environ, {"PATH": folder + os.pathsep + os.environ["PATH"],
                                         "SNAPSHOT_TEST_PID": str(pid_file)}):
                text = module.snapshot("remote/t9")
            self.assertIn("\x1b]8;;https://example.com/docs\x1b\\", text)
            self.assertIn("Named docs", text)
            with self.assertRaises(ProcessLookupError):
                os.kill(int(pid_file.read_text()), 0)

    def test_empty_failed_observer_reports_an_error(self):
        with tempfile.TemporaryDirectory() as folder:
            helper = Path(folder) / "hc"
            helper.write_text(f"#!{sys.executable}\nimport sys\nsys.exit(3)\n")
            helper.chmod(0o755)
            with patch.dict(os.environ, {"PATH": folder + os.pathsep + os.environ["PATH"]}):
                with self.assertRaisesRegex(RuntimeError, "No terminal repaint"):
                    module.snapshot("missing")


if __name__ == "__main__":
    unittest.main()
