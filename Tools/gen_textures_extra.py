#!/usr/bin/env python3
"""
추가 텍스처 생성기 (개발 도구):
  - 영어판 글자 텍스처 (*_en): 공지문, 사원증, 메모지, 표지판, 달력, 분전반, 비상구, 117 화면
  - 괴물 얼굴 (CRT 화면용 / 점프스케어용), 괴물 피부
  - 겁쟁이 모드용 고양이 얼굴
사용: python3 Tools/gen_textures_extra.py   (gen_textures.py 의 도구를 그대로 쓴다)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
from PIL import Image, ImageDraw, ImageFilter  # noqa: E402

import gen_textures as G  # noqa: E402
from gen_textures import canvas, colorize, dirty, fbm, font, rng, save, to_img  # noqa: E402


# ---------- 영어판 글자 텍스처 ----------

def notice_en():
    w, h = 256, 384
    img = canvas(w, h, (0.86, 0.85, 0.80))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w - 1, 44], fill=(40, 52, 64))
    d.text((12, 10), "SHIFT RULES", font=font(24, True), fill=(230, 236, 240))
    lines = [
        ("1. Evaluate the", 0), ("   records.", 0), ("", 0),
        ("2. Do not contact", 0), ("   the users.", 0), ("", 0),
        ("3. These records", 1), ("   are closed.", 1), ("", 0),
        ("Do not leave the", 0), ("room on shift.", 0),
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
    d.text((14, h - 26), "EVALUATION CENTER", font=font(12), fill=(80, 84, 88))
    d.ellipse([w - 34, 8, w - 14, 28], fill=(160, 40, 40))
    save(dirty(img, 0.25, 3), "notice_en")


def badge_en(number, scratched, name):
    w, h = 128, 192
    img = canvas(w, h, (0.92, 0.92, 0.90))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w - 1, 34], fill=(46, 66, 86))
    d.text((8, 8), "EVAL CENTER", font=font(12, True), fill=(220, 230, 236))
    d.text((8, 20), "NIGHT STAFF", font=font(12), fill=(170, 186, 196))
    d.rectangle([24, 44, 104, 124], fill=(200, 202, 204), outline=(120, 122, 124))
    if scratched:
        for _ in range(40):
            x0 = 24 + rng.integers(0, 80)
            y0 = 44 + rng.integers(0, 80)
            d.line([x0, y0, x0 + rng.integers(-20, 20), y0 + rng.integers(4, 30)], fill=(90, 90, 92), width=1)
    d.text((10, 130), "No. " + number, font=font(24, True), fill=(30, 34, 38))
    d.text((10, 162), "CONTRACT · NIGHT", font=font(12), fill=(70, 74, 78))
    d.rectangle([54, 4, 74, 8], fill=(30, 30, 30))
    save(dirty(img, 0.15, 4 + int(number)), name)


def sticky_en():
    s = 128
    img = canvas(s, s, (0.93, 0.86, 0.45))
    d = ImageDraw.Draw(img)
    for i, t in enumerate(["NEVER", "LEAVE", "BEFORE", "6 AM."]):
        d.text((10, 10 + i * 27), t, font=font(24), fill=(40, 40, 70))
    save(dirty(img, 0.18, 7), "sticky_en")


def sign_room_en():
    w, h = 256, 128
    img = canvas(w, h, (0.16, 0.2, 0.24))
    d = ImageDraw.Draw(img)
    d.rectangle([4, 4, w - 5, h - 5], outline=(140, 156, 168), width=2)
    d.text((16, 18), "4F", font=font(36, True), fill=(220, 228, 234))
    d.text((16, 66), "NIGHT", font=font(24), fill=(220, 228, 234))
    d.text((16, 92), "EVALUATION ROOM", font=font(24), fill=(220, 228, 234))
    save(dirty(img, 0.15, 9), "sign_room_en")


def panel_en():
    w, h = 128, 192
    img = canvas(w, h, (0.62, 0.64, 0.64))
    d = ImageDraw.Draw(img)
    d.text((8, 6), "LIGHTING PANEL", font=font(12, True), fill=(30, 30, 32))
    for r in range(6):
        for c in range(2):
            x = 14 + c * 54
            y = 30 + r * 26
            d.rectangle([x, y, x + 44, y + 20], fill=(36, 38, 40))
            d.rectangle([x + 16, y + 3, x + 28, y + 10], fill=(210, 210, 200))
            d.text((x + 2, y + 9), f"{r * 2 + c + 1}", font=font(12), fill=(160, 160, 150))
    d.rectangle([8, h - 26, w - 8, h - 10], fill=(180, 60, 40))
    d.text((12, h - 26), "DANGER · STAFF", font=font(12), fill=(250, 240, 230))
    save(dirty(img, 0.22, 10), "panel_en")


def calendar_en():
    w, h = 256, 384
    img = canvas(w, h, (0.9, 0.89, 0.85))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w - 1, 64], fill=(150, 40, 40))
    d.text((44, 14), "SEPTEMBER", font=font(36, True), fill=(250, 240, 236))
    for i, name in enumerate("SMTWTFS"):
        d.text((12 + i * 35, 74), name, font=font(12), fill=(110, 110, 114))
    day = 1
    start = 1
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
    save(dirty(img, 0.2, 11), "calendar_en")


def exit_sign_en():
    w, h = 256, 96
    img = canvas(w, h, (0.05, 0.55, 0.22))
    d = ImageDraw.Draw(img)
    g = (235, 250, 235)
    d.ellipse([22, 14, 36, 28], fill=g)
    d.line([30, 30, 24, 54], fill=g, width=6)
    d.line([24, 54, 12, 74], fill=g, width=5)
    d.line([24, 54, 40, 70], fill=g, width=5)
    d.line([28, 36, 46, 44], fill=g, width=4)
    d.line([28, 36, 12, 44], fill=g, width=4)
    d.rectangle([52, 10, 60, 86], fill=g)
    d.text((86, 22), "EXIT", font=font(48, True), fill=g)
    save(img, "exit_sign_en")


def screen_117_en():
    w, h = 256, 192
    img = canvas(w, h, (0.01, 0.02, 0.03))
    d = ImageDraw.Draw(img)
    d.text((40, 52), "117", font=font(72, True), fill=(200, 230, 255))
    d.text((40, 140), "SUBJECT", font=font(24), fill=(110, 140, 160))
    save(img, "screen_117_en")


# ---------- 괴물 ----------

def _face_layer(size, seed=0):
    """창백한 얼굴, 깊은 눈구멍, 찢어진 입. 크게 그린 뒤 줄여서 쓴다."""
    r = np.random.default_rng(seed)
    S = size
    img = Image.new("RGB", (S, S), (0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = S * 0.5, S * 0.52
    # 얼굴 바탕 (길쭉한 타원, 약간 기울어짐)
    face = Image.new("L", (S, S), 0)
    fd = ImageDraw.Draw(face)
    fd.ellipse([cx - S * 0.30, cy - S * 0.42, cx + S * 0.30, cy + S * 0.44], fill=255)
    face = face.rotate(-7, resample=Image.BICUBIC, center=(cx, cy)).filter(ImageFilter.GaussianBlur(S * 0.01))
    skin = np.zeros((S, S, 3))
    yy, xx = np.mgrid[0:S, 0:S]
    dist = np.sqrt(((xx - cx) / (S * 0.30)) ** 2 + ((yy - cy) / (S * 0.43)) ** 2)
    shade = np.clip(1.15 - dist ** 2 * 0.8, 0, 1)
    n = fbm(S, 6, 4, seed + 1)
    tone = 0.30 + 0.42 * shade ** 1.6 + (n - 0.5) * 0.22
    skin[..., 0] = tone * 0.78
    skin[..., 1] = tone * 0.80
    skin[..., 2] = tone * 0.76
    # 핏줄
    veins = np.zeros((S, S))
    vimg = Image.new("L", (S, S), 0)
    vd = ImageDraw.Draw(vimg)
    for _ in range(26):
        x, y = cx + r.normal(0, S * 0.18), cy + r.normal(-S * 0.1, S * 0.2)
        pts = [(x, y)]
        for _k in range(8):
            x += r.normal(0, S * 0.025)
            y += r.normal(S * 0.01, S * 0.02)
            pts.append((x, y))
        vd.line(pts, fill=int(r.integers(60, 140)), width=max(1, S // 400))
    veins = np.asarray(vimg.filter(ImageFilter.GaussianBlur(S * 0.0015))) / 255.0
    skin *= (1 - veins[..., None] * np.array([0.5, 0.6, 0.45]))
    # 눈 주변의 깊은 그늘과 눈물처럼 흘러내린 검은 자국
    dark = Image.new("L", (S, S), 0)
    dd = ImageDraw.Draw(dark)
    for side in (-1, 1):
        ex, ey = cx + side * S * 0.12, cy - S * 0.09
        dd.ellipse([ex - S * 0.15, ey - S * 0.15, ex + S * 0.15, ey + S * 0.17], fill=200)
        x = ex + side * S * 0.01
        for _k in range(3):
            sx = x + r.normal(0, S * 0.03)
            dd.line([(sx, ey), (sx + r.normal(0, S * 0.01), ey + S * r.uniform(0.18, 0.38))], fill=230, width=max(2, S // 70))
    dark = np.asarray(dark.filter(ImageFilter.GaussianBlur(S * 0.02))) / 255.0
    skin *= (1 - dark[..., None] * 0.85)
    m = np.asarray(face) / 255.0
    base = skin * m[..., None]
    out = to_img(base)
    d = ImageDraw.Draw(out)
    # 눈구멍 (크고 비대칭)
    for side, sz in ((-1, 1.0), (1, 1.18)):
        ex, ey = cx + side * S * 0.12, cy - S * 0.09
        w2, h2 = S * 0.085 * sz, S * 0.11 * sz
        pts = []
        for k in range(18):
            a = k / 18 * 2 * np.pi
            rr = 1 + r.normal(0, 0.12)
            pts.append((ex + np.cos(a) * w2 * rr, ey + np.sin(a) * h2 * rr))
        d.polygon(pts, fill=(4, 2, 2))
        # 눈 주변 그늘
        # 바늘 같은 동공
        px, py = ex + side * S * 0.012, ey + S * 0.012
        pr = S * 0.008
        d.ellipse([px - pr, py - pr, px + pr, py + pr], fill=(255, 245, 230))
        d.ellipse([px - pr * 3, py - pr * 3, px + pr * 3, py + pr * 3], outline=(150, 20, 20), width=max(1, S // 300))
    # 콧구멍
    for side in (-1, 1):
        nx, ny = cx + side * S * 0.022, cy + S * 0.07
        d.ellipse([nx - S * 0.012, ny - S * 0.02, nx + S * 0.012, ny + S * 0.01], fill=(20, 10, 10))
    # 찢어진 입 (얼굴 폭보다 넓게)
    mouth = []
    for k in range(41):
        t = k / 40
        x = cx - S * 0.36 + t * S * 0.72
        y = cy + S * 0.2 + np.sin(t * np.pi) * S * 0.035 - (abs(t - 0.5) ** 2) * S * 0.25
        mouth.append((x, y))
    lower = []
    for k in range(40, -1, -1):
        t = k / 40
        x = cx - S * 0.36 + t * S * 0.72
        y = cy + S * 0.2 + np.sin(t * np.pi) * S * 0.16 - (abs(t - 0.5) ** 2) * S * 0.25
        lower.append((x, y))
    d.polygon(mouth + lower, fill=(28, 2, 4))
    # 이빨 (불규칙)
    for k in range(17):
        t = 0.08 + k / 17 * 0.84
        x = cx - S * 0.36 + t * S * 0.72
        top = cy + S * 0.2 + np.sin(t * np.pi) * S * 0.035 - (abs(t - 0.5) ** 2) * S * 0.25
        bot = cy + S * 0.2 + np.sin(t * np.pi) * S * 0.16 - (abs(t - 0.5) ** 2) * S * 0.25
        tw = S * 0.016
        lt = r.uniform(0.25, 0.55) * (bot - top)
        d.polygon([(x - tw, top), (x + tw, top), (x + r.normal(0, tw * 0.3), top + lt)], fill=(205, 196, 170))
        lb = r.uniform(0.2, 0.45) * (bot - top)
        d.polygon([(x - tw, bot), (x + tw, bot), (x + r.normal(0, tw * 0.3), bot - lb)], fill=(190, 180, 150))
    return out


def _glitchify(img, amount, seed):
    r = np.random.default_rng(seed)
    a = np.asarray(img).astype(float) / 255.0
    h, w, _ = a.shape
    # 가로 밀림
    for _ in range(int(14 * amount)):
        y0 = int(r.integers(0, h - 4))
        hh = int(r.integers(2, max(3, h // 18)))
        a[y0:y0 + hh] = np.roll(a[y0:y0 + hh], int(r.integers(-w // 12, w // 12)), axis=1)
    # 색수차
    sh = max(1, w // 160)
    a[..., 0] = np.roll(a[..., 0], sh, axis=1)
    a[..., 2] = np.roll(a[..., 2], -sh, axis=1)
    # 주사선 + 잡음
    a *= (0.82 + 0.18 * (np.arange(h) % 3 != 0))[:, None, None]
    a += (r.random((h, w, 1)) - 0.5) * 0.12
    return to_img(np.clip(a, 0, 1))


def monster_faces():
    big = _face_layer(1024, 666)
    js = _glitchify(big.resize((512, 512), Image.LANCZOS), 1.0, 7)
    js.save(os.path.join(G.OUT, "js_face.bytes"), format="PNG", optimize=True)
    print("   js_face (512, 512)")
    # CRT 화면용 (4:3): 얼굴을 가운데에 크게
    scr = Image.new("RGB", (256, 192), (0, 0, 0))
    f = big.resize((200, 200), Image.LANCZOS)
    scr.paste(f, (28, -6))
    scr = _glitchify(scr, 0.6, 9)
    save(scr, "screen_face")


def monster_skin():
    s = 128
    n = fbm(s, 6, 4, 300)
    v = 0.18 + n * 0.16
    veins = (np.abs(np.sin((G.pnoise(s, 8, 301) * 6 + G.pnoise(s, 16, 302) * 3) * np.pi)) < 0.06).astype(float)
    v -= veins * 0.08
    rgb = colorize(np.clip(v, 0, 1), (0.02, 0.02, 0.025), (0.42, 0.40, 0.42))
    save(to_img(rgb), "monster_skin")


# ---------- 겁쟁이 모드 고양이 ----------

def _cat_face(S):
    img = Image.new("RGB", (S, S), (250, 214, 226))
    d = ImageDraw.Draw(img)
    # 배경 물방울 무늬
    for k in range(18):
        x, y = rng.uniform(0, S), rng.uniform(0, S)
        rr = S * rng.uniform(0.02, 0.05)
        d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=(255, 236, 244))
    cx, cy = S * 0.5, S * 0.56
    gray, white, dark, pink = (176, 176, 186), (246, 246, 244), (60, 60, 70), (246, 150, 170)
    # 귀
    for side in (-1, 1):
        d.polygon([(cx + side * S * 0.36, cy - S * 0.16), (cx + side * S * 0.28, cy - S * 0.47), (cx + side * S * 0.1, cy - S * 0.3)], fill=gray)
        d.polygon([(cx + side * S * 0.31, cy - S * 0.2), (cx + side * S * 0.27, cy - S * 0.39), (cx + side * S * 0.16, cy - S * 0.29)], fill=pink)
    d.ellipse([cx - S * 0.4, cy - S * 0.36, cx + S * 0.4, cy + S * 0.34], fill=gray)
    # 줄무늬
    for k in (-1, 0, 1):
        d.polygon([(cx + k * S * 0.08 - S * 0.02, cy - S * 0.36), (cx + k * S * 0.08 + S * 0.02, cy - S * 0.36), (cx + k * S * 0.06, cy - S * 0.24)], fill=(130, 130, 142))
    d.ellipse([cx - S * 0.22, cy - S * 0.02, cx + S * 0.22, cy + S * 0.3], fill=white)
    # 큰 눈
    for side in (-1, 1):
        ex, ey = cx + side * S * 0.15, cy - S * 0.08
        d.ellipse([ex - S * 0.075, ey - S * 0.09, ex + S * 0.075, ey + S * 0.09], fill=dark)
        d.ellipse([ex - S * 0.035 + side * S * 0.01, ey - S * 0.06, ex + S * 0.005 + side * S * 0.01, ey - S * 0.02], fill=(255, 255, 255))
        d.ellipse([ex + S * 0.02, ey + S * 0.02, ex + S * 0.04, ey + S * 0.04], fill=(255, 255, 255))
    # 코·입 (우이이아이오!)
    d.polygon([(cx - S * 0.03, cy + S * 0.05), (cx + S * 0.03, cy + S * 0.05), (cx, cy + S * 0.085)], fill=pink)
    d.ellipse([cx - S * 0.06, cy + S * 0.1, cx + S * 0.06, cy + S * 0.22], fill=(120, 40, 60))
    d.ellipse([cx - S * 0.035, cy + S * 0.16, cx + S * 0.035, cy + S * 0.21], fill=pink)
    # 수염
    for side in (-1, 1):
        for k in (-1, 0, 1):
            d.line([cx + side * S * 0.12, cy + S * 0.1 + k * S * 0.03, cx + side * S * 0.36, cy + S * 0.07 + k * S * 0.06], fill=dark, width=max(1, S // 170))
    # 볼터치
    for side in (-1, 1):
        bx, by = cx + side * S * 0.25, cy + S * 0.08
        d.ellipse([bx - S * 0.05, by - S * 0.025, bx + S * 0.05, by + S * 0.025], fill=(250, 170, 190))
    return img


def cat_faces():
    big = _cat_face(1024)
    js = big.resize((512, 512), Image.LANCZOS)
    js.save(os.path.join(G.OUT, "js_cat.bytes"), format="PNG", optimize=True)
    print("   js_cat (512, 512)")
    scr = Image.new("RGB", (256, 192), (250, 214, 226))
    scr.paste(big.resize((190, 190), Image.LANCZOS), (33, 1))
    save(scr, "screen_cat")


def main():
    print("추가 텍스처 생성 →", G.OUT)
    notice_en(); badge_en("117", False, "badge117_en"); badge_en("116", True, "badge116_en"); sticky_en()
    sign_room_en(); panel_en(); calendar_en(); exit_sign_en(); screen_117_en()
    monster_faces(); monster_skin(); cat_faces()


if __name__ == "__main__":
    main()
