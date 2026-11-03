#!/usr/bin/env python3
"""
추가 사운드 생성기 (개발 도구): 괴물(숨소리·발소리·끌림·포효), 점프스케어 비명·스팅어, 심장 박동,
추격 음악, 겁쟁이 모드용 귀여운 일상 음악·추격 음악·뿅 소리, 카운트다운 틱.
gen_audio.py 의 합성 도구를 그대로 쓴다. 사용: python3 Tools/gen_audio_extra.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
from scipy import signal  # noqa: E402

import gen_audio as A  # noqa: E402
from gen_audio import bp, env_ad, fm_bell, hp, loopify, lp, noise, reverb, save, t_axis  # noqa: E402

SR = 44100
rng = np.random.default_rng(666)


def dist(x, k=3.0):
    return np.tanh(x * k) / np.tanh(k)


# ---------- 괴물 ----------

def mon_breath():
    sr, L = 22050, 5.2
    t = t_axis(L + 1.2, sr)
    n = len(t)
    ph = (t % L) / L
    # 들숨(0~0.32) · 날숨(0.36~0.8) · 멈춤
    inhale = np.clip(np.sin(np.clip(ph / 0.32, 0, 1) * np.pi), 0, 1) * (ph < 0.32)
    exhale = np.clip(np.sin(np.clip((ph - 0.36) / 0.44, 0, 1) * np.pi), 0, 1) * ((ph > 0.36) & (ph < 0.8))
    air = noise(n)
    breath_in = (bp(air, sr, 1200, 3200) * 0.6 + bp(air, sr, 450, 900) * 0.4) * inhale ** 1.5
    f0 = 52 + 6 * np.sin(2 * np.pi * 0.7 * t) + rng.normal(0, 2, n).cumsum() * 0.002
    growl = dist(signal.sawtooth(2 * np.pi * np.cumsum(f0) / sr) * 0.8, 2.5)
    growl = bp(growl, sr, 80, 900) * exhale ** 1.2
    breath_out = (bp(air, sr, 300, 1100) * 0.8 + growl * 1.4) * exhale
    crack = (rng.random(n) < 0.004) * noise(n) * exhale
    x = breath_in * 0.9 + breath_out + bp(crack, sr, 800, 4000) * 0.6
    save("mon_breath", loopify(reverb(x, sr, 0.9, 0.2), sr, 1.2), sr, -7, True)


def mon_static():
    sr, L = 22050, 4.0
    t = t_axis(L + 1.0, sr)
    n = len(t)
    x = bp(noise(n), sr, 1500, 8000) * 0.25
    gate = np.repeat(rng.random(int((L + 1) * 30) + 1) > 0.55, int(sr / 30) + 1)[:n]
    x += bp(noise(n), sr, 600, 4000) * gate * 0.8
    x += 0.15 * np.sin(2 * np.pi * 120 * t) * gate
    save("mon_static", loopify(x, sr, 1.0), sr, -12, True)


def mon_steps():
    for i in range(1, 4):
        n = int(0.7 * SR)
        t = np.arange(n) / SR
        thud = lp(noise(n), SR, 140) * env_ad(n, SR, 0.004, 0.09) * 2.5
        sub = np.sin(2 * np.pi * (48 - 10 * t) * t) * env_ad(n, SR, 0.003, 0.18)
        scrape = bp(noise(n), SR, 300 + i * 90, 1600) * env_ad(n, SR, 0.05, 0.12) * 0.5
        scrape = np.roll(scrape, int(0.06 * SR))
        clink = np.zeros(n)
        if i != 2:
            c0 = int((0.12 + 0.05 * i) * SR)
            m = int(0.05 * SR)
            clink[c0:c0 + m] = np.sin(2 * np.pi * (2400 + 300 * i) * np.arange(m) / SR) * env_ad(m, SR, 0.0005, 0.012) * 0.2
        save("mon_step_%d" % i, reverb(thud + sub + scrape + clink, SR, 1.4, 0.3), SR, -5)


def mon_drag():
    sr, L = 22050, 3.0
    t = t_axis(L + 1.0, sr)
    n = len(t)
    am = np.abs(np.sin(2 * np.pi * 0.9 * t)) ** 2 * (0.6 + 0.4 * A.lp(noise(n), sr, 3))
    x = bp(noise(n), sr, 250, 1400) * am
    save("mon_drag", loopify(x, sr, 1.0), sr, -14, True)


def mon_roar():
    sr = SR
    dur = 2.6
    t = t_axis(dur, sr)
    n = len(t)
    f = 70 + 260 * np.clip(t / 1.4, 0, 1) ** 1.6
    f = f * (1 + 0.04 * np.sin(2 * np.pi * 7 * t))
    ph = 2 * np.pi * np.cumsum(f) / sr
    src = signal.sawtooth(ph) + 0.6 * signal.sawtooth(ph * 1.5 + 0.3) + 0.4 * signal.sawtooth(ph * 0.5)
    src = dist(src * 0.7, 3)
    v = bp(src, sr, 200, 900) * 1.2 + bp(src, sr, 1100, 2600) * 0.8 + bp(noise(n), sr, 600, 3000) * 0.5
    envl = np.clip(t / 0.25, 0, 1) * np.clip((dur - t) / 0.6, 0, 1)
    save("mon_roar", reverb(v * envl, sr, 1.8, 0.35), sr, -3)


# ---------- 점프스케어 ----------

def js_shriek():
    sr = SR
    dur = 1.5
    t = t_axis(dur, sr)
    n = len(t)
    x = np.zeros(n)
    for base, det in ((880, 0), (1170, 7), (1480, -11), (620, 4)):
        f = base * (1 + 0.06 * np.sin(2 * np.pi * 11 * t)) * (1 - 0.35 * np.clip(t / 1.2, 0, 1)) + det
        x += signal.sawtooth(2 * np.pi * np.cumsum(f) / sr)
    x = dist(x * 0.5, 4)
    x = bp(x, sr, 500, 5000) + bp(noise(n), sr, 1500, 7000) * 0.7
    envl = np.minimum(1, t / 0.004) * np.exp(-np.maximum(0, t - 0.25) * 2.6)
    sub = np.sin(2 * np.pi * (55 - 20 * t) * t) * np.exp(-t * 3) * 1.5
    save("js_shriek", reverb(x * envl + sub, sr, 1.5, 0.25), sr, -1.5)


def js_stinger():
    sr = SR
    dur = 2.4
    t = t_axis(dur, sr)
    n = len(t)
    boom = np.sin(2 * np.pi * (42 - 12 * t) * t) * np.exp(-t * 1.8) * 1.3 + lp(noise(n), sr, 120) * np.exp(-t * 6)
    screech = np.zeros(n)
    for f in (1318.5, 1396.9, 1975.5, 2093.0):
        screech += np.sin(2 * np.pi * f * t + 0.4 * np.sin(2 * np.pi * 6.5 * t))
    screech = screech * np.minimum(1, t / 0.02) * np.exp(-t * 1.6) * 0.25
    save("js_stinger", reverb(boom + screech, sr, 2.0, 0.35), sr, -3)


def door_bang():
    sr = SR
    n = int(1.2 * sr)
    x = np.zeros(n)
    for k, (tt, a) in enumerate(((0.0, 1.0), (0.16, 0.8), (0.3, 1.0), (0.52, 0.7))):
        s0 = int(tt * sr)
        m = int(0.35 * sr)
        hit = lp(noise(m), sr, 260) * env_ad(m, sr, 0.002, 0.07) * 2.2 + bp(noise(m), sr, 900, 3500) * env_ad(m, sr, 0.001, 0.02)
        rattle = bp(noise(m), sr, 2000, 6000) * env_ad(m, sr, 0.01, 0.08) * 0.4
        seg = (hit + rattle) * a
        x[s0:s0 + m] += seg[: max(0, min(m, n - s0))]
    save("sfx_door_bang", reverb(x, sr, 1.3, 0.3), sr, -2)


def heartbeat():
    sr = 22050
    L = 0.55
    n = int(L * sr)
    x = np.zeros(n)
    for off, a in ((0.0, 1.0), (0.17, 0.65)):
        s0 = int(off * sr)
        m = int(0.16 * sr)
        b = np.sin(2 * np.pi * 50 * np.arange(m) / sr) * env_ad(m, sr, 0.004, 0.05) * a
        x[s0:s0 + m] += b
    save("sfx_heartbeat", lp(x, sr, 300), sr, -8, True)


def mus_hunt():
    sr, L = 32000, 19.2  # 150bpm, 12마디
    bpm = 150.0
    beat = 60.0 / bpm
    t = t_axis(L + 1.5, sr)
    n = len(t)
    y = np.zeros(n)
    k = 0
    tt = 0.0
    while tt < L + 1.5:
        s0 = int(tt * sr)
        # 킥 (매 박)
        m = int(0.3 * sr)
        tk = np.arange(m) / sr
        kick = np.sin(2 * np.pi * (110 * np.exp(-tk * 18) + 40) * tk) * np.exp(-tk * 9)
        y[s0:s0 + m] += kick[: max(0, min(m, n - s0))] * (1.0 if k % 4 in (0, 2) else 0.7)
        # 금속성 타격 (엇박)
        if k % 4 == 3 or (k % 8 == 5):
            m2 = int(0.4 * sr)
            tm = np.arange(m2) / sr
            metal = sum(np.sin(2 * np.pi * f * tm) for f in (543, 891, 1377, 2187)) * np.exp(-tm * 9) * 0.18
            s1 = int((tt + beat * 0.5) * sr)
            y[s1:s1 + m2] += metal[: max(0, min(m2, n - s1))]
        # 낮은 펄스 베이스 (16분)
        for q in range(4):
            s2 = int((tt + q * beat / 4) * sr)
            m3 = int(beat / 4 * 0.85 * sr)
            tb = np.arange(m3) / sr
            f = 41.2 if (k // 8) % 2 == 0 else 43.65
            b = dist(signal.sawtooth(2 * np.pi * f * tb) * 0.8, 2) * env_ad(m3, sr, 0.003, 0.06)
            y[s2:s2 + m3] += lp(b, sr, 420)[: max(0, min(m3, n - s2))] * 0.45
        tt += beat
        k += 1
    siren = np.sin(2 * np.pi * (620 + 180 * np.sin(2 * np.pi * t / (beat * 8))) * t) * 0.05
    y += siren + bp(noise(n), sr, 3000, 9000) * 0.02
    save("mus_hunt", loopify(reverb(y, sr, 1.0, 0.18), sr, 1.5), sr, -5, True)


# ---------- 겁쟁이 모드 (귀엽고 밝은 일상) ----------

def marimba(f, dur, sr):
    t = t_axis(dur, sr)
    x = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t * 18)
    return x * np.exp(-t * 7) * np.minimum(1, t / 0.002)


def mus_cute():
    sr, L = 32000, 32.0  # 120bpm, 16마디
    bpm = 120.0
    beat = 60.0 / bpm
    t = t_axis(L + 2.0, sr)
    n = len(t)
    y = np.zeros(n)
    C4, D4, E4, F4, G4, A4, B4, C5, D5, E5 = 261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25, 587.33, 659.25
    prog = [(C4, E4, G4), (A4 / 2, C4, E4), (F4 / 2, A4 / 2, C4), (G4 / 2, B4 / 2, D4)]
    melody = [E5, D5, C5, D5, E5, E5, E5, 0, D5, D5, D5, 0, E5, G4 * 2, G4 * 2, 0,
              E5, D5, C5, D5, E5, E5, E5, C5, D5, D5, E5, D5, C5, 0, 0, 0]
    for bar in range(int((L + 2.0) / (beat * 4)) + 1):
        chord = prog[bar % 4]
        for q in range(4):
            s0 = int((bar * 4 + q) * beat * sr)
            # 베이스 (근음-5음)
            f = chord[0] / 2 if q % 2 == 0 else chord[2] / 2
            m = int(beat * 0.9 * sr)
            tb = np.arange(m) / sr
            bass = np.sin(2 * np.pi * f * tb) * np.exp(-tb * 4)
            y[s0:s0 + m] += bass[: max(0, min(m, n - s0))] * 0.5
            # 반주 화음 (엇박 콩콩)
            s1 = int(((bar * 4 + q) + 0.5) * beat * sr)
            for cf in chord:
                ch = marimba(cf, 0.3, sr) * 0.12
                y[s1:s1 + len(ch)] += ch[: max(0, min(len(ch), n - s1))]
            # 부드러운 킥/셰이커
            if q in (0, 2):
                mk = int(0.15 * sr)
                tk = np.arange(mk) / sr
                kick = np.sin(2 * np.pi * (90 * np.exp(-tk * 25) + 50) * tk) * np.exp(-tk * 18) * 0.35
                y[s0:s0 + mk] += kick[: max(0, min(mk, n - s0))]
            ms = int(0.05 * sr)
            sh = bp(noise(ms), sr, 6000, 10000) * env_ad(ms, sr, 0.002, 0.015) * 0.12
            y[s1:s1 + ms] += sh[: max(0, min(ms, n - s1))]
        # 멜로디 (8분음표 2개씩)
        for e in range(8):
            note = melody[(bar % 4) * 8 + e]
            if not note:
                continue
            s2 = int((bar * 4 + e * 0.5) * beat * sr)
            mm = marimba(note, 0.45, sr) * 0.4
            y[s2:s2 + len(mm)] += mm[: max(0, min(len(mm), n - s2))]
    save("mus_cute", loopify(reverb(y, sr, 0.8, 0.15), sr, 2.0), sr, -9, True)


def mus_cute_chase():
    sr, L = 32000, 12.0  # 160bpm, 8마디
    bpm = 160.0
    beat = 60.0 / bpm
    t = t_axis(L + 1.0, sr)
    n = len(t)
    y = np.zeros(n)
    scale = [523.25, 587.33, 659.25, 698.46, 783.99, 880.0, 987.77, 1046.5]
    k = 0
    while k * beat / 2 < L + 1.0:
        s0 = int(k * beat / 2 * sr)
        note = scale[(k % 16) if (k % 16) < 8 else 15 - (k % 16)]
        x = marimba(note, 0.18, sr) * 0.35
        y[s0:s0 + len(x)] += x[: max(0, min(len(x), n - s0))]
        if k % 2 == 0:
            m = int(beat * 0.45 * sr)
            tb = np.arange(m) / sr
            bf = 130.81 if (k // 8) % 2 == 0 else 146.83
            b = signal.square(2 * np.pi * bf * tb) * np.exp(-tb * 10) * 0.25
            y[s0:s0 + m] += lp(b, sr, 900)[: max(0, min(m, n - s0))]
        if k % 4 == 2:
            m = int(0.06 * sr)
            wb = bp(noise(m), sr, 1500, 2500) * env_ad(m, sr, 0.001, 0.01) * 0.6
            y[s0:s0 + m] += wb[: max(0, min(m, n - s0))]
        k += 1
    save("mus_cute_chase", loopify(y, sr, 1.0), sr, -8, True)


def boing():
    sr = SR
    t = t_axis(0.9, sr)
    f = 180 + 140 * np.exp(-t * 3) * np.sin(2 * np.pi * 9 * t)
    x = np.sin(2 * np.pi * np.cumsum(f) / sr) * np.exp(-t * 3.2)
    save("sfx_boing", x, sr, -6)


def tick():
    sr = SR
    t = t_axis(0.09, sr)
    x = np.sin(2 * np.pi * 1320 * t) * env_ad(len(t), sr, 0.001, 0.03)
    save("sfx_tick", x, sr, -12)


def main():
    print("추가 오디오 생성 →", A.OUT)
    mon_breath(); mon_static(); mon_steps(); mon_drag(); mon_roar()
    js_shriek(); js_stinger(); door_bang(); heartbeat(); mus_hunt()
    mus_cute(); mus_cute_chase(); boing(); tick()
    for name, dur, sr, peak, rms, seam in A.REPORT:
        print("%-18s %6.2fs %6d  peak %6.1f dB  rms %6.1f dB" % (name, dur, sr, peak, rms))


if __name__ == "__main__":
    main()
