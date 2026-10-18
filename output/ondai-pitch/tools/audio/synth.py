"""Original sound for the OndAI pitch, synthesized locally (numpy/scipy), deterministic.

Nothing here is sampled or downloaded: every sound is generated from oscillators, filtered noise
and a synthetic reverb, so the score and the effects carry no third-party license.
"""
import numpy as np
from scipy import signal

SR = 48000
RNG = np.random.default_rng(30)


def t_axis(dur):
    return np.arange(int(round(dur * SR))) / SR


def noise(n, seed=None):
    rng = np.random.default_rng(seed) if seed is not None else RNG
    return rng.standard_normal(n)


def lowpass(x, f, order=2):
    sos = signal.butter(order, min(f, SR * 0.45), 'low', fs=SR, output='sos')
    return signal.sosfilt(sos, x, axis=-1)


def highpass(x, f, order=2):
    sos = signal.butter(order, f, 'high', fs=SR, output='sos')
    return signal.sosfilt(sos, x, axis=-1)


def bandpass(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, min(hi, SR * 0.45)], 'band', fs=SR, output='sos')
    return signal.sosfilt(sos, x, axis=-1)


def sweep_filter(x, f_curve, kind='band', q=1.2, block=256):
    """Time-varying filter: coefficients follow f_curve (Hz per sample), state carried over."""
    out = np.zeros_like(x)
    zi = None
    for i in range(0, len(x), block):
        f = float(np.clip(f_curve[min(i, len(f_curve) - 1)], 40, SR * 0.42))
        if kind == 'band':
            lo, hi = f / (1 + 0.5 / q), f * (1 + 0.5 / q)
            sos = signal.butter(2, [lo, hi], 'band', fs=SR, output='sos')
        elif kind == 'low':
            sos = signal.butter(2, f, 'low', fs=SR, output='sos')
        else:
            sos = signal.butter(2, f, 'high', fs=SR, output='sos')
        if zi is None:
            zi = signal.sosfilt_zi(sos) * 0
        seg, zi = signal.sosfilt(sos, x[i:i + block], zi=zi)
        out[i:i + block] = seg
    return out


def stereo(mono, pan=0.0):
    """Equal-power pan, pan in [-1, 1] (scalar or per-sample)."""
    p = (np.asarray(pan) + 1) * np.pi / 4
    return np.vstack([mono * np.cos(p), mono * np.sin(p)])


def reverb_ir(seconds=2.2, decay=0.55, bright=6000, seed=7):
    n = int(seconds * SR)
    tt = np.arange(n) / SR
    env = np.exp(-tt / decay)
    l = lowpass(noise(n, seed) * env, bright)
    r = lowpass(noise(n, seed + 1) * env, bright)
    ir = np.vstack([l, r])
    return ir / np.sqrt(np.sum(ir ** 2) / 2)


IR_LONG = reverb_ir(3.2, 0.9, 5200, 11)
IR_SHORT = reverb_ir(1.2, 0.28, 7000, 13)


def reverb(st, ir=IR_LONG, wet=0.3):
    l = signal.fftconvolve(st[0], ir[0])[: st.shape[1]]
    r = signal.fftconvolve(st[1], ir[1])[: st.shape[1]]
    return st * (1 - wet) + np.vstack([l, r]) * wet


def env_adsr(n, a=0.01, d=0.1, s=0.7, r=0.2, hold=None):
    a_n, d_n, r_n = int(a * SR), int(d * SR), int(r * SR)
    hold_n = n - a_n - d_n - r_n if hold is None else int(hold * SR)
    hold_n = max(0, hold_n)
    e = np.concatenate([
        np.linspace(0, 1, max(1, a_n), endpoint=False),
        np.linspace(1, s, max(1, d_n), endpoint=False),
        np.full(hold_n, s),
        np.linspace(s, 0, max(1, r_n)),
    ])
    if len(e) < n:
        e = np.concatenate([e, np.zeros(n - len(e))])
    return e[:n]


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def saw(f, tt, phase=0.0):
    return 2 * ((f * tt + phase) % 1.0) - 1


# ----------------------------------------------------------------------------- effects

