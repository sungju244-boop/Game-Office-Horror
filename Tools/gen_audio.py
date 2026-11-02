#!/usr/bin/env python3
"""
야간 평가실 사운드 생성기 (개발 도구). 모든 음악·환경음·효과음을 코드로 합성해
Assets/Resources/Audio/*.wav 로 저장한다. 외부 음원은 쓰지 않는다.

원칙: 점프스케어용 큰 소리 없음. 모든 클립 피크 ≤ -3 dBFS, 대부분 -6 dBFS 이하.
사용: python3 Tools/gen_audio.py
필요: numpy, scipy
"""
import os
import sys
import wave

import numpy as np
from scipy import signal

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "Assets", "Resources", "Audio")
rng = np.random.default_rng(117)
REPORT = []


# ---------- 기본 도구 ----------

def t_axis(dur, sr):
    return np.arange(int(dur * sr)) / sr


def noise(n):
    return rng.standard_normal(n)


def pink(n):
    # Voss 근사: 백색잡음에 1/f 필터
    b = [0.049922035, -0.095993537, 0.050612699, -0.004408786]
    a = [1, -2.494956002, 2.017265875, -0.522189400]
    return signal.lfilter(b, a, noise(n)) * 3.5


def brown(n):
    x = np.cumsum(noise(n))
    x = signal.lfilter([1, -1], [1, -0.995], x)
    return x / (np.max(np.abs(x)) + 1e-9)


def lp(x, sr, f, order=4):
    sos = signal.butter(order, min(f, sr * 0.45), "low", fs=sr, output="sos")
    return signal.sosfilt(sos, x)


def hp(x, sr, f, order=2):
    sos = signal.butter(order, f, "high", fs=sr, output="sos")
    return signal.sosfilt(sos, x)


def bp(x, sr, lo, hi, order=2):
    sos = signal.butter(order, [lo, min(hi, sr * 0.45)], "band", fs=sr, output="sos")
    return signal.sosfilt(sos, x)


def env_ad(n, sr, attack, decay):
    a = int(attack * sr)
    e = np.ones(n)
    if a > 0:
        e[:a] = np.linspace(0, 1, a)
    t = np.arange(n - a) / sr
    e[a:] = np.exp(-t / max(decay, 1e-4))
    return e


def fade(x, sr, fin=0.005, fout=0.02):
    n = len(x)
    a, b = int(fin * sr), int(fout * sr)
    if a > 0:
        x[:a] *= np.linspace(0, 1, a)
    if b > 0:
        x[n - b:] *= np.linspace(1, 0, b)
    return x


def reverb(x, sr, size=1.0, mix=0.3, damp=0.4):
    """Schroeder 리버브 (콤 4 + 올패스 2)."""
    combs = [0.0297, 0.0371, 0.0411, 0.0437]
    out = np.zeros(len(x))
    for c in combs:
        d = max(1, int(c * size * sr))
        g = 0.84 - damp * 0.1
        a = np.zeros(d + 1)
        a[0], a[d] = 1.0, -g
        out += signal.lfilter([1.0], a, x)
    out /= len(combs)
    for c, g in ((0.005, 0.7), (0.0017, 0.7)):
        d = max(1, int(c * size * sr))
        b = np.zeros(d + 1)
        a = np.zeros(d + 1)
        b[0], b[d] = -g, 1.0
        a[0], a[d] = 1.0, -g
        out = signal.lfilter(b, a, out)
    out = lp(out, sr, 6000 - damp * 3000, 2)
    return x * (1 - mix) + out * mix


def loopify(x, sr, xfade=1.5):
    """끝과 처음을 겹쳐 이음새 없는 반복으로 만든다. x 는 목표 길이 + xfade 만큼 만들어 둔다."""
    n = int(xfade * sr)
    body = x[:-n].copy()
    tail = x[-n:]
    w = np.linspace(0, np.pi / 2, n)
    body[:n] = body[:n] * np.sin(w) + tail * np.cos(w)
    return body


