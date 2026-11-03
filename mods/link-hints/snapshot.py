#!/usr/bin/env python3
"""Capture a bounded, read-only terminal repaint, including OSC 8 targets."""
import json
import os
import queue
import subprocess
import sys
import threading
import time
from terminal_grid import decode_repaint


def snapshot(terminal):
    # Keep stdin open, but never write to it. --observe forbids input and resize.
    process = subprocess.Popen(
        ["hc", "attach", "--observe", "--history", "0", terminal],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
    )
    chunks = queue.Queue(maxsize=128)

    def receive():
        try:
            while True:
                data = os.read(process.stdout.fileno(), 65536)
                chunks.put(data)
                if not data:
                    return
        except (OSError, ValueError):
            pass

    threading.Thread(target=receive, daemon=True).start()
    captured = bytearray()
    deadline = time.monotonic() + 5
    first = None
    try:
        while time.monotonic() < deadline:
            # Wait for the initial repaint, then stop after a quiet gap. A
            # continuously updating agent is bounded to 0.4s after first output.
            wait = max(0.001, min(deadline - time.monotonic(), 0.12 if first else 5))
            try:
                data = chunks.get(timeout=wait)
            except queue.Empty:
                break
            if not data:
                break
            captured.extend(data)
            first = first or time.monotonic()
            if len(captured) > 4 * 1024 * 1024:
                raise RuntimeError("Terminal repaint exceeded the snapshot limit")
            if time.monotonic() - first >= 0.4:
                break
    finally:
        # This is only our observer client, never the terminal or core process.
        if process.poll() is None:
            process.terminate()
        try:
            process.wait(timeout=1)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        process.stdin.close()
        process.stdout.close()
    if not captured:
        raise RuntimeError("No terminal repaint received")
    return captured.decode("utf-8", errors="replace")


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise RuntimeError("Expected one terminal address")
        result = subprocess.run(["hc","get","--json",sys.argv[1]],
                                text=True,capture_output=True,timeout=5,check=True)
        terminal = json.loads(result.stdout)
        cols, rows = terminal["cols"], terminal["rows"]
        ansi = snapshot(sys.argv[1])
        print(json.dumps({"ansi":ansi,"cols":cols,"rows":rows,
                          **decode_repaint(ansi,cols,rows)}))
    except (OSError, RuntimeError, ValueError, KeyError, subprocess.SubprocessError) as error:
        print(json.dumps({"error": str(error)}))
        sys.exit(1)
