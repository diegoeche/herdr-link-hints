"""Decode the positioned repaint emitted by hc's read-only observer.

This is a bounded snapshot decoder, not an interactive terminal emulator.
Unsupported screen transformations disable inline positioning.
"""
import re
import unicodedata

CSI = re.compile(r"\x1b\[([0-?]*)([ -/]*)([@-~])")
OSC = re.compile(r"\x1b\]([^\x07\x1b]*)(?:\x07|\x1b\\)")
URL = re.compile(r'''(?:https?://|\bwww\.)[^\s<>"'`\x00-\x1f\x7f]+''', re.I)


def decode_repaint(text, cols, rows):
    if not 1 <= cols <= 1000 or not 1 <= rows <= 500:
        return {"placements": [], "positioned": False}
    grid = [[(" ", None) for _ in range(cols)] for _ in range(rows)]
    x = y = 0
    saved = (0, 0)
    link = None
    safe = True
    wrap = True
    at = 0

    def clear(row, start=0, end=cols):
        grid[row][start:end] = [(" ", None)] * (end - start)

    def next_row():
        nonlocal y
        y += 1
        if y >= rows:
            grid.pop(0)
            grid.append([(" ", None) for _ in range(cols)])
            y = rows - 1

    while at < len(text):
        if text.startswith("\x1b]", at):
            match = OSC.match(text, at)
            if not match:
                safe = False
                break
            fields = match[1].split(";", 2)
            if len(fields) == 3 and fields[0] == "8":
                link = fields[2] or None
            at = match.end()
            continue
        if text.startswith("\x1b[", at):
            match = CSI.match(text, at)
            if not match:
                safe = False
                break
            raw, intermediate, final = match.groups()
            if final == "m":
                at = match.end()
                continue
            private = raw.startswith(("?", ">", "="))
            try:
                values = [int(n) if n else 0 for n in raw.lstrip("?<>=").split(";")]
            except ValueError:
                safe = False
                break
            n = (values[0] if values else 0) or 1
            if final in "Hf" and not private:
                y = min(rows-1, max(0, n-1))
                x = min(cols-1, max(0, (values[1] if len(values)>1 else 1)-1))
            elif final == "A" and not private: y = max(0, y-n)
            elif final == "B" and not private: y = min(rows-1, y+n)
            elif final == "C" and not private: x = min(cols-1, x+n)
            elif final == "D" and not private: x = max(0, x-n)
            elif final in "G`" and not private: x = min(cols-1, max(0, n-1))
            elif final == "d" and not private: y = min(rows-1, max(0, n-1))
            elif final == "E" and not private: y, x = min(rows-1,y+n), 0
            elif final == "F" and not private: y, x = max(0,y-n), 0
            elif final == "J" and not private:
                mode = values[0]
                if mode in (2,3):
                    for row in range(rows): clear(row)
                elif mode == 0:
                    clear(y,min(x,cols))
                    for row in range(y+1,rows): clear(row)
                elif mode == 1:
                    for row in range(y): clear(row)
                    clear(y,0,min(x+1,cols))
            elif final == "K" and not private:
                mode = values[0]
                clear(y,0 if mode in (1,2) else min(x,cols),min(x+1,cols) if mode==1 else cols)
            elif final == "X" and not private: clear(y,min(x,cols),min(cols,x+n))
            elif final == "s" and not private: saved = (x,y)
            elif final == "u" and not private: x,y = saved
            elif private and final in "hl":
                if 7 in values: wrap = final == "h"
                if final == "h" and any(v in values for v in (47,1047,1049)):
                    for row in range(rows): clear(row)
                    x = y = 0
            elif final in "mnuqcg" or intermediate == "!": pass
            else:
                # Insert/delete/scroll regions and graphics transforms require
                # a full emulator. Keep URLs but refuse speculative positions.
                safe = False
            at = match.end()
            continue
        if text[at] == "\x1b":
            if at+1 < len(text) and text[at+1] in "()":
                at += 3
                continue
            code = text[at+1:at+2]
            if code == "7": saved = (x,y)
            elif code == "8": x,y = saved
            elif code == "c":
                for row in range(rows): clear(row)
                x = y = 0
            elif code not in ("=", ">", "\\", "H"): safe = False
            at += 2
            continue
        char = text[at]
        at += 1
        if char == "\r": x = 0
        elif char == "\n": next_row()
        elif char == "\b": x = max(0,x-1)
        elif char == "\t": x = min(cols-1,(x//8+1)*8)
        elif ord(char) < 32 or ord(char) == 127: continue
        elif unicodedata.combining(char):
            column = min(cols-1,max(0,x-1))
            old, uri = grid[y][column]
            grid[y][column] = (old+char,uri)
        else:
            width = 2 if unicodedata.east_asian_width(char) in ("W","F") else 1
            if x >= cols:
                if wrap: x = 0; next_row()
                else: x = cols-1
            if width == 2 and x+1 >= cols:
                if wrap: x = 0; next_row()
                else: width = 1
            grid[y][x] = (char,link)
            if width == 2: grid[y][x+1] = ("",link)
            x += width

    placements = []
    for row, cells in enumerate(grid):
        column = 0
        while column < cols:
            uri = cells[column][1]
            end = column+1
            if uri:
                while end < cols and cells[end][1] == uri: end += 1
                placements.append({"url":uri,"row":row,"col":column,"length":end-column,"explicit":True})
            column = end
        visible = "".join(cell[0] for cell in cells)
        columns = []
        for column, (char, _) in enumerate(cells): columns.extend([column]*len(char))
        for match in URL.finditer(visible):
            column = columns[match.start()]
            if not cells[column][1]:
                placements.append({"url":match[0],"row":row,"col":column,
                    "length":len(match[0]),"explicit":False})
    return {"placements":placements,"positioned":safe}
