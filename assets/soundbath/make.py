#!/usr/bin/env python3
"""Render the /37 soundbath loop: warm drone + gong strikes, seamless 90s loop.

Usage:  python3 make.py            -> soundbath.wav (then encode:)
        afconvert -f m4af -d aac -b 96000 soundbath.wav ../../static/37/soundbath.m4a

Stdlib only (wave, math, random). Deterministic (seeded) so re-renders are stable.
"""
import math
import random
import struct
import wave

SR = 44100
LOOP = 90.0          # final loop length, seconds
XFADE = 2.0          # tail-into-head crossfade for a seamless loop
FADE_IN = 1.5        # gentle rise at the loop point (reads as a breath)
PEAK = 0.7

random.seed(37)

N = int(SR * (LOOP + XFADE))

# ---- drone: detuned sines with slow independent swells ----
DRONE = [
    # freq, gain, lfo period s, lfo depth
    (110.00, .200, 23.0, .35),
    (110.70, .170, 31.0, .35),
    (164.81, .090, 27.0, .45),
    (220.00, .070, 19.0, .45),
    (329.63, .050, 37.0, .55),
    (440.00, .035, 29.0, .55),
]

# ---- gongs: strike times across the render ----
strikes = []
t = 1.0                       # a gong lands just after the loop point, masking the seam
while t < LOOP + XFADE - 1:
    base = random.choice([98.0, 110.0, 123.5]) * (2 if random.random() < .35 else 1)
    strikes.append((t, base))
    t += 8.0 + random.random() * 6.0

GONG_PARTIALS = [(1.0, .50), (2.76, .22), (5.40, .11), (8.93, .045)]
GONG_TAU = 2.6                # exponential decay constant, seconds
GONG_LEN = 9.0

def render_channel(phase_seed):
    rnd = random.Random(phase_seed)
    phases = [rnd.random() * 2 * math.pi for _ in DRONE]
    gong_detune = [1 + (rnd.random() - .5) * .004 for _ in range(len(strikes) * len(GONG_PARTIALS))]
    out = [0.0] * N
    two_pi = 2 * math.pi

    for i, (f, g, lp, ld) in enumerate(DRONE):
        ph = phases[i]
        w = two_pi * f / SR
        lw = two_pi / (lp * SR)
        for n in range(N):
            out[n] += g * (1 - ld + ld * .5 * (1 + math.sin(lw * n))) * math.sin(w * n + ph)

    k = 0
    for (st, base) in strikes:
        s0 = int(st * SR)
        s1 = min(N, s0 + int(GONG_LEN * SR))
        for (m, g) in GONG_PARTIALS:
            f = base * m * gong_detune[k]
            k += 1
            w = two_pi * f / SR
            atk = int(.03 * SR)
            for n in range(s0, s1):
                dt = (n - s0) / SR
                env = (n - s0) / atk if n - s0 < atk else math.exp(-(dt - .03) / GONG_TAU)
                out[n] += g * env * math.sin(w * (n - s0))
    return out

print('rendering L...')
L = render_channel('left-37')
print('rendering R...')
R = render_channel('right-37')

# ---- seamless loop: crossfade tail into head, then trim ----
X = int(XFADE * SR)
LN = int(LOOP * SR)
for ch in (L, R):
    for n in range(X):
        wgt = n / X
        ch[n] = ch[LN + n] * (1 - wgt) + ch[n] * wgt
    del ch[LN:]

# ---- gentle rise at the loop point ----
F = int(FADE_IN * SR)
for ch in (L, R):
    for n in range(F):
        ch[n] *= n / F

# ---- normalize and write ----
peak = max(max(abs(v) for v in L), max(abs(v) for v in R))
scale = PEAK / peak
print(f'peak {peak:.3f} -> scaling by {scale:.3f}')

with wave.open('soundbath.wav', 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    frames = bytearray()
    for n in range(LN):
        frames += struct.pack('<hh',
            int(max(-1, min(1, L[n] * scale)) * 32767),
            int(max(-1, min(1, R[n] * scale)) * 32767))
    w.writeframes(bytes(frames))
print(f'wrote soundbath.wav ({LN/SR:.0f}s)')