def save(name, x, sr, peak_db=-6.0, loop=False):
    x = np.asarray(x, dtype=float)
    x -= np.mean(x)
    m = np.max(np.abs(x)) + 1e-12
    x = x / m * (10 ** (peak_db / 20.0))
    if not loop:
        x = fade(x, sr, 0.002, 0.01)
    pcm = np.clip(x * 32767, -32768, 32767).astype(np.int16)
    os.makedirs(OUT, exist_ok=True)
    with wave.open(os.path.join(OUT, name + ".wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())
    peak = 20 * np.log10(np.max(np.abs(pcm)) / 32767 + 1e-12)
    rms = 20 * np.log10(np.sqrt(np.mean((pcm / 32767.0) ** 2)) + 1e-12)
    seam = abs(int(pcm[0]) - int(pcm[-1])) / 32767 if loop else 0.0
    REPORT.append((name, len(pcm) / sr, sr, peak, rms, seam))


def osc_saw(f, t):
    return 2 * ((f * t) % 1.0) - 1


def fm_bell(freq, dur, sr, ratio=3.5, index=2.5, decay=1.2):
    t = t_axis(dur, sr)
    mod = np.sin(2 * np.pi * freq * ratio * t) * index * np.exp(-t / (decay * 0.5))
    return np.sin(2 * np.pi * freq * t + mod) * np.exp(-t / decay)


def epiano(freq, dur, sr):
    t = t_axis(dur, sr)
    x = np.sin(2 * np.pi * freq * t + 0.8 * np.sin(2 * np.pi * freq * t) * np.exp(-t * 3))
    x += 0.25 * np.sin(2 * np.pi * freq * 2 * t) * np.exp(-t * 2)
    return x * env_ad(len(t), sr, 0.004, dur * 0.35)


# ---------- 환경음 ----------

def amb_hum():
    sr, L = 22050, 8.0
    t = t_axis(L + 1.5, sr)
    x = 0.6 * np.sin(2 * np.pi * 120 * t) + 0.3 * np.sin(2 * np.pi * 240 * t) + 0.15 * np.sin(2 * np.pi * 360 * t)
    buzz = bp(noise(len(t)), sr, 2500, 6000) * (0.5 + 0.5 * np.sin(2 * np.pi * 120 * t)) * 0.08
    wob = 1 + 0.08 * np.sin(2 * np.pi * 0.13 * t)
    save("amb_hum", loopify((x + buzz) * wob, sr), sr, -10, True)


def amb_fan():
    sr, L = 22050, 6.0
    t = t_axis(L + 1.5, sr)
    air = lp(pink(len(t)), sr, 900) * 0.8
    motor = 0.25 * np.sin(2 * np.pi * (86 + 1.5 * np.sin(2 * np.pi * 0.3 * t)) * t)
    save("amb_fan", loopify(air + motor, sr), sr, -12, True)


def amb_crt():
    sr, L = 44100, 6.0
    t = t_axis(L + 1.5, sr)
    whine = 0.08 * np.sin(2 * np.pi * 7850 * t)
    hum = 0.25 * np.sin(2 * np.pi * 60 * t)
    crackle = (rng.random(len(t)) < 0.0015) * noise(len(t)) * 0.9
    crackle = bp(crackle, sr, 1500, 9000)
    stat = bp(noise(len(t)), sr, 3000, 9000) * 0.05
    save("amb_crt", loopify(whine + hum + crackle + stat, sr), sr, -14, True)


def amb_room():
    sr, L = 22050, 12.0
    t = t_axis(L + 2.0, sr)
    x = lp(brown(len(t)), sr, 220) * (0.7 + 0.3 * np.sin(2 * np.pi * 0.05 * t))
    save("amb_room", loopify(x, sr, 2.0), sr, -14, True)


def amb_draft():
    sr, L = 22050, 9.0
    t = t_axis(L + 2.0, sr)
    w = bp(noise(len(t)), sr, 250, 1400) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.11 * t) ** 2)
    whistle = 0.06 * np.sin(2 * np.pi * (620 + 40 * np.sin(2 * np.pi * 0.2 * t)) * t) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.07 * t))
    save("amb_draft", loopify(w + whistle, sr, 2.0), sr, -12, True)


# ---------- 음악 ----------

D2, A2, D3, F3, A3, C4, D4, E4, F4, G4, A4, AS3 = 73.42, 110.0, 146.83, 174.61, 220.0, 261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 233.08


