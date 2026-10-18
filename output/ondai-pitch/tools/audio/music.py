"""The score: an original, progressive tech bed for the 180 s pitch, 96 BPM in D minor.

Arc (follows the acts): a held, dark open (0–15) → the reveal swell at 15.0 → the product groove
from 27.5 → a breakdown under «¿Y cómo sabe OndAI…?» (60–70) → the technical section with its
own breaks where the voice rests → a warmer, fuller close from 135 → a riser into the final hit
at 172.1 and an elegant tail to 180.
"""
import numpy as np
from synth import SR, t_axis, lowpass, highpass, stereo, reverb, IR_LONG, IR_SHORT, midi, saw, noise

DUR = 180.0
N = int(DUR * SR)
BEAT = 60 / 96
BAR = BEAT * 4

CHORDS = [
    [50, 57, 60, 64, 65],  # Dm9
    [46, 53, 57, 60, 62],  # Bbmaj9
    [53, 57, 60, 64, 67],  # Fmaj9
    [48, 55, 62, 64, 67],  # Cadd9
]
ROOTS = [38, 34, 41, 36]


def curve(points):
    """Piecewise-linear automation over the whole film."""
    xs = np.array([p[0] for p in points]) * SR
    ys = np.array([p[1] for p in points])
    return np.interp(np.arange(N), xs, ys)


