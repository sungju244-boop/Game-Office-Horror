#!/usr/bin/env python3
"""
리부트판 사운드 생성기 (개발 도구). 사용: python3 Tools/gen_audio_reboot.py
미로 벽 충돌, 화면 균열, 프린터, 타자, 수화기 너머 키보드, 가이드 블립, 장 제목 부팅음, 경보,
블루스크린 삐, 잠금 해제, 그것의 속삭임, 메아리 비명, 화면 멈춤, 책상 긁기, 의자 삐걱,
겁쟁이 모드 아저씨 목소리 ("샨센부!", "랑스피치우!!", 흥얼거림) — 모두 코드 합성 (실제 음성 녹음 아님).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
from scipy import signal  # noqa: E402

from gen_audio import bp, env_ad, hp, lp, noise, reverb, save, t_axis  # noqa: E402

SR = 44100
rng = np.random.default_rng(2026)


def dist(x, k=3.0):
    return np.tanh(x * k) / np.tanh(k)


def env_lin(n, pts, sr):
    """pts: [(시각초, 값), ...] 선형 보간 포락선"""
    t = np.arange(n) / sr
    xs, ys = zip(*pts)
    return np.interp(t, xs, ys)


# ---------- 효과음 ----------

def maze_static():
    sr, L = SR, 0.28
    n = int(L * sr)
    t = np.arange(n) / sr
    sq = signal.square(2 * np.pi * 110 * t) * 0.5 + signal.square(2 * np.pi * 163 * t) * 0.3
    x = bp(sq + noise(n) * 0.9, sr, 300, 4000) * env_ad(n, sr, 0.003, 0.18)
    save("sfx_maze_hit", dist(x * 1.5, 2.0), sr, -6)


def glass_crack():
    sr, L = SR, 1.1
    n = int(L * sr)
    t = np.arange(n) / sr
    crack = hp(noise(n), sr, 1800) * np.exp(-t * 38)
    snap = np.zeros(n)
    for k in range(5):
        i = int((0.004 + k * 0.011 + rng.uniform(0, 0.006)) * sr)
        snap[i:i + 40] += rng.uniform(0.6, 1.0) * np.exp(-np.arange(40) / 6)
    snap = hp(snap, sr, 900)
    tink = np.zeros(n)
    for _ in range(14):
        f, t0 = rng.uniform(3200, 7800), rng.uniform(0.05, 0.7)
        i = int(t0 * sr)
        m = n - i
        tt = np.arange(m) / sr
        tink[i:] += np.sin(2 * np.pi * f * tt) * np.exp(-tt * rng.uniform(18, 40)) * rng.uniform(0.08, 0.25)
    thump = np.sin(2 * np.pi * 70 * t) * np.exp(-t * 14) * 0.5
    x = crack * 1.0 + snap * 1.2 + tink + thump
    save("sfx_glass_crack", reverb(x, sr, 0.6, 0.18), sr, -3)


def printer():
    sr, L = SR, 2.8
    n = int(L * sr)
    t = np.arange(n) / sr
    motor = bp(signal.sawtooth(2 * np.pi * 58 * t) + noise(n) * 0.3, sr, 80, 1400) * 0.4
    motor *= env_lin(n, [(0, 0), (0.15, 1), (2.5, 1), (2.8, 0)], sr)
    clicks = np.zeros(n)
    for k in range(int(L / 0.19)):
        i = int((0.2 + k * 0.19) * sr)
        if i + 300 < n:
            clicks[i:i + 300] += bp(noise(300), sr, 1500, 6000) * np.exp(-np.arange(300) / 50)
    swish = bp(noise(n), sr, 2000, 8000) * env_lin(n, [(0, 0), (2.1, 0), (2.35, 0.6), (2.75, 0)], sr)
    save("sfx_printer", motor + clicks * 0.6 + swish * 0.5, sr, -8)


def key_click():
    sr, L = SR, 0.07
    n = int(L * sr)
    t = np.arange(n) / sr
    x = hp(noise(n), sr, 2500) * np.exp(-t * 160) + np.sin(2 * np.pi * 1900 * t) * np.exp(-t * 220) * 0.4
    save("sfx_key", x, sr, -10)


def keyboard_far():
    """수화기 너머로 들리는, 지금 내 책상의 키보드 소리"""
    sr, L = 22050, 3.2
    n = int(L * sr)
    x = np.zeros(n)
    tt = 0.1
    while tt < L - 0.1:
        i = int(tt * sr)
        m = int(0.03 * sr)
        x[i:i + m] += hp(noise(m), sr, 1500) * np.exp(-np.arange(m) / (0.004 * sr)) * rng.uniform(0.5, 1.0)
        tt += rng.choice([0.08, 0.11, 0.14, 0.2, 0.35], p=[0.3, 0.3, 0.2, 0.15, 0.05])
    x = bp(x, sr, 450, 3000) + bp(noise(n), sr, 300, 3200) * 0.05
    save("sfx_keyboard_far", dist(x * 2, 1.5), sr, -10, loop=True)


def guide_blip():
    sr, L = SR, 0.06
    n = int(L * sr)
    t = np.arange(n) / sr
    x = np.sin(2 * np.pi * 1046 * t) * env_ad(n, sr, 0.004, 0.05) + np.sin(2 * np.pi * 2092 * t) * 0.2 * env_ad(n, sr, 0.002, 0.03)
    save("sfx_guide", x, sr, -14)


def chapter_boot():
    sr, L = SR, 1.8
    n = int(L * sr)
    t = np.arange(n) / sr
    thunk = np.sin(2 * np.pi * (70 - 25 * t) * t) * np.exp(-t * 7) * 0.8 + lp(noise(n), sr, 400) * np.exp(-t * 12) * 0.5
    chime = np.zeros(n)
    for f, t0 in ((659.3, 0.45), (987.8, 0.7)):
        i = int(t0 * sr)
        m = n - i
        tt = np.arange(m) / sr
        chime[i:] += (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(2 * np.pi * f * 2 * tt)) * np.exp(-tt * 3.5) * 0.35
    save("sfx_chapter", reverb(thunk + chime, sr, 1.0, 0.25), sr, -8)


def alarm():
    sr, L = SR, 1.6
    n = int(L * sr)
    t = np.arange(n) / sr
    f = np.where((t % 0.8) < 0.4, 720.0, 960.0)
    ph = 2 * np.pi * np.cumsum(f) / sr
    x = dist(signal.square(ph) * 0.5 + np.sin(ph) * 0.5, 1.6)
    x = bp(x, sr, 300, 5000)
    save("sfx_alarm", x, sr, -8, loop=True)


def bsod_beep():
    sr, L = SR, 0.8
    n = int(L * sr)
    t = np.arange(n) / sr
    x = dist(np.sin(2 * np.pi * 1000 * t), 1.3) * env_lin(n, [(0, 0), (0.01, 1), (0.7, 1), (0.8, 0)], sr)
    save("sfx_bsod", x, sr, -10)


def maglock():
    sr, L = SR, 0.7
    n = int(L * sr)
    t = np.arange(n) / sr
    click = hp(noise(n), sr, 2500) * np.exp(-t * 300)
    clunk = (np.sin(2 * np.pi * 180 * t) + 0.5 * np.sin(2 * np.pi * 410 * t)) * np.exp(-t * 18)
    clunk = np.roll(clunk, int(0.06 * sr))
    save("sfx_maglock", click + clunk * 0.7, sr, -6)


def entity_whisper():
    """그것의 속삭임: 음정 없는 숨소리에 모음처럼 움직이는 공명을 입힌다 (말은 알아들을 수 없음)."""
    sr, L = 22050, 3.6
    n = int(L * sr)
    t = np.arange(n) / sr
    src = noise(n)
    out = np.zeros(n)
    blk = 256
    f1 = 500 + 250 * np.sin(2 * np.pi * 1.7 * t + 1.0) + 120 * np.sin(2 * np.pi * 3.1 * t)
    f2 = 1500 + 600 * np.sin(2 * np.pi * 1.3 * t) + 200 * np.sin(2 * np.pi * 4.3 * t + 2)
    for i in range(0, n, blk):
        seg = src[i:i + blk]
        acc = np.zeros(len(seg))
        for F, bw, g in ((f1[i], 120, 1.0), (f2[i], 220, 0.7), (2800, 400, 0.3)):
            sos = signal.butter(2, [max(80, F - bw), min(sr * 0.45, F + bw)], "band", fs=sr, output="sos")
            acc += signal.sosfilt(sos, seg) * g
        out[i:i + blk] = acc
    breath = np.clip(np.sin(2 * np.pi * 0.9 * t) * 0.6 + 0.5 + 0.2 * np.sin(2 * np.pi * 2.3 * t), 0, 1) ** 1.5
    save("sfx_whisper", out * breath, sr, -10, loop=True)


def _formant_voice(segs, sr, base_amp=1.0, bright=1.0, breath=0.04):
    """segs: [(종류, 길이초, F1, F2, F3, 시작음정, 끝음정, 세기)] 종류: v=모음/유성, n=비음, s=무성 잡음(F1=하한,F2=상한), b=파열"""
    total = sum(s[1] for s in segs) + 0.4
    n = int(total * sr)
    pitch = np.full(n, 120.0)
    F = np.zeros((3, n))
    voiced = np.zeros(n)
    unv = np.zeros(n)
    unv_lo = np.full(n, 3000.0)
    unv_hi = np.full(n, 8000.0)
    pos = 0
    prevF = None
    for kind, d, f1, f2, f3, p0, p1, a in segs:
        m = int(d * sr)
        sl = slice(pos, pos + m)
        g = np.linspace(0, 1, m)
        if kind in ("v", "n"):
            tgt = np.array([f1, f2, f3], float)
            st = prevF if prevF is not None else tgt
            gg = np.clip(g / 0.35, 0, 1)
            for k in range(3):
                F[k, sl] = st[k] + (tgt[k] - st[k]) * gg
            pitch[sl] = p0 + (p1 - p0) * g
            voiced[sl] = a * (0.45 if kind == "n" else 1.0)
            prevF = tgt
        elif kind == "s":
            unv[sl] = a
            if a > 0 and f1 > 0 and f2 > f1:
                unv_lo[sl] = f1
                unv_hi[sl] = f2
            if prevF is not None:
                for k in range(3):
                    F[k, sl] = prevF[k]
        elif kind == "b":
            unv[pos:pos + min(m, int(0.012 * sr))] = a * 1.4
            unv_lo[sl] = 500
            unv_hi[sl] = 6000
            if prevF is not None:
                for k in range(3):
                    F[k, sl] = prevF[k]
        pos += m
    # 부드러운 포락선
    sm = int(0.012 * sr)
    k = np.ones(sm) / sm
    voiced = np.convolve(voiced, k, "same")
    unv = np.convolve(unv, np.ones(int(0.004 * sr)) / int(0.004 * sr), "same")
    phase = 2 * np.pi * np.cumsum(pitch * (1 + 0.012 * np.sin(2 * np.pi * 5.5 * np.arange(n) / sr))) / sr
    src = signal.sawtooth(phase) * 0.7 + np.sin(phase) * 0.3
    src = src + noise(n) * breath
    out = np.zeros(n)
    blk = 256
    nz = noise(n)
    for i in range(0, n, blk):
        seg = src[i:i + blk] * voiced[i:i + blk]
        acc = np.zeros(len(seg))
        if voiced[i:i + blk].max() > 1e-4:
            for kk, (bw, gn) in enumerate(((80, 1.0), (120, 0.75 * bright), (180, 0.4 * bright))):
                Fk = F[kk, i]
                if Fk <= 0:
                    continue
                sos = signal.butter(2, [max(60, Fk - bw), min(sr * 0.45, Fk + bw)], "band", fs=sr, output="sos")
                acc += signal.sosfilt(sos, seg) * gn
        useg = nz[i:i + blk] * unv[i:i + blk]
        if unv[i:i + blk].max() > 1e-4:
            lo = max(100.0, unv_lo[i])
            hi = max(lo + 200.0, min(sr * 0.45, unv_hi[i]))
            sos = signal.butter(2, [lo, hi], "band", fs=sr, output="sos")
            acc += signal.sosfilt(sos, useg) * 0.9
        out[i:i + blk] = acc
    return out * base_amp


# 남성 외침 모음 포먼트
VA, VE, VI, VU, VEU, VO = (760, 1150, 2500), (560, 1800, 2550), (300, 2250, 3050), (330, 880, 2300), (340, 1350, 2350), (580, 860, 2450)


def uncle_voices():
    sr = SR
    # "샨! 센! 부!" — 끊어서 힘차게 외치는 우렁찬 아저씨 톤
    s1 = [
        ("s", 0.07, 2600, 7500, 0, 0, 0, 0.9), ("v", 0.05, *VI, 200, 215, 1.0), ("v", 0.14, *VA, 215, 205, 1.0), ("n", 0.06, 260, 1100, 2400, 205, 195, 0.9),
        ("s", 0.03, 0, 0, 0, 0, 0, 0.0),
        ("s", 0.07, 4000, 9000, 0, 0, 0, 0.9), ("v", 0.14, *VE, 215, 210, 1.0), ("n", 0.05, 260, 1100, 2400, 210, 200, 0.9),
        ("s", 0.03, 0, 0, 0, 0, 0, 0.0),
        ("b", 0.02, 0, 0, 0, 0, 0, 0.8), ("v", 0.26, *VU, 225, 165, 1.0),
    ]
    x = _formant_voice(s1, sr, bright=1.2)
    x = dist(x / (np.abs(x).max() + 1e-9) * 1.4, 1.8)
    save("uncle_shansenbu", reverb(x, sr, 0.5, 0.12), sr, -4)
    # "랑! 스피치우!!" — 마지막 '우'에서 목소리가 갈라지며 커진다
    s2 = [
        ("v", 0.04, 350, 1300, 2400, 190, 200, 0.7), ("v", 0.16, *VA, 205, 215, 1.0), ("n", 0.08, 280, 1900, 2600, 215, 205, 0.85),
        ("s", 0.03, 0, 0, 0, 0, 0, 0.0),
        ("s", 0.08, 4000, 9000, 0, 0, 0, 0.9), ("v", 0.06, *VEU, 205, 205, 0.8),
        ("b", 0.02, 0, 0, 0, 0, 0, 0.8), ("s", 0.03, 1500, 6000, 0, 0, 0, 0.5), ("v", 0.12, *VI, 215, 225, 1.0),
        ("s", 0.07, 2500, 7000, 0, 0, 0, 0.9), ("v", 0.12, *VI, 230, 240, 1.0),
        ("v", 0.34, *VU, 250, 300, 1.0),
    ]
    y = _formant_voice(s2, sr, bright=1.3, breath=0.08)
    tail = np.arange(len(y)) / sr
    crack = 1 + 0.25 * (tail > 0.95) * np.sign(np.sin(2 * np.pi * 31 * tail))  # 목소리가 갈라짐
    y = dist(y / (np.abs(y).max() + 1e-9) * 1.6 * crack, 2.2)
    save("uncle_rangspichiu", reverb(y, sr, 0.5, 0.12), sr, -3)
    # 흥얼거림 (등 뒤 속삭임 대신): 콧소리로 짧은 가락
    mel = [(196, 0.32), (220, 0.32), (247, 0.5), (220, 0.3), (196, 0.6)]
    s3 = [("n", d, 260, 1000, 2300, f, f, 0.8) for f, d in mel]
    h = _formant_voice(s3, 22050, bright=0.6, breath=0.02)
    save("uncle_hum", h, 22050, -12)


def echo_scream():
    sr = SR
    s = [("v", 0.1, *VA, 330, 420, 0.8), ("v", 1.3, *VA, 420, 360, 1.0)]
    x = _formant_voice(s, sr, bright=1.4, breath=0.25)
    x = dist(x / (np.abs(x).max() + 1e-9) * 2.0, 3.0)
    x = np.concatenate([x, np.zeros(int(1.2 * sr))])
    save("sfx_echo_scream", reverb(reverb(x, sr, 2.5, 0.5), sr, 3.0, 0.45), sr, -3)


def freeze_hum():
    sr, L = SR, 0.36
    n = int(L * sr)
    t = np.arange(n) / sr
    grain = np.sin(2 * np.pi * 220 * t) * 0.5 + signal.square(2 * np.pi * 120 * t) * 0.3
    x = np.tile(grain[: int(0.06 * sr)], 6)[:n]
    save("sfx_freeze", bp(x, sr, 100, 3000), sr, -14, loop=True)


def desk_tap():
    sr, L = SR, 1.6
    n = int(L * sr)
    x = np.zeros(n)
    for t0 in (0.1, 0.32, 0.55):
        i = int(t0 * sr)
        m = int(0.08 * sr)
        x[i:i + m] += bp(noise(m), sr, 300, 2500) * np.exp(-np.arange(m) / (0.01 * sr))
    i = int(0.8 * sr)
    m = int(0.7 * sr)
    x[i:i + m] += bp(noise(m), sr, 1500, 5000) * np.sin(np.linspace(0, np.pi, m)) * 0.4
    save("sfx_desk_tap", x, sr, -10)


def chair_creak():
    sr, L = SR, 1.1
    n = int(L * sr)
    t = np.arange(n) / sr
    f = 900 + 500 * np.sin(2 * np.pi * 1.4 * t)
    ph = 2 * np.pi * np.cumsum(f) / sr
    sq = np.sin(ph) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 37 * t)))
    x = bp(sq + noise(n) * 0.2, sr, 500, 4000) * env_lin(n, [(0, 0), (0.1, 1), (0.9, 0.8), (1.1, 0)], sr)
    save("sfx_chair", x, sr, -10)


def main():
    print("리부트 사운드 →")
    maze_static(); glass_crack(); printer(); key_click(); keyboard_far(); guide_blip(); chapter_boot()
    alarm(); bsod_beep(); maglock(); entity_whisper(); echo_scream(); freeze_hum(); desk_tap(); chair_creak()
    uncle_voices()
    import gen_audio as A
    for name, dur, sr, peak, rms, seam in A.REPORT:
        print(f"  {name:20s} {dur:5.2f}s {sr}Hz peak {peak:6.1f} dB rms {rms:6.1f} dB")


if __name__ == "__main__":
    main()