def mus_drone():
    sr, L = 32000, 48.0
    t = t_axis(L + 3.0, sr)
    n = len(t)
    x = np.zeros(n)
    for f, a, det in ((D2, 0.5, 0.15), (A2, 0.3, 0.2), (D3, 0.18, 0.25), (F3, 0.10, 0.3)):
        x += a * (osc_saw(f, t) + osc_saw(f + det, t)) * 0.5
    # 천천히 열리고 닫히는 필터
    cutoff = 260 + 180 * (0.5 + 0.5 * np.sin(2 * np.pi * t / 24.0))
    chunks = []
    step = sr // 4
    zi = None
    sos_cache = {}
    y = np.zeros(n)
    for i in range(0, n, step):
        fc = int(cutoff[i] // 10) * 10
        if fc not in sos_cache:
            sos_cache[fc] = signal.butter(2, fc, "low", fs=sr, output="sos")
        sos = sos_cache[fc]
        if zi is None:
            zi = np.zeros((sos.shape[0], 2))
        y[i:i + step], zi = signal.sosfilt(sos, x[i:i + step], zi=zi)
    # 아주 드문 유리 같은 음 (불협)
    for start, f in ((9.0, 587.33 * 1.06), (26.5, 830.6), (40.0, 622.25)):
        b = fm_bell(f, 6.0, sr, 2.76, 1.5, 2.5) * 0.08
        s0 = int(start * sr)
        y[s0:s0 + len(b)] += b[: max(0, min(len(b), n - s0))]
    y = reverb(y, sr, 2.2, 0.35, 0.6)
    save("mus_drone", loopify(y, sr, 3.0), sr, -8, True)


def mus_tension():
    sr, L = 32000, 32.0
    t = t_axis(L + 3.0, sr)
    n = len(t)
    x = np.zeros(n)
    for f, a in ((D3, 0.3), (D3 * 1.059, 0.22), (A3 * 1.414 / 1.5, 0.15), (D4 * 1.03, 0.08)):
        x += a * np.sin(2 * np.pi * f * t + 0.3 * np.sin(2 * np.pi * 0.21 * t))
    x *= 0.65 + 0.35 * np.sin(2 * np.pi * 0.09 * t)
    # 느린 심장 박동 (작게)
    beat = np.zeros(n)
    period = 1.55
    k = 0.0
    while k < L + 3.0:
        for off, amp in ((0.0, 1.0), (0.28, 0.6)):
            s0 = int((k + off) * sr)
            th = np.sin(2 * np.pi * 52 * t_axis(0.25, sr)) * env_ad(int(0.25 * sr), sr, 0.005, 0.07) * amp
            beat[s0:s0 + len(th)] += th[: max(0, min(len(th), n - s0))]
        k += period
    y = lp(x, sr, 1500) + beat * 0.35
    y = reverb(y, sr, 1.6, 0.3, 0.5)
    save("mus_tension", loopify(y, sr, 3.0), sr, -9, True)


def mus_title():
    sr, L = 32000, 40.0
    t = t_axis(L + 4.0, sr)
    n = len(t)
    pad = np.zeros(n)
    for f, a in ((D2, 0.35), (A2, 0.2), (F3, 0.08)):
        pad += a * np.sin(2 * np.pi * f * t)
    pad = lp(pad, sr, 400) * (0.7 + 0.3 * np.sin(2 * np.pi * t / 20))
    mel = np.zeros(n)
    notes = [(0.5, A4), (3.0, F4), (5.5, E4), (8.0, D4), (12.0, A4), (14.5, AS3 * 2), (17.0, A4), (19.5, E4),
             (24.0, F4), (26.5, E4), (29.0, D4), (31.5, C4), (34.0, D4)]
    for start, f in notes:
        b = epiano(f, 4.0, sr) * 0.3
        s0 = int(start * sr)
        mel[s0:s0 + len(b)] += b[: max(0, min(len(b), n - s0))]
    y = pad + reverb(mel, sr, 2.5, 0.5, 0.5)
    save("mus_title", loopify(y, sr, 4.0), sr, -8, True)


def mus_chase():
    sr, L = 32000, 24.0
    bpm = 132.0
    t = t_axis(L + 2.0, sr)
    n = len(t)
    y = np.zeros(n)
    eighth = 60.0 / bpm / 2
    pattern = [D2, D2, D2 * 2, D2, F3 / 2, D2, A2 / 2 * 2, D2]
    k = 0
    tt = 0.0
    while tt < L + 2.0:
        f = pattern[k % len(pattern)]
        seg = t_axis(eighth * 0.9, sr)
        s = (osc_saw(f, seg) * 0.6 + np.sin(2 * np.pi * f * seg) * 0.5) * env_ad(len(seg), sr, 0.004, 0.12)
        s = lp(s, sr, 700)
        s0 = int(tt * sr)
        y[s0:s0 + len(s)] += s[: max(0, min(len(s), n - s0))]
        # 작은 틱
        tick = bp(noise(int(0.02 * sr)), sr, 5000, 9000) * env_ad(int(0.02 * sr), sr, 0.001, 0.006) * (0.25 if k % 2 else 0.12)
        y[s0:s0 + len(tick)] += tick[: max(0, min(len(tick), n - s0))]
        tt += eighth
        k += 1
    rise = np.sin(2 * np.pi * (D4 + 60 * (t % 6.0) / 6.0) * t) * 0.06 * ((t % 6.0) / 6.0)
    y += rise
    y = reverb(y, sr, 1.0, 0.15, 0.4)
    save("mus_chase", loopify(y, sr, 2.0), sr, -8, True)


def mus_ending():
    sr = 32000
    dur = 22.0
    t = t_axis(dur, sr)
    n = len(t)
    y = np.zeros(n)
    for start, f, a in ((0.5, D4, 0.3), (3.5, A3, 0.25), (6.5, F4, 0.22), (9.5, E4, 0.2), (13.0, D4, 0.18), (13.0, A3, 0.12)):
        b = epiano(f, 7.0, sr) * a
        s0 = int(start * sr)
        y[s0:s0 + len(b)] += b[: max(0, min(len(b), n - s0))]
    y += lp(np.sin(2 * np.pi * D2 * t) * 0.12, sr, 300) * np.linspace(1, 0, n)
    y = reverb(y, sr, 2.8, 0.55, 0.5)
    y *= np.linspace(1, 0, n) ** 0.5
    save("mus_ending", y, sr, -9)


# ---------- 효과음 ----------

SR = 44100


def steps():
    for i in range(1, 5):
        n = int(0.16 * SR)
        thump = lp(noise(n), SR, 380 + i * 30) * env_ad(n, SR, 0.006, 0.035)
        shh = bp(noise(n), SR, 1500, 4000) * env_ad(n, SR, 0.002, 0.02) * 0.15
        save("sfx_step_carpet_%d" % i, thump + shh, SR, -9)
        tick = bp(noise(n), SR, 1800, 5000) * env_ad(n, SR, 0.001, 0.012) * 0.6
        body = lp(noise(n), SR, 900) * env_ad(n, SR, 0.002, 0.03)
        save("sfx_step_tile_%d" % i, tick + body, SR, -8)


def ui():
    n = int(0.012 * SR)
    save("sfx_click", bp(noise(n), SR, 2000, 7000) * env_ad(n, SR, 0.0005, 0.003), SR, -12)
    t = t_axis(0.03, SR)
    save("sfx_blip", np.sign(np.sin(2 * np.pi * 1760 * t)) * env_ad(len(t), SR, 0.001, 0.008) * 0.5, SR, -20)
    t = t_axis(0.04, SR)
    save("sfx_ui_hover", np.sin(2 * np.pi * 980 * t) * env_ad(len(t), SR, 0.001, 0.012), SR, -16)
    t = t_axis(0.16, SR)
    sel = np.sin(2 * np.pi * np.where(t < 0.06, 660, 990) * t) * env_ad(len(t), SR, 0.002, 0.06)
    save("sfx_ui_select", sel, SR, -12)
    t = t_axis(0.15, SR)
    save("sfx_beep", np.sin(2 * np.pi * 1000 * t) * env_ad(len(t), SR, 0.003, 0.1), SR, -14)
    one = np.sin(2 * np.pi * 1200 * t_axis(0.09, SR)) * env_ad(int(0.09 * SR), SR, 0.002, 0.05)
    gap = np.zeros(int(0.07 * SR))
    save("sfx_beep_new", np.concatenate([one, gap, one, gap, one * 0.8]), SR, -12)
    t = t_axis(0.12, SR)
    save("sfx_check", lp(np.sin(2 * np.pi * 330 * t) * env_ad(len(t), SR, 0.003, 0.05), SR, 1200), SR, -18)


def statics():
    for i, dur in ((1, 0.18), (2, 0.32), (3, 0.5)):
        n = int(dur * SR)
        x = bp(noise(n), SR, 800, 9000)
        x *= (rng.random(n) < 0.35) * 0.6 + 0.4
        gate = np.repeat(rng.random(int(dur * 60) + 1) > 0.3, int(SR / 60) + 1)[:n]
        x *= gate * env_ad(n, SR, 0.002, dur * 0.6)
        save("sfx_static_%d" % i, x, SR, -12)


def creak(dur, base, sr=SR):
    n = int(dur * sr)
    t = np.arange(n) / sr
    rate = base * (1 + 0.6 * np.sin(2 * np.pi * 0.7 * t + 1.3) + 0.3 * np.sin(2 * np.pi * 2.3 * t))
    phase = np.cumsum(rate) / sr
    pulses = (np.diff(np.floor(phase), prepend=0) > 0).astype(float)
    x = signal.lfilter([1], [1, -0.97], pulses)
    res = bp(x, sr, 500, 2600) + 0.4 * bp(x, sr, 180, 400)
    return res * (0.4 + 0.6 * np.sin(np.pi * t / dur) ** 0.5)


def doors():
    save("sfx_door_creak", reverb(creak(2.6, 55), SR, 1.2, 0.25), SR, -8)
    latch = bp(noise(int(0.05 * SR)), SR, 1500, 6000) * env_ad(int(0.05 * SR), SR, 0.001, 0.01)
    op = np.concatenate([latch, creak(1.0, 80) * 0.6])
    save("sfx_door_open", reverb(op, SR, 1.0, 0.2), SR, -8)
    thud = lp(noise(int(0.4 * SR)), SR, 220) * env_ad(int(0.4 * SR), SR, 0.003, 0.09)
    cl = thud + np.concatenate([np.zeros(int(0.05 * SR)), latch, np.zeros(int(0.4 * SR) - int(0.05 * SR) - len(latch))])
    save("sfx_door_close", reverb(cl, SR, 1.0, 0.2), SR, -8)
    rattle = np.zeros(int(0.7 * SR))
    for k in (0.0, 0.12, 0.2, 0.36):
        s0 = int(k * SR)
        c = bp(noise(int(0.04 * SR)), SR, 900, 4000) * env_ad(int(0.04 * SR), SR, 0.001, 0.012)
        rattle[s0:s0 + len(c)] += c
    save("sfx_door_locked", rattle, SR, -10)
    clunk = lp(noise(int(0.3 * SR)), SR, 300) * env_ad(int(0.3 * SR), SR, 0.002, 0.05)
    click = bp(noise(int(0.03 * SR)), SR, 2500, 8000) * env_ad(int(0.03 * SR), SR, 0.0005, 0.006)
    beep_t = t_axis(0.18, SR)
    beep_low = np.sin(2 * np.pi * 520 * beep_t) * env_ad(len(beep_t), SR, 0.002, 0.12) * 0.4
    lock = np.zeros(int(0.7 * SR))
    lock[:len(clunk)] += clunk
    lock[int(0.02 * SR):int(0.02 * SR) + len(click)] += click * 0.8
    lock[int(0.3 * SR):int(0.3 * SR) + len(beep_low)] += beep_low
    save("sfx_lock", reverb(lock, SR, 0.8, 0.2), SR, -7)
    beep_up = np.sin(2 * np.pi * (700 + 500 * beep_t / 0.18) * beep_t) * env_ad(len(beep_t), SR, 0.002, 0.12) * 0.4
    un = np.zeros(int(0.6 * SR))
    un[:len(click)] += click
    un[int(0.15 * SR):int(0.15 * SR) + len(beep_up)] += beep_up
    save("sfx_unlock", un, SR, -9)
    # 서랍: 금속이 미끄러지는 소리
    n = int(0.9 * SR)
    slide = bp(noise(n), SR, 400, 3000) * np.linspace(0.3, 1, n) * (np.arange(n) < int(0.65 * SR))
    stop = lp(noise(int(0.2 * SR)), SR, 400) * env_ad(int(0.2 * SR), SR, 0.002, 0.04)
    dr = slide.copy()
    dr[int(0.62 * SR):int(0.62 * SR) + len(stop)] += stop * 1.5
    save("sfx_drawer", reverb(dr, SR, 1.0, 0.25), SR, -8)


def windows():
    n = int(1.3 * SR)
    x = np.zeros(n)
    for k in range(9):
        s0 = int(rng.uniform(0, 1.1) * SR)
        c = bp(noise(int(0.05 * SR)), SR, 700, 3000) * env_ad(int(0.05 * SR), SR, 0.001, 0.015)
        x[s0:s0 + len(c)] += c * rng.uniform(0.4, 1.0)
    glass = sum(np.sin(2 * np.pi * f * np.arange(n) / SR) for f in (2210, 3330, 4790)) * env_ad(n, SR, 0.01, 0.3) * 0.05
    save("sfx_window", reverb(x + glass, SR, 1.2, 0.25), SR, -8)


def phone():
    sr = SR
    ring_t = t_axis(2.0, sr)
    trill = (np.sin(2 * np.pi * 440 * ring_t) + np.sin(2 * np.pi * 480 * ring_t)) * (np.sin(2 * np.pi * 20 * ring_t) > 0)
    trill = lp(trill, sr, 2500) * fade(np.ones(len(ring_t)), sr, 0.01, 0.05)
    x = np.concatenate([trill, np.zeros(int(4.0 * sr))])
    save("sfx_phone", reverb(x, sr, 1.0, 0.2), sr, -9, True)


def radio():
    sr = SR
    n = int(2.6 * sr)
    stat = bp(noise(n), sr, 400, 3500) * 0.5
    t = np.arange(n) / sr
    voice = np.zeros(n)
    k = 0.3
    while k < 2.2:
        seg = int(rng.uniform(0.08, 0.22) * sr)
        s0 = int(k * sr)
        f0 = rng.uniform(110, 160)
        tt = np.arange(seg) / sr
        src = signal.sawtooth(2 * np.pi * f0 * tt)
        v = bp(src, sr, 500, 1200) + 0.5 * bp(src, sr, 1500, 2600)
        voice[s0:s0 + seg] += v * env_ad(seg, sr, 0.01, 0.06)
        k += rng.uniform(0.12, 0.3)
    save("sfx_radio", bp(stat + voice * 1.2, sr, 300, 3400), sr, -10)


def elevator():
    b = fm_bell(1046.5, 2.5, SR, 2.0, 1.2, 0.9) + 0.6 * fm_bell(784.0, 2.5, SR, 2.0, 1.0, 0.9)
    b = np.concatenate([np.zeros(0), b])
    save("sfx_elevator", reverb(lp(b, SR, 3000), SR, 2.0, 0.45), SR, -12)


def footsteps_far():
    sr = SR
    total = 5.6
    n = int(total * sr)
    x = np.zeros(n)
    k = 0.0
    i = 0
    while k < 5.0:
        amp = 0.3 + 0.7 * (k / 5.0)
        m = int(0.18 * sr)
        st = (bp(noise(m), sr, 1500, 4500) * env_ad(m, sr, 0.001, 0.012) * 0.6 + lp(noise(m), sr, 700) * env_ad(m, sr, 0.002, 0.03)) * amp
        s0 = int(k * sr)
        x[s0:s0 + m] += st
        k += 0.58 + rng.uniform(-0.03, 0.03)
        i += 1
    x = lp(x, sr, 2500)
    save("sfx_footsteps_far", reverb(x, sr, 1.8, 0.4), sr, -10)


def power():
    sr = SR
    t = t_axis(1.8, sr)
    f = 120 * np.exp(-t * 1.6)
    ph = 2 * np.pi * np.cumsum(f) / sr
    down = (np.sin(ph) + 0.3 * np.sin(2 * ph)) * np.exp(-t * 1.3)
    relay = bp(noise(int(0.04 * sr)), sr, 1000, 5000) * env_ad(int(0.04 * sr), sr, 0.0005, 0.01)
    x = down.copy()
    x[:len(relay)] += relay * 1.5
    save("sfx_power_down", reverb(x, sr, 1.5, 0.3), sr, -8)
    t2 = t_axis(0.9, sr)
    thunk = lp(noise(len(t2)), sr, 200) * env_ad(len(t2), sr, 0.002, 0.06)
    whine = np.sin(2 * np.pi * (2000 + 5500 * (t2 / 0.9)) * t2) * env_ad(len(t2), sr, 0.08, 0.4) * 0.15
    save("sfx_crt_on", thunk + whine, sr, -10)
    t3 = t_axis(0.45, sr)
    zap = np.sin(2 * np.pi * (3000 * np.exp(-t3 * 8)) * t3) * env_ad(len(t3), sr, 0.001, 0.12)
    save("sfx_crt_off", zap + lp(noise(len(t3)), sr, 300) * env_ad(len(t3), sr, 0.001, 0.05) * 0.5, sr, -11)
    t4 = t_axis(0.7, sr)
    servo = signal.sawtooth(2 * np.pi * (180 + 40 * np.sin(2 * np.pi * 3 * t4)) * t4) * np.sin(np.pi * t4 / 0.7)
    save("sfx_servo", bp(servo, sr, 300, 3000), sr, -14)


def cat_voice():
    """'우-이-이-아-이-오' — 포먼트 합성으로 만든 고양이 소리 (밈 원본 음원 아님)."""
    sr = SR
    vowels = {
        "u": (320, 800, 2200),
        "i": (300, 2300, 3000),
        "a": (750, 1150, 2600),
        "o": (480, 850, 2500),
    }
    seq = [("u", 0.20, 520), ("i", 0.13, 700), ("i", 0.13, 640), ("a", 0.22, 600), ("i", 0.14, 760), ("o", 0.30, 540)]
    total = sum(d for _, d, _ in seq) + 0.35
    n = int(total * sr)
    # 피치 곡선 (부드럽게 이어짐)
    pitch = np.zeros(n)
    f1 = np.zeros(n)
    f2 = np.zeros(n)
    f3 = np.zeros(n)
    amp = np.zeros(n)
    pos = 0
    prev = None
    for v, d, p in seq:
        m = int(d * sr)
        tgt = vowels[v]
        start = prev if prev is not None else (tgt[0], tgt[1], tgt[2], p)
        g = np.clip(np.arange(m) / (0.05 * sr), 0, 1)
        pitch[pos:pos + m] = start[3] + (p - start[3]) * g + 30 * np.sin(np.linspace(0, np.pi, m))
        f1[pos:pos + m] = start[0] + (tgt[0] - start[0]) * g
        f2[pos:pos + m] = start[1] + (tgt[1] - start[1]) * g
        f3[pos:pos + m] = start[2] + (tgt[2] - start[2]) * g
        amp[pos:pos + m] = 1.0
        prev = (tgt[0], tgt[1], tgt[2], p)
        pos += m
    amp = signal.lfilter([0.003], [1, -0.997], amp) * 1.0
    amp /= amp.max() + 1e-9
    phase = 2 * np.pi * np.cumsum(pitch) / sr
    src = signal.sawtooth(phase) * 0.6 + np.sin(phase) * 0.4
    src += noise(n) * 0.04
    out = np.zeros(n)
    blk = 512
    for i in range(0, n, blk):
        seg = src[i:i + blk]
        acc = np.zeros(len(seg))
        for F, bw, g in ((f1[i], 90, 1.0), (f2[i], 130, 0.6), (f3[i], 200, 0.25)):
            lo, hi = max(60, F - bw), min(sr * 0.45, F + bw)
            sos = signal.butter(2, [lo, hi], "band", fs=sr, output="sos")
            acc += signal.sosfilt(sos, seg) * g
        out[i:i + blk] = acc
    out *= amp
    out = reverb(out, sr, 0.8, 0.15)
    save("sfx_cat", out, sr, -6, True)


def catch():
    sr = SR
    n = int(1.2 * sr)
    x = lp(noise(n), sr, 160) * env_ad(n, sr, 0.01, 0.25)
    x += np.sin(2 * np.pi * 55 * np.arange(n) / sr) * env_ad(n, sr, 0.01, 0.5) * 0.4
    save("sfx_catch", reverb(x, sr, 1.5, 0.35), sr, -12)


def main():
    print("오디오 생성 →", OUT)
    amb_hum(); amb_fan(); amb_crt(); amb_room(); amb_draft()
    mus_drone(); mus_tension(); mus_title(); mus_chase(); mus_ending()
    steps(); ui(); statics(); doors(); windows(); phone(); radio(); elevator(); footsteps_far(); power(); cat_voice(); catch()
    print("%-22s %6s %6s %7s %7s %6s" % ("이름", "초", "Hz", "피크dB", "RMSdB", "이음새"))
    bad = 0
    for name, dur, sr, peak, rms, seam in REPORT:
        flag = "" if peak <= -3.0 else "  ← 너무 큼"
        if peak > -3.0:
            bad += 1
        print("%-22s %6.2f %6d %7.1f %7.1f %6.3f%s" % (name, dur, sr, peak, rms, seam, flag))
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT) if f.endswith(".wav"))
    print("파일 %d개, 합계 %.1f MB, 피크 초과 %d개" % (len(REPORT), total / 1e6, bad))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