def whoosh(dur=0.6, f0=350, f1=2600, f2=700, pan_from=-0.7, pan_to=0.7, seed=1):
    tt = t_axis(dur)
    n = len(tt)
    x = noise(n, seed)
    k = tt / dur
    peak = 0.62
    f = np.where(k < peak, f0 * (f1 / f0) ** (k / peak), f1 * (f2 / f1) ** ((k - peak) / (1 - peak)))
    y = sweep_filter(x, f, 'band', q=0.9)
    e = np.where(k < peak, (k / peak) ** 2.2, (1 - (k - peak) / (1 - peak)) ** 1.6)
    y = y * e
    y /= np.max(np.abs(y)) + 1e-9
    pan = pan_from + (pan_to - pan_from) * k
    return reverb(stereo(y, pan), IR_SHORT, 0.25)


def pop(f=820, dur=0.18, seed=2):
    tt = t_axis(dur)
    fm = f * (1 + 0.6 * np.exp(-tt * 60))
    ph = 2 * np.pi * np.cumsum(fm) / SR
    y = np.sin(ph) * np.exp(-tt * 28)
    y += 0.25 * np.sin(2 * ph) * np.exp(-tt * 45)
    click = highpass(noise(len(tt), seed), 3000) * np.exp(-tt * 400) * 0.25
    y = y + click
    y /= np.max(np.abs(y))
    return reverb(stereo(y, 0), IR_SHORT, 0.18)


def tick(f=2400, dur=0.06, seed=3):
    tt = t_axis(dur)
    y = np.sin(2 * np.pi * f * tt) * np.exp(-tt * 140)
    y += highpass(noise(len(tt), seed), 4000) * np.exp(-tt * 600) * 0.5
    y /= np.max(np.abs(y))
    return stereo(y, 0)


def click(seed=4):
    tt = t_axis(0.045)
    y = highpass(noise(len(tt), seed), 2500) * np.exp(-tt * 380)
    y += 0.6 * np.sin(2 * np.pi * 3400 * tt) * np.exp(-tt * 260)
    y += 0.4 * np.sin(2 * np.pi * 900 * tt) * np.exp(-tt * 200)
    y /= np.max(np.abs(y))
    return stereo(y, 0.1)


def clock_tick(high=True, seed=5):
    tt = t_axis(0.09)
    f = 1900 if high else 1500
    y = bandpass(noise(len(tt), seed), f * 0.7, f * 1.4) * np.exp(-tt * 160)
    y += 0.5 * np.sin(2 * np.pi * f * tt) * np.exp(-tt * 120)
    y /= np.max(np.abs(y))
    return reverb(stereo(y, 0.15 if high else -0.15), IR_SHORT, 0.2)


def riser(dur=1.6, seed=6):
    tt = t_axis(dur)
    k = tt / dur
    n = len(tt)
    nz = sweep_filter(noise(n, seed), 400 * (9000 / 400) ** k, 'band', q=1.5)
    f = 180 * (1100 / 180) ** (k ** 1.4)
    ph = 2 * np.pi * np.cumsum(f) / SR
    tone = (np.sin(ph) + 0.5 * np.sin(2 * ph + 0.3)) * (0.5 + 0.5 * np.sin(2 * np.pi * (4 + 18 * k) * tt))
    y = nz / (np.max(np.abs(nz)) + 1e-9) * 0.8 + tone * 0.35
    y *= k ** 2.4
    fade = np.ones(n)
    fade[-int(0.02 * SR):] = np.linspace(1, 0, int(0.02 * SR))
    y *= fade
    y /= np.max(np.abs(y))
    return reverb(stereo(y, 0), IR_LONG, 0.22)


def impact(dur=1.8, seed=8, bright=0.6):
    tt = t_axis(dur)
    f = 30 + 70 * np.exp(-tt * 9)
    ph = 2 * np.pi * np.cumsum(f) / SR
    sub = np.sin(ph) * np.exp(-tt * 2.6)
    body = lowpass(noise(len(tt), seed), 900) * np.exp(-tt * 14) * 1.6
    crack = highpass(noise(len(tt), seed + 1), 2000) * np.exp(-tt * 55) * bright
    y = np.tanh(1.4 * (sub + body + crack))
    y /= np.max(np.abs(y))
    return reverb(stereo(y, 0), IR_LONG, 0.28)


