#!/usr/bin/env python3
"""
야간 평가실 텍스처 생성기 (개발 도구).
코드로 만든 저해상도 텍스처를 Assets/Resources/Textures 에 PNG로 저장한다.
반복 무늬는 이음새 없이 타일링되도록 주기적 노이즈를 쓴다.
사용: python3 Tools/gen_textures.py
필요: numpy, pillow, scipy
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# Unity 기본 가져오기는 텍스처를 압축(DXT)·크기 조정해 픽셀 글자가 뭉개지므로,
# PNG 바이트를 .bytes(TextAsset)로 두고 실행 중에 그대로 읽는다 (Res.Tex).
OUT = os.path.join(ROOT, "Assets", "Resources", "TexturesRaw")
FONT = os.path.join(ROOT, "Assets", "Resources", "Fonts", "Galmuri11.ttf")
FONT_B = os.path.join(ROOT, "Assets", "Resources", "Fonts", "Galmuri11-Bold.ttf")
rng = np.random.default_rng(117)


# ---------- 노이즈 ----------

def pnoise(size, cells, seed=None):
    """주기적(타일링 가능) 값 노이즈 0..1"""
    r = np.random.default_rng(seed) if seed is not None else rng
    grid = r.random((cells, cells))
    z = ndimage.zoom(grid, size / cells, order=3, mode="grid-wrap", grid_mode=True)
    z = z[:size, :size]
    z -= z.min()
    return z / max(z.max(), 1e-6)


def fbm(size, base=4, octaves=4, seed=None):
    acc = np.zeros((size, size))
    amp, total = 1.0, 0.0
    for o in range(octaves):
        cells = base * (2 ** o)
        if cells > size:
            break
        acc += pnoise(size, cells, None if seed is None else seed + o) * amp
        total += amp
        amp *= 0.5
    return acc / total


def speckle(size, density, seed=None):
    r = np.random.default_rng(seed) if seed is not None else rng
    return (r.random((size, size)) < density).astype(float)


def to_img(rgb):
    arr = np.clip(rgb * 255.0, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, "RGB")


def colorize(v, c0, c1):
    c0 = np.array(c0, dtype=float)
    c1 = np.array(c1, dtype=float)
    return c0[None, None, :] * (1 - v[..., None]) + c1[None, None, :] * v[..., None]


def save(img, name):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name + ".bytes")
    img.save(path, format="PNG", optimize=True)
    print("  ", name, img.size)


def font(size, bold=False):
    return ImageFont.truetype(FONT_B if bold else FONT, size)


# ---------- 바닥·벽·천장 ----------

def carpet():
    s = 256
    n = fbm(s, 8, 4, 1) * 0.5 + pnoise(s, 128, 2) * 0.35 + rng.random((s, s)) * 0.15
    stain = fbm(s, 3, 3, 3)
    v = n * 0.55 + 0.25
    v -= np.clip(stain - 0.62, 0, 1) * 0.9  # 얼룩
    rgb = colorize(np.clip(v, 0, 1), (0.10, 0.12, 0.16), (0.36, 0.40, 0.48))
    # 카펫 타일 이음새 (50cm 타일 → 텍스처 1m 에 2x2)
    for k in (0, 128):
        rgb[k:k + 1, :, :] *= 0.62
        rgb[:, k:k + 1, :] *= 0.62
    save(to_img(rgb), "carpet")


def floor_tile():
    s = 128
    v = 0.55 + fbm(s, 4, 3, 10) * 0.25 + rng.random((s, s)) * 0.05
    v -= speckle(s, 0.01, 11) * 0.25
    rgb = colorize(np.clip(v, 0, 1), (0.18, 0.19, 0.2), (0.72, 0.73, 0.72))
    rgb[0:2, :, :] *= 0.55
    rgb[:, 0:2, :] *= 0.55
    save(to_img(rgb), "floor_tile")


def ceiling_tile():
    s = 256
    v = 0.78 + fbm(s, 8, 3, 20) * 0.12
    pits = speckle(s, 0.06, 21)
    pits = ndimage.grey_dilation(pits, size=(2, 2)) * (rng.random((s, s)) > 0.4)
    v -= pits * 0.25
    water = fbm(s, 2, 4, 22)
    v -= np.clip(water - 0.68, 0, 1) * 1.6  # 누수 얼룩
    rgb = colorize(np.clip(v, 0, 1), (0.30, 0.29, 0.26), (0.86, 0.87, 0.88))
    # 그리드 (60cm 타일, 텍스처 1.2m → 2x2)
    for k in (0, 128):
        rgb[k:k + 3, :, :] = np.array([0.42, 0.44, 0.46])
        rgb[:, k:k + 3, :] = np.array([0.42, 0.44, 0.46])
    save(to_img(rgb), "ceiling_tile")


def wall():
    s = 256
    v = 0.72 + fbm(s, 6, 4, 30) * 0.16 + rng.random((s, s)) * 0.03
    # 아래쪽으로 갈수록 때가 탄다 (텍스처 v=0 이 아래)
    yy = np.linspace(1.0, 0.0, s)[:, None]
    v -= (yy ** 3) * 0.16 * fbm(s, 8, 2, 31)
    # 세로 흘러내린 자국
    streak = pnoise(s, 32, 32)
    streak = ndimage.zoom(streak[:, :1].repeat(1, axis=1), (1, 1), order=0)
    drip = np.tile(pnoise(s, 24, 33)[0:1, :], (s, 1))
    v -= np.clip(drip - 0.75, 0, 1) * 0.5 * (yy * 0.6 + 0.2)
    v -= speckle(s, 0.004, 34) * 0.2
    rgb = colorize(np.clip(v, 0, 1), (0.22, 0.25, 0.28), (0.80, 0.84, 0.88))
    save(to_img(rgb), "wall")


# ---------- 가구 재질 ----------

def desk_top():
    s = 128
    v = 0.66 + fbm(s, 8, 3, 40) * 0.12 + rng.random((s, s)) * 0.08
    v -= speckle(s, 0.02, 41) * 0.12
    scratches = np.zeros((s, s))
    for _ in range(14):
        y = rng.integers(0, s)
        x0 = rng.integers(0, s)
        ln = rng.integers(8, 40)
        for i in range(ln):
            scratches[(y + i // 6) % s, (x0 + i) % s] = 1
    v += scratches * 0.12
    rgb = colorize(np.clip(v, 0, 1), (0.30, 0.30, 0.29), (0.84, 0.83, 0.79))
    save(to_img(rgb), "desk_top")


def metal():
    s = 128
    v = 0.7 + fbm(s, 4, 3, 50) * 0.15
    brushed = ndimage.uniform_filter1d(rng.random((s, s)), 25, axis=1, mode="wrap")
    v += (brushed - 0.5) * 0.25
    v -= speckle(s, 0.008, 51) * 0.3
    rust = fbm(s, 3, 3, 52)
    rgb = colorize(np.clip(v, 0, 1), (0.25, 0.27, 0.29), (0.82, 0.85, 0.87))
    r = np.clip(rust - 0.72, 0, 1)[..., None] * 1.8
    rgb = rgb * (1 - r) + r * np.array([0.32, 0.22, 0.16])
    save(to_img(rgb), "metal")


def plastic():
    s = 128
    v = 0.82 + fbm(s, 4, 3, 60) * 0.1 + rng.random((s, s)) * 0.04
    yellow = fbm(s, 2, 2, 61)
    rgb = colorize(np.clip(v, 0, 1), (0.45, 0.43, 0.38), (0.95, 0.93, 0.86))
    rgb *= (1 - yellow[..., None] * np.array([0.0, 0.05, 0.16]))
    rgb -= speckle(s, 0.01, 62)[..., None] * 0.15
    save(to_img(rgb), "plastic")


def fabric():
    s = 128
    weave = (np.sin(np.arange(s) * np.pi / 2)[None, :] * np.sin(np.arange(s) * np.pi / 2)[:, None]) * 0.5 + 0.5
    v = 0.6 + weave * 0.12 + fbm(s, 8, 3, 70) * 0.2 + rng.random((s, s)) * 0.08
    rgb = colorize(np.clip(v, 0, 1), (0.18, 0.2, 0.24), (0.62, 0.66, 0.74))
    save(to_img(rgb), "fabric")


def cardboard():
    s = 128
    v = 0.6 + fbm(s, 6, 3, 80) * 0.25
    flutes = (np.sin(np.arange(s) * 2 * np.pi / 8)[None, :] * 0.04)
    v = v + flutes
    rgb = colorize(np.clip(v, 0, 1), (0.30, 0.22, 0.14), (0.78, 0.64, 0.46))
    rgb[60:68, :, :] = rgb[60:68, :, :] * 0.6 + np.array([0.55, 0.5, 0.42]) * 0.4  # 테이프
    save(to_img(rgb), "cardboard")


def cat_fur():
    s = 128
    v = 0.62 + fbm(s, 8, 3, 90) * 0.18
    x = np.arange(s)[None, :]
    stripes = (np.sin(x * 2 * np.pi / 16 + fbm(s, 4, 2, 91) * 4) > 0.55).astype(float)
    v -= stripes * 0.22
    rgb = colorize(np.clip(v, 0, 1), (0.25, 0.25, 0.27), (0.82, 0.82, 0.84))
    save(to_img(rgb), "cat_fur")


def door():
    w, h = 128, 256
    v = 0.7 + fbm(256, 4, 3, 100)[:h, :w] * 0.12 + rng.random((h, w)) * 0.04
    rgb = colorize(np.clip(v, 0, 1), (0.24, 0.27, 0.3), (0.78, 0.81, 0.84))
    # 아래 발판 (텍스처 v 아래쪽 = 이미지 아래)
    rgb[h - 40:h, :, :] = rgb[h - 40:h, :, :] * 0.55 + np.array([0.5, 0.52, 0.55]) * 0.3
    rgb[h - 41:h - 39, :, :] *= 0.5
    # 손때
    hand = np.zeros((h, w))
    hand[110:150, 96:124] = 1
    hand = ndimage.gaussian_filter(hand, 6)
    rgb *= (1 - hand[..., None] * 0.35)
    # 작은 창 (철망 유리 느낌)
    rgb[40:96, 40:88, :] = np.array([0.05, 0.06, 0.07])
    for k in range(40, 96, 6):
        rgb[k, 40:88, :] = np.array([0.18, 0.2, 0.22])
    for k in range(40, 88, 6):
        rgb[40:96, k, :] = np.array([0.18, 0.2, 0.22])
    rgb[38:40, 38:90, :] = 0.3
    rgb[96:98, 38:90, :] = 0.3
    save(to_img(rgb), "door")


# ---------- 인쇄물·표지판 (픽셀 폰트) ----------

def canvas(w, h, color):
    return Image.new("RGB", (w, h), tuple(int(c * 255) for c in color))


def dirty(img, amount=0.12, seed=0):
    a = np.asarray(img).astype(float) / 255.0
    h, w, _ = a.shape
    s = max(h, w)
    n = fbm(s, 4, 3, 200 + seed)[:h, :w]
    a *= (1 - amount + n[..., None] * amount)
    return to_img(a)


def keyboard():
    w, h = 256, 96
    img = canvas(w, h, (0.72, 0.70, 0.64))
    d = ImageDraw.Draw(img)
    rows = [15, 14, 13, 12]
    y = 6
    for ri, n in enumerate(rows):
        kw = (w - 12) / 15.5
        x = 6 + ri * kw * 0.35
        for i in range(n):
            d.rectangle([x, y, x + kw - 3, y + 15], fill=(196, 191, 178), outline=(120, 116, 106))
            x += kw
        y += 19
    d.rectangle([60, y, 190, y + 14], fill=(196, 191, 178), outline=(120, 116, 106))
    save(dirty(img, 0.18, 1), "keyboard")


def tower_front():
    w, h = 64, 128
    img = canvas(w, h, (0.78, 0.75, 0.67))
    d = ImageDraw.Draw(img)
    d.rectangle([8, 10, 56, 22], fill=(60, 60, 62))
    d.rectangle([8, 28, 56, 40], fill=(60, 60, 62))
    d.rectangle([14, 50, 50, 54], fill=(40, 40, 42))
    d.ellipse([26, 96, 38, 108], fill=(150, 146, 136), outline=(90, 88, 82))
    d.rectangle([44, 100, 48, 104], fill=(40, 90, 40))
    for k in range(70, 90, 4):
        d.line([12, k, 52, k], fill=(120, 116, 106))
    save(dirty(img, 0.2, 2), "tower_front")


def notice():
    w, h = 256, 384
    img = canvas(w, h, (0.86, 0.85, 0.80))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w - 1, 44], fill=(40, 52, 64))
    d.text((12, 10), "야간 근무 지침", font=font(24, True), fill=(230, 236, 240))
    lines = [
        ("1. 기록을", 0), ("   평가하십시오.", 0), ("", 0),
        ("2. 사용자와 접촉", 0), ("   하지 마십시오.", 0), ("", 0),
        ("3. 본 기록은 종료", 1), ("   된 사건입니다.", 1), ("", 0),
        ("근무 중 평가실을", 0), ("떠나지 마십시오.", 0),
    ]
    y = 58
    for text, scratched in lines:
        if text:
            d.text((14, y), text, font=font(24), fill=(30, 34, 38))
            if scratched:
                for k in range(5):
                    yy = y + 3 + k * 4 + int(rng.integers(-1, 2))
                    d.line([10, yy, 238, yy + int(rng.integers(-4, 5))], fill=(150, 145, 135), width=1)
        y += 26
    d.text((14, h - 26), "시냅스 코퍼레이션 · 야간 QA", font=font(12), fill=(80, 84, 88))
    d.ellipse([w - 34, 8, w - 14, 28], fill=(160, 40, 40))  # 압정
    save(dirty(img, 0.25, 3), "notice")


def badge(number, scratched, name):
    w, h = 128, 192
    img = canvas(w, h, (0.92, 0.92, 0.90))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w - 1, 34], fill=(46, 66, 86))
    d.text((8, 8), "SYNAPSE", font=font(12, True), fill=(220, 230, 236))
    d.text((8, 20), "EVALUATOR", font=font(12), fill=(170, 186, 196))
    d.rectangle([24, 44, 104, 124], fill=(200, 202, 204), outline=(120, 122, 124))
    if scratched:
        for k in range(40):
            x0 = 24 + rng.integers(0, 80)
            y0 = 44 + rng.integers(0, 80)
            d.line([x0, y0, x0 + rng.integers(-20, 20), y0 + rng.integers(4, 30)], fill=(90, 90, 92), width=1)
    d.text((10, 132), "평가자 " + number, font=font(24, True), fill=(30, 34, 38))
    d.text((10, 162), "계약직 · 야간", font=font(12), fill=(70, 74, 78))
    d.rectangle([54, 4, 74, 8], fill=(30, 30, 30))
    save(dirty(img, 0.15, 4 + int(number)), name)


def sticky():
    s = 128
    img = canvas(s, s, (0.93, 0.86, 0.45))
    d = ImageDraw.Draw(img)
    d.text((8, 18), "6시 전에는", font=font(24), fill=(40, 40, 70))
    d.text((8, 50), "절대 나가지", font=font(24), fill=(40, 40, 70))
    d.text((8, 82), "말 것", font=font(24), fill=(40, 40, 70))
    save(dirty(img, 0.18, 7), "sticky")


def clock_face():
    s = 256
    img = canvas(s, s, (0.86, 0.86, 0.84))
    d = ImageDraw.Draw(img)
    d.ellipse([4, 4, s - 4, s - 4], outline=(40, 40, 42), width=6)
    c = s / 2
    for i in range(60):
        a = i / 60 * 2 * np.pi
        r0 = 110 if i % 5 == 0 else 116
        d.line([c + np.sin(a) * r0, c - np.cos(a) * r0, c + np.sin(a) * 122, c - np.cos(a) * 122], fill=(30, 30, 32), width=4 if i % 5 == 0 else 1)
    for n in range(1, 13):
        a = n / 12 * 2 * np.pi
        t = str(n)
        x = c + np.sin(a) * 88
        y = c - np.cos(a) * 88
        d.text((x - 6 * len(t), y - 12), t, font=font(24), fill=(30, 30, 32))
    save(dirty(img, 0.2, 8), "clock_face")


def sign_room():
    w, h = 256, 128
    img = canvas(w, h, (0.16, 0.2, 0.24))
    d = ImageDraw.Draw(img)
    d.rectangle([4, 4, w - 5, h - 5], outline=(140, 156, 168), width=2)
    d.text((16, 22), "4F", font=font(36, True), fill=(220, 228, 234))
    d.text((16, 70), "야간 평가실", font=font(36), fill=(220, 228, 234))
    save(dirty(img, 0.15, 9), "sign_room")


def panel():
    w, h = 128, 192
    img = canvas(w, h, (0.62, 0.64, 0.64))
    d = ImageDraw.Draw(img)
    d.text((8, 6), "조명 분전반", font=font(12, True), fill=(30, 30, 32))
    for r in range(6):
        for c in range(2):
            x = 14 + c * 54
            y = 30 + r * 26
            d.rectangle([x, y, x + 44, y + 20], fill=(36, 38, 40))
            d.rectangle([x + 16, y + 3, x + 28, y + 10], fill=(210, 210, 200))
            d.text((x + 2, y + 9), f"{r * 2 + c + 1}", font=font(12), fill=(160, 160, 150))
    d.rectangle([8, h - 26, w - 8, h - 10], fill=(180, 60, 40))
    d.text((12, h - 26), "위험 · 관계자 외", font=font(12), fill=(250, 240, 230))
    save(dirty(img, 0.22, 10), "panel")


def calendar():
    w, h = 256, 384
    img = canvas(w, h, (0.9, 0.89, 0.85))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w - 1, 64], fill=(150, 40, 40))
    d.text((92, 14), "9월", font=font(36, True), fill=(250, 240, 236))
    for i, name in enumerate("일월화수목금토"):
        d.text((8 + i * 35, 74), name, font=font(12), fill=(110, 110, 114))
    day = 1
    start = 1  # 9월 1일 = 월요일
    for wk in range(6):
        for dd in range(7):
            idx = wk * 7 + dd
            if idx < start or day > 30:
                continue
            x = 6 + dd * 35
            y = 96 + wk * 46
            col = (160, 40, 40) if dd == 0 else (40, 40, 44)
            d.text((x, y), str(day), font=font(24), fill=col)
            if day in (14, 15):
                d.ellipse([x - 4, y - 5, x + 30, y + 29], outline=(190, 30, 30), width=3)
            day += 1
    save(dirty(img, 0.2, 11), "calendar")


def elevator():
    s = 256
    a = 0.55 + fbm(s, 4, 3, 120) * 0.12
    brushed = ndimage.uniform_filter1d(rng.random((s, s)), 30, axis=0, mode="wrap")
    a += (brushed - 0.5) * 0.2
    rgb = colorize(np.clip(a, 0, 1), (0.2, 0.22, 0.24), (0.7, 0.73, 0.76))
    rgb[:, 126:130, :] = 0.08
    rgb[0:10, :, :] *= 0.4
    img = to_img(rgb)
    d = ImageDraw.Draw(img)
    d.text((112, 14), "4", font=font(24, True), fill=(220, 120, 60))
    save(img, "elevator")


def exit_sign():
    w, h = 256, 96
    img = canvas(w, h, (0.05, 0.55, 0.22))
    d = ImageDraw.Draw(img)
    # 달리는 사람 (단순 도형)
    g = (235, 250, 235)
    d.ellipse([22, 14, 36, 28], fill=g)
    d.line([30, 30, 24, 54], fill=g, width=6)
    d.line([24, 54, 12, 74], fill=g, width=5)
    d.line([24, 54, 40, 70], fill=g, width=5)
    d.line([28, 36, 46, 44], fill=g, width=4)
    d.line([28, 36, 12, 44], fill=g, width=4)
    d.rectangle([52, 10, 60, 86], fill=g)
    d.text((76, 22), "비상구", font=font(48, True), fill=g)
    save(img, "exit_sign")


def window_night():
    w, h = 512, 256
    a = np.zeros((h, w, 3))
    sky = np.linspace(0.10, 0.03, h)[:, None]
    a[:, :, 0] = sky * 0.5
    a[:, :, 1] = sky * 0.65
    a[:, :, 2] = sky * 1.0
    img = to_img(a)
    d = ImageDraw.Draw(img)
    # 건너편 건물들
    x = 0
    bi = 0
    while x < w:
        bw = int(rng.integers(60, 140))
        top = int(rng.integers(20, 110))
        d.rectangle([x, top, x + bw, h], fill=(10, 12, 16))
        for fy in range(top + 10, h - 6, 16):
            for fx in range(x + 6, x + bw - 8, 14):
                lit = rng.random() < 0.03
                col = (150, 140, 100) if lit else (16, 19, 24)
                d.rectangle([fx, fy, fx + 7, fy + 8], fill=col)
        x += bw + int(rng.integers(4, 20))
        bi += 1
    # 정면 건물 4층에만 불 켜진 창 (같은 높이)
    d.rectangle([236, 150, 252, 162], fill=(170, 200, 230))
    save(img, "window_night")


def screen_117():
    w, h = 256, 192
    img = canvas(w, h, (0.01, 0.02, 0.03))
    d = ImageDraw.Draw(img)
    d.text((40, 52), "117", font=font(72, True), fill=(200, 230, 255))
    d.text((40, 140), "평가 대상", font=font(24), fill=(110, 140, 160))
    save(img, "screen_117")


def main():
    print("텍스처 생성 →", OUT)
    carpet(); floor_tile(); ceiling_tile(); wall()
    desk_top(); metal(); plastic(); fabric(); cardboard(); cat_fur(); door()
    keyboard(); tower_front(); notice(); badge("117", False, "badge117"); badge("116", True, "badge116")
    sticky(); clock_face(); sign_room(); panel(); calendar(); elevator(); exit_sign(); window_night(); screen_117()


if __name__ == "__main__":
    sys.exit(main())