def chord_at(t):
    return int(t // (2 * BAR)) % 4


def place(buf, x, start):
    i = int(round(start * SR))
    if i >= buf.shape[-1]:
        return
    n = min(x.shape[-1], buf.shape[-1] - i)
    buf[..., i:i + n] += x[..., :n]


def pad_layer():
    out = np.zeros((2, N))
    block = 2 * BAR
    for b in range(int(DUR / block) + 1):
        start = b * block
        length = block + 1.6
        tt = t_axis(length)
        env = np.minimum(1, tt / 1.1) * np.clip((length - tt) / 1.6, 0, 1)
        l = np.zeros(len(tt))
        r = np.zeros(len(tt))
        for m in CHORDS[b % 4]:
            f = midi(m)
            for d, side in ((-7, 'l'), (0, 'b'), (6, 'r')):
                fd = f * 2 ** (d / 1200)
                v = saw(fd, tt, phase=(m * 0.37 + d) % 1)
                if side in ('l', 'b'):
                    l += v
                if side in ('r', 'b'):
                    r += v
        st = np.vstack([l, r]) * env / 12
        place(out, st, start)
    return out


def drone_layer():
    tt = t_axis(DUR)
    d = np.sin(2 * np.pi * midi(26) * tt) + 0.4 * np.sin(2 * np.pi * midi(38) * tt)
    air = lowpass(noise(N, 41), 420) * 0.6
    return stereo((d * 0.5 + air * 0.5) * (0.85 + 0.15 * np.sin(2 * np.pi * 0.11 * tt)), 0)


def arp_layer():
    out = np.zeros((2, N))
    step = BEAT / 4
    pattern = [0, 2, 4, 3, 1, 4, 2, 3]
    for i in range(int(DUR / step)):
        t = i * step
        ch = CHORDS[chord_at(t)]
        m = ch[pattern[i % 8] % len(ch)] + 12 + (12 if (i // 8) % 4 == 3 and i % 8 in (2, 5) else 0)
        f = midi(m)
        tt = t_axis(0.42)
        y = np.zeros(len(tt))
        for k, a in enumerate([1, 0.45, 0.25, 0.14, 0.08], start=1):
            y += a * np.sin(2 * np.pi * f * k * tt) * np.exp(-tt * (9 + 5 * k))
        vel = 0.75 + 0.25 * ((i % 4) == 0)
        pan = 0.45 if i % 2 else -0.45
        place(out, stereo(y * vel, pan), t)
    return reverb(out, IR_LONG, 0.32)


def bass_layer():
    out = np.zeros(N)
    # A syncopated root pattern per bar (in beats) with an octave lift.
    hits = [(0, 0, 1.4), (1.5, 0, 0.5), (2, 12, 0.45), (2.75, 0, 0.6), (3.5, 7, 0.4)]
    for bar in range(int(DUR / BAR)):
        t0 = bar * BAR
        root = ROOTS[chord_at(t0)]
        for beat, off, length in hits:
            t = t0 + beat * BEAT
            f = midi(root + off)
            tt = t_axis(length * BEAT + 0.12)
            e = np.minimum(1, tt / 0.008) * np.exp(-tt * 2.2) * np.clip((len(tt) / SR - tt) / 0.06, 0, 1)
            y = np.tanh(1.8 * (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(4 * np.pi * f * tt))) * e
            place(out[None, :], y[None, :], t)
    return stereo(lowpass(out, 900), 0)


def kick_layer(four=True):
    out = np.zeros(N)
    tt = t_axis(0.45)
    f = 44 + 90 * np.exp(-tt * 32)
    ph = 2 * np.pi * np.cumsum(f) / SR
    k = np.sin(ph) * np.exp(-tt * 7.5)
    k += highpass(noise(len(tt), 51), 1500) * np.exp(-tt * 300) * 0.25
    k = np.tanh(1.3 * k)
    for i in range(int(DUR / BEAT)):
        if not four and i % 2:
            continue
        place(out[None, :], k[None, :], i * BEAT)
    return stereo(out, 0)


def hat_layer():
    out = np.zeros((2, N))
    tt = t_axis(0.07)
    for i in range(int(DUR / (BEAT / 2))):
        if i % 2 == 0:
            continue  # offbeats
        h = highpass(noise(len(tt), 60 + i % 7), 7000) * np.exp(-tt * 70)
        place(out, stereo(h * (0.8 + 0.2 * (i % 4 == 3)), 0.25), i * BEAT / 2)
    return out


def clap_layer():
    out = np.zeros((2, N))
    tt = t_axis(0.25)
    c = highpass(lowpass(noise(len(tt), 70), 6000), 900) * np.exp(-tt * 22)
    for i in range(int(DUR / BEAT)):
        if i % 4 in (1, 3):
            place(out, stereo(c, -0.1), i * BEAT)
    return reverb(out, IR_SHORT, 0.35)


def build():
    pad = pad_layer()
    bright = curve([(0, 650), (13.5, 520), (15, 2400), (27, 2800), (60, 1300), (69.5, 1800), (70, 3000), (135, 4200), (171, 5200), (180, 3000)])
    # Brightness: blend a dark and an open version of the pad by the automation curve.
    dark = lowpass(pad, 600)
    opn = lowpass(pad, 5200)
    w = np.clip((bright - 600) / 4600, 0, 1)
    pad = dark * (1 - w) + opn * w
    pad = reverb(pad, IR_LONG, 0.35)

    layers = {
        'pad': (pad, curve([(0, 0.0), (1.5, 0.6), (12, 0.7), (14.3, 0.15), (15.0, 1.6), (19, 1.25), (28, 0.95), (60, 1.3), (70, 0.85), (135, 1.1), (164, 1.35), (172.0, 1.35), (172.3, 0.9), (179.5, 0.0)])),
        'drone': (drone_layer(), curve([(0, 0.0), (0.8, 0.55), (13.8, 0.55), (15, 0.0), (60, 0.0), (61, 0.45), (69.6, 0.45), (70.2, 0.0)])),
        'arp': (arp_layer(), curve([(0, 0), (19.2, 0), (21, 0.42), (28, 0.55), (59.4, 0.55), (60, 0), (70, 0), (71.5, 0.5), (96.5, 0.5), (97.5, 0.22), (104.5, 0.22), (105.5, 0.5), (135, 0.58), (164, 0.66), (171.9, 0.72), (172.1, 0)])),
        'bass': (bass_layer(), curve([(0, 0), (27.4, 0), (27.6, 0.62), (59.6, 0.62), (60, 0), (70, 0), (70.15, 0.62), (96.5, 0.62), (97, 0.0), (104.9, 0.0), (105.1, 0.62), (164, 0.62), (165, 0.3), (171.9, 0.3), (172.1, 0)])),
        'kick': (kick_layer(True), curve([(0, 0), (27.4, 0), (27.6, 0.55), (59.6, 0.55), (60, 0), (70, 0), (70.15, 0.6), (96.5, 0.6), (96.7, 0), (104.9, 0), (105.1, 0.6), (163.8, 0.6), (164, 0), (180, 0)])),
        'hat': (hat_layer(), curve([(0, 0), (37.4, 0), (37.6, 0.16), (59.6, 0.16), (60, 0), (82, 0), (82.1, 0.2), (96.5, 0.2), (96.7, 0), (105.1, 0), (105.2, 0.2), (163.8, 0.24), (164, 0)])),
        'clap': (clap_layer(), curve([(0, 0), (135, 0), (135.1, 0.22), (163.8, 0.22), (164, 0)])),
    }
    mix = np.zeros((2, N))
    for name, (x, g) in layers.items():
        mix += x[:, :N] * g
    # Fade the tail to silence at 180 s.
    mix *= curve([(0, 1), (176.0, 1), (179.6, 0), (180, 0)])
    mix /= np.max(np.abs(mix)) + 1e-9
    return mix * 0.5  # −6 dBFS peak; the mix sets its level under the voice
