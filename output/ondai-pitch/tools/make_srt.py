"""Spanish subtitles for the pitch from tools/phrases.json (phrase bounds from silence detection,
text from the recorded script). Long phrases split at punctuation, timed by their share of
characters; cues hold at most two lines of 42 characters.

    python tools/make_srt.py > ondai-pitch-final.srt
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAX_LINE = 42
MAX_CUE = 2 * MAX_LINE - 4


def ts(t):
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f'{h:02}:{m:02}:{s:02},{ms:03}'


def chunks(text):
    """Split a phrase into cue-sized pieces, preferring clause boundaries."""
    if len(text) <= MAX_CUE:
        return [text]
    parts = re.split(r'(?<=[,:;])\s+', text)
    out, cur = [], ''
    for p in parts:
        if cur and len(cur) + 1 + len(p) > MAX_CUE:
            out.append(cur)
            cur = p
        else:
            cur = f'{cur} {p}'.strip()
    if cur:
        out.append(cur)
    final = []
    for c in out:
        while len(c) > MAX_CUE:
            spaces = [i for i, ch in enumerate(c) if ch == ' ']
            # Prefer a break before «y» near the middle, else the space nearest the middle.
            joins = [i for i in spaces if c[i + 1:i + 3] == 'y ' and abs(i - len(c) / 2) < 16]
            cut = min(joins or spaces, key=lambda i: abs(i - len(c) / 2))
            final.append(c[:cut])
            c = c[cut + 1:]
        final.append(c)
    return final


def balanced(text):
    """One line if it fits, else two lines broken at the space nearest the middle."""
    if len(text) <= MAX_LINE:
        return [text]
    spaces = [i for i, ch in enumerate(text) if ch == ' ']
    fits = [i for i in spaces if i <= MAX_LINE and len(text) - i - 1 <= MAX_LINE]
    cut = min(fits or spaces, key=lambda i: abs(i - len(text) / 2))
    return [text[:cut], text[cut + 1:]]


def main():
    phrases = json.loads((ROOT / 'tools/phrases.json').read_text())
    cues = []
    for p in phrases:
        pieces = chunks(p['text'])
        total = sum(len(x) for x in pieces)
        t = p['start']
        span = p['end'] - p['start']
        for x in pieces:
            d = span * len(x) / total
            cues.append((t, t + d, x))
            t += d
    lines = []
    for i, (a, b, text) in enumerate(cues, 1):
        # Keep each cue on screen at least 1.2 s when the next phrase allows it.
        nxt = cues[i][0] if i < len(cues) else b + 1.2
        b = min(max(b + 0.25, a + 1.2), nxt - 0.05)
        wrapped = balanced(text)
        lines += [str(i), f'{ts(a)} --> {ts(b)}', *wrapped, '']
    print('\n'.join(lines))


if __name__ == '__main__':
    main()
