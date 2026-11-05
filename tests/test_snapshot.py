import importlib.util
import os
from pathlib import Path
import json
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "link_snapshot", Path(__file__).resolve().parents[1] / "mods/link-hints/snapshot.py")
sys.path.insert(0,str(Path(__file__).resolve().parents[1] / "mods/link-hints"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
from terminal_grid import decode_repaint


class SnapshotTests(unittest.TestCase):
    def test_cli_reads_dimensions_and_returns_positioned_links(self):
        with tempfile.TemporaryDirectory() as folder:
            helper = Path(folder) / "hc"
            helper.write_text(f"#!{sys.executable}\n" + '''
import json, sys
if sys.argv[1:] == ['get', '--json', 'remote/t9']:
    print(json.dumps({'cols':80, 'rows':24}))
elif sys.argv[1:] == ['attach', '--observe', '--history', '0', 'remote/t9']:
    sys.stdout.write('\\x1b[4;7H\\x1b]8;;https://example.com/docs\\x07Docs\\x1b]8;;\\x07')
else:
    sys.exit(9)
''')
            helper.chmod(0o755)
            env = {**os.environ, "PATH": folder + os.pathsep + os.environ["PATH"]}
            result = subprocess.run([sys.executable, str(Path(module.__file__)), 'remote/t9'],
                                    env=env, capture_output=True, text=True, timeout=10, check=True)
            data = json.loads(result.stdout)
            self.assertEqual((data['cols'], data['rows']), (80,24))
            self.assertTrue(data['positioned'])
            self.assertEqual(data['placements'], [{'url':'https://example.com/docs',
                'row':3, 'col':6, 'length':4, 'explicit':True}])

    def test_named_and_visible_links_have_cell_positions(self):
        ansi='\x1b[2J\x1b[3;5H\x1b]8;;https://example.com/docs\x1b\\Docs\x1b]8;;\x1b\\'
        ansi+='\x1b[5;10Hhttps://example.org/path'
        data=decode_repaint(ansi,80,24)
        self.assertTrue(data['positioned'])
        self.assertIn({'url':'https://example.com/docs','row':2,'col':4,'length':4,'explicit':True},data['placements'])
        visible=next(p for p in data['placements'] if not p['explicit'])
        self.assertEqual((visible['row'],visible['col']),(4,9))

    def test_clear_removes_stale_links_and_unicode_counts_cells(self):
        ansi='\x1b[1;1H\x1b]8;;https://example.com/old\x07Old\x1b]8;;\x07'
        ansi+='\x1b[1;1H\x1b[2K\x1b[2;5H中\x1b]8;;https://example.com/new\x07New\x1b]8;;\x07'
        data=decode_repaint(ansi,80,24)
        self.assertEqual(len(data['placements']),1)
        self.assertEqual((data['placements'][0]['row'],data['placements'][0]['col']),(1,6))

    def test_unsupported_screen_edit_disables_inline_alignment(self):
        self.assertFalse(decode_repaint('\x1b[2L',80,24)['positioned'])

    def test_grid_lines_preserve_wrapped_rows_and_utf16_cell_mapping(self):
        data = decode_repaint('https://example.com/long/path', 20, 4)
        self.assertEqual(''.join(line['text'] for line in data['lines']).rstrip(),
                         'https://example.com/long/path')
        data = decode_repaint('中😀https://example.com/', 40, 2)
        line = data['lines'][0]
        offset = len('中😀'.encode('utf-16-le')) // 2
        self.assertEqual(line['columns'][offset], 4)

    def test_core_reset_tabs_colors_and_cursor_protocols_are_supported(self):
        ansi='\x1b[!p\x1b[?1049l\x1b[=0;1u\x1b[3g\x1b[9G\x1bH\x1b[1;1H\x1b[38:2:1:2:3mhello'
        self.assertTrue(decode_repaint(ansi,80,24)['positioned'])

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