def shimmer(dur=2.6, base=72, seed=9):
    tt = t_axis(dur)
    notes = [0, 7, 12, 14, 19, 24, 26]
    out = np.zeros((2, len(tt)))
    for i, s in enumerate(notes):
        on = i * 0.07
        e = np.clip((tt - on) / 0.05, 0, 1) * np.exp(-np.clip(tt - on, 0, None) * (1.1 + 0.15 * i))
        f = midi(base + s) * (1 + 0.002 * np.sin(2 * np.pi * 5.5 * tt + i))
        y = np.sin(2 * np.pi * f * tt) * e * (0.9 ** i)
        out += stereo(y, -0.6 + 1.2 * (i / (len(notes) - 1)))
    air = highpass(noise(len(tt), seed), 6000) * np.exp(-tt * 3) * 0.08
    out += stereo(air, 0)
    out /= np.max(np.abs(out))
    return reverb(out, IR_LONG, 0.45)


def swipe(direction=1, seed=10):
    return whoosh(0.42, 500, 3200, 1200, -0.8 * direction, 0.8 * direction, seed)


def final_hit(seed=12):
    tt = t_axis(4.5)
    imp = impact(4.5, seed, 0.9)
    chord = np.zeros((2, len(tt)))
    for i, m in enumerate([50, 57, 62, 64, 69, 74]):  # D A D E A D: open, resolved
        f = midi(m)
        y = (saw(f, tt) * 0.4 + np.sin(2 * np.pi * f * tt)) * np.exp(-tt * 0.9)
        chord += stereo(lowpass(y, 3200), -0.5 + i * 0.2)
    chord /= np.max(np.abs(chord))
    out = imp * 0.8 + reverb(chord, IR_LONG, 0.4) * 0.5
    return out / np.max(np.abs(out))


def soft_ping(seed=14):
    """A muted notification blip for the intro's pile of viral posts."""
    tt = t_axis(0.35)
    y = (np.sin(2 * np.pi * 1320 * tt) * np.exp(-tt * 18) + 0.6 * np.sin(2 * np.pi * 1760 * tt) * np.exp(-np.clip(tt - 0.07, 0, None) * 18) * (tt > 0.07))
    y /= np.max(np.abs(y))
    return reverb(stereo(lowpass(y, 5000), 0), IR_SHORT, 0.3)


def tape_stop(dur=0.9, seed=15):
    """The wave passing: a falling tone that slows down."""
    tt = t_axis(dur)
    k = tt / dur
    f = 420 * (60 / 420) ** (k ** 0.8)
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = (np.sin(ph) + 0.3 * np.sin(2 * ph)) * (1 - k) ** 1.2
    y = lowpass(y, 2500)
    y /= np.max(np.abs(y))
    return reverb(stereo(y, 0), IR_LONG, 0.3)


EFFECTS = {
    'whoosh': lambda: whoosh(0.6),
    'whoosh-long': lambda: whoosh(1.0, 250, 2200, 500, -0.9, 0.9, 21),
    'whoosh-back': lambda: whoosh(0.6, 350, 2600, 700, 0.7, -0.7, 22),
    'swipe-right': lambda: swipe(1, 23),
    'swipe-left': lambda: swipe(-1, 24),
    'pop': lambda: pop(820),
    'pop-high': lambda: pop(1150, seed=25),
    'pop-low': lambda: pop(560, seed=26),
    'tick': lambda: tick(),
    'click': lambda: click(),
    'clock': lambda: clock_tick(True),
    'clock-low': lambda: clock_tick(False),
    'ping': lambda: soft_ping(),
    'riser': lambda: riser(1.6),
    'riser-short': lambda: riser(0.9, 27),
    'impact': lambda: impact(1.8),
    'impact-soft': lambda: impact(1.4, 28, 0.25),
    'shimmer': lambda: shimmer(2.6),
    'tape-stop': lambda: tape_stop(),
    'final-hit': lambda: final_hit(),
}

# Level of each effect relative to full scale, before the stem gain (the mix sits them 10–18 dB
# under the voice; quieter for the small UI sounds).
LEVELS = {
    'whoosh': 0.3, 'whoosh-long': 0.26, 'whoosh-back': 0.3,
    'swipe-right': 0.34, 'swipe-left': 0.34,
    'pop': 0.2, 'pop-high': 0.18, 'pop-low': 0.22,
    'tick': 0.14, 'click': 0.2, 'clock': 0.22, 'clock-low': 0.2, 'ping': 0.16,
    'riser': 0.2, 'riser-short': 0.18,
    'impact': 0.12, 'impact-soft': 0.13,
    'shimmer': 0.2, 'tape-stop': 0.14, 'final-hit': 0.12,
}
