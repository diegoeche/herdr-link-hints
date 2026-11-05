import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

HELPER = Path(__file__).resolve().parents[1] / "mods/link-hints/terminal_input.py"
spec = importlib.util.spec_from_file_location("terminal_input", HELPER)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

FAKE_CORE = r'''
import json,os,struct,sys
assert sys.argv[1:] == ['connect']
header=struct.Struct('<IBI')
def exact(n):
    data=b''
    while len(data)<n:
        more=sys.stdin.buffer.read(n-len(data))
        if not more:raise SystemExit(0)
        data+=more
    return data
def frame(channel,kind,payload=b''):
    sys.stdout.buffer.write(header.pack(channel,kind,len(payload))+payload)
    sys.stdout.buffer.flush()
def reply(request,result):
    data=json.dumps({'jsonrpc':'2.0','id':request['id'],'result':result}).encode()+b'\n'
    sys.stdout.buffer.write(data);sys.stdout.buffer.flush()
request=json.loads(sys.stdin.buffer.readline())
assert request['method']=='terminal.get'
assert request['params']['terminal']=='remote/t9'
reply(request,{'state':'live','cols':87,'rows':31,
               'status':{'state':'blocked' if os.environ.get('TEST_BLOCKED') else 'idle'}})
request=json.loads(sys.stdin.buffer.readline())
assert request['method']=='hello' and request['params']['framed']
reply(request,{})
channel,kind,size=header.unpack(exact(9));request=json.loads(exact(size))
assert channel==0 and kind==0 and request['method']=='terminal.attach'
params=request['params']
assert (params['cols'],params['rows'])==(87,31)
assert params['terminal']=='remote/t9' and params['history']==0 and params['observe'] is False
frame(0,0,json.dumps({'jsonrpc':'2.0','id':request['id'],'result':{'channel':7}}).encode())
while True:
    channel,kind,size=header.unpack(exact(9));payload=exact(size)
    assert channel==7 and kind in (0,1,2), 'no resize or focus frames allowed'
    if kind==0:
        with open(os.environ['TEST_CAPTURE'],'wb') as file:file.write(payload)
    if kind==2:
        if os.environ.get('TEST_CLOSE_FAILURE'):
            frame(7,2,b'{"reason":"exited"}')
        else:frame(7,2)
        break
'''


class TerminalInputTests(unittest.TestCase):
    def invoke(self, text, extra=None):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fake = root / "hc"
            fake.write_text(f"#!{sys.executable}\n" + FAKE_CORE)
            fake.chmod(0o755)
            capture = root / "input"
            env = {**os.environ, "PATH": directory+os.pathsep+os.environ["PATH"],
                   "TEST_CAPTURE": str(capture), **(extra or {})}
            result = subprocess.run([sys.executable, str(HELPER), "remote/t9", text],
                                    env=env, text=True, capture_output=True, timeout=10)
            return result, capture.read_bytes() if capture.exists() else None

    def test_raw_utf8_is_exact_and_never_includes_enter(self):
        text = '!printf "quoted ✓" --flag'
        result, captured = self.invoke(text)
        self.assertEqual(result.returncode, 0, result.stdout+result.stderr)
        self.assertEqual(json.loads(result.stdout), {"typed": True, "submitted": False})
        self.assertEqual(captured, text.encode())
        self.assertNotIn(b"\r", captured)
        self.assertNotIn(b"\n", captured)

    def test_blocked_source_gets_no_input(self):
        result, captured = self.invoke("!pwd", {"TEST_BLOCKED":"1"})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("waiting for approval", result.stdout)
        self.assertIsNone(captured)

    def test_failure_after_input_warns_about_an_ambiguous_retry(self):
        result, captured = self.invoke("!pwd", {"TEST_CLOSE_FAILURE":"1"})
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(captured, b"!pwd")
        self.assertIn("may already be typed", result.stdout)

    def test_control_characters_and_oversized_input_are_rejected(self):
        for text in ("", "!pwd\nother", "!pwd\r", "!\x1b", "!"+"x"*16384):
            with self.assertRaises(ValueError):
                module.command_text(text)


if __name__ == "__main__":
    unittest.main()
