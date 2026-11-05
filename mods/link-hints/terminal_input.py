#!/usr/bin/env python3
"""Type one UTF-8 command line into an exact core terminal, without Enter.

Uses hc's documented framed attach protocol. The short-lived client uses the
terminal's current dimensions and closes only its own stream and connection.
"""
import json
import os
import select
import struct
import subprocess
import sys
import time

HEADER = struct.Struct("<IBI")
DATA, CREDIT, CLOSE = 0, 1, 2


def command_text(text):
    if not text or any(ord(char) < 32 or ord(char) == 127 for char in text):
        raise ValueError("Command input must be a single line without control characters.")
    if len(text.encode("utf-8")) > 16384:
        raise ValueError("Command input exceeds the 16 KiB limit.")
    return text


class Core:
    def __init__(self):
        self.process = subprocess.Popen(["hc", "connect"], stdin=subprocess.PIPE,
                                        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                        bufsize=0)
        self.deadline = time.monotonic() + 5
        self.sequence = 0
        self.channel = None

    def read(self, count):
        data = bytearray()
        while len(data) < count:
            wait = self.deadline - time.monotonic()
            if wait <= 0 or not select.select([self.process.stdout], [], [], wait)[0]:
                raise RuntimeError("Timed out reaching the source terminal.")
            part = os.read(self.process.stdout.fileno(), count-len(data))
            if not part:
                raise RuntimeError("The source terminal connection closed.")
            data.extend(part)
        return bytes(data)

    def write(self, payload):
        remaining = memoryview(payload)
        while remaining:
            count = self.process.stdin.write(remaining)
            if not count:
                raise RuntimeError("The source terminal connection stopped accepting input.")
            remaining = remaining[count:]
        self.process.stdin.flush()

    def frame(self, channel, kind, payload=b""):
        self.write(HEADER.pack(channel, kind, len(payload)) + payload)

    def receive(self):
        channel, kind, count = HEADER.unpack(self.read(HEADER.size))
        if count > 16 * 1024 * 1024:
            raise RuntimeError("The core sent an oversized input response.")
        payload = self.read(count)
        if channel and kind == DATA:
            self.frame(channel, CREDIT, struct.pack("<I", len(payload)))
        return channel, kind, payload

    def call(self, method, params, framed=False):
        self.sequence += 1
        identifier = self.sequence
        message = json.dumps({"jsonrpc":"2.0", "id":identifier,
                              "method":method, "params":params}).encode()
        if framed:
            self.frame(0, DATA, message)
        else:
            self.write(message+b"\n")
        while True:
            if framed:
                channel, kind, payload = self.receive()
                if channel or kind != DATA:
                    continue
            else:
                payload = bytearray()
                while not payload.endswith(b"\n"):
                    payload.extend(self.read(1))
                    if len(payload) > 1024 * 1024:
                        raise RuntimeError("The core sent an oversized handshake.")
            response = json.loads(payload)
            if response.get("id") != identifier:
                continue
            if "error" in response:
                raise RuntimeError(response["error"].get("message", "The core rejected input."))
            return response["result"]

    def close(self):
        try:
            self.process.stdin.close()
        except OSError:
            pass
        try:
            self.process.wait(timeout=.5)
        except subprocess.TimeoutExpired:
            self.process.terminate()
            try:
                self.process.wait(timeout=.5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()
        self.process.stdout.close()


def type_text(terminal, text):
    text = command_text(text)
    client = Core()
    sent = False
    try:
        facts = client.call("terminal.get", {"terminal":terminal})
        if facts.get("state") != "live":
            raise RuntimeError("The source terminal has finished.")
        status = facts.get("status") or {}
        if (status.get("state") if isinstance(status, dict) else status) == "blocked":
            raise RuntimeError("The source is waiting for approval. Close its dialog before typing a command.")
        cols, rows = facts["cols"], facts["rows"]
        client.call("hello", {"framed":True})
        result = client.call("terminal.attach", {"terminal":terminal, "caller":None,
                             "cols":cols, "rows":rows, "history":0, "observe":False}, framed=True)
        client.channel = result["channel"]
        # DATA carries literal UTF-8 human input. No newline, Enter, paste wrapper,
        # focus/resize frame, shell interpolation or clipboard change is involved.
        sent = True
        client.frame(client.channel, DATA, text.encode("utf-8"))
        client.frame(client.channel, CLOSE)
        while True:
            channel, kind, payload = client.receive()
            if channel == client.channel and kind == CLOSE:
                if payload:
                    raise RuntimeError("The source terminal closed during input.")
                break
        return {"typed":True, "submitted":False}
    except (OSError, RuntimeError, ValueError, KeyError) as error:
        if sent:
            raise RuntimeError(str(error)+" The command may already be typed; check the source prompt before retrying.") from error
        raise
    finally:
        client.close()


if __name__ == "__main__":
    try:
        if len(sys.argv) != 3:
            raise ValueError("Expected a source terminal and one line of text.")
        print(json.dumps(type_text(sys.argv[1], sys.argv[2])))
    except (OSError, RuntimeError, ValueError, KeyError) as error:
        print(json.dumps({"error":str(error)}))
        sys.exit(1)
