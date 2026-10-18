"""Render the score and the effects stem for the OndAI pitch.

    python tools/audio/build_audio.py            # music + sfx for the whole film
    python tools/audio/build_audio.py --sfx-only

Effects come from compositions/scenes.json (each scene's <!-- sfx --> cues, scene-local) shifted by
the scene start, plus src/audio-cues.json (film-wide cues in global time). The music is written at
full level; the composition carves it under the narration (hyperframes-audio voiceover carve).
Outputs 48 kHz stereo float WAVs in assets/audio/.
"""
import json
import sys
from pathlib import Path

import numpy as np
from scipy.io import wavfile

sys.path.insert(0, str(Path(__file__).parent))
from synth import SR, EFFECTS, LEVELS  # noqa: E402
import music  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
AUDIO = ROOT / 'assets/audio'
DUR = 180.0
N = int(DUR * SR)


def load_cues():
    cues = []
    scenes = json.loads((ROOT / 'compositions/scenes.json').read_text())
    for s in scenes:
        for c in s['sfx']:
            cues.append({**c, 't': round(s['start'] + c['t'], 3), 'scene': s['id']})
    extra = ROOT / 'src/audio-cues.json'
    if extra.exists():
        cues += json.loads(extra.read_text())
    return sorted(cues, key=lambda c: c['t'])


def build_sfx(cues):
    out = np.zeros((2, N))
    cache = {}
    for c in cues:
        kind = c['type']
        if kind not in cache:
            cache[kind] = EFFECTS[kind]()
        x = cache[kind] * LEVELS[kind] * c.get('gain', 1.0)
        i = int(round(c['t'] * SR))
        if i >= N:
            continue
        n = min(x.shape[1], N - i)
        out[:, i:i + n] += x[:, :n]
    return out


def write(name, x):
    peak = np.max(np.abs(x))
    if peak > 0.99:
        x = x * (0.99 / peak)
    wavfile.write(AUDIO / name, SR, x.T.astype(np.float32))
    print(f'{name}: peak {20 * np.log10(np.max(np.abs(x)) + 1e-12):.1f} dBFS')


def main():
    cues = load_cues()
    (AUDIO / 'sfx-cues.json').write_text(json.dumps(cues, indent=1, ensure_ascii=False))
    write('sfx.wav', build_sfx(cues))
    print(f'{len(cues)} sound cues')
    if '--sfx-only' in sys.argv:
        return
    write('music.wav', music.build())


if __name__ == '__main__':
    main()
