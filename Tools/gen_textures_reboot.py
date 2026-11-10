#!/usr/bin/env python3
"""
리부트판 텍스처 생성기 (개발 도구). 사용: python3 Tools/gen_textures_reboot.py
  - 새 표지판 (서버실 / 관리자실 / 회의실 / 직원 전용) + 영어판
  - 116 모니터 테두리 메모 (볼펜 미로 선) + 영어판
  - 깨진 화면에 비친 얼굴 (모델), 그것의 전체 화면 (눈 여러 개)
  - 공허 바닥, 서버 랙 앞면
  - 겁쟁이 모드 아저씨 얼굴 (오리지널 만화풍, 실존 인물을 따라 그리지 않음)
gen_textures.py 의 도구를 그대로 쓴다.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
from PIL import Image, ImageDraw, ImageFilter  # noqa: E402

import gen_textures as G  # noqa: E402
from gen_textures import canvas, colorize, dirty, fbm, font, save, to_img  # noqa: E402


# ---------- 표지판 ----------

def _sign(name, big, small, w=256, h=128, bg=(0.16, 0.2, 0.24), fg=(220, 228, 234), sub=(150, 166, 178)):
    img = canvas(w, h, bg)
    d = ImageDraw.Draw(img)
    d.rectangle([4, 4, w - 5, h - 5], outline=(140, 156, 168), width=2)
    size = 40
    while font(size, True).getlength(big) > w - 30 and size > 18:
        size -= 2
    d.text((w / 2, h * 0.42), big, font=font(size, True), fill=fg, anchor="mm")
    if small:
        s2 = 18
        while font(s2).getlength(small) > w - 24 and s2 > 10:
            s2 -= 1
        d.text((w / 2, h * 0.76), small, font=font(s2), fill=sub, anchor="mm")
    save(dirty(img, 0.14, len(name)), name)


def signs():
    _sign("sign_server", "서버실", "관계자 외 출입 금지")
    _sign("sign_server_en", "SERVER ROOM", "AUTHORIZED PERSONNEL ONLY")
    _sign("sign_manager", "관리자실", "야간 감독")
    _sign("sign_manager_en", "MANAGER", "NIGHT SUPERVISION")
    _sign("sign_meeting", "회의실", "4F-M")
    _sign("sign_meeting_en", "MEETING ROOM", "4F-M")
    _sign("sign_staff", "직원 전용", "4F-B · 전원 차단 시 개방", bg=(0.30, 0.10, 0.09), fg=(240, 220, 214), sub=(220, 170, 160))
    _sign("sign_staff_en", "STAFF ONLY", "4F-B · OPENS ON POWER LOSS", bg=(0.30, 0.10, 0.09), fg=(240, 220, 214), sub=(220, 170, 160))


# ---------- 116 메모 (모니터 테두리) ----------

def _note116(name, text):
    w, h = 128, 128
    img = canvas(w, h, (0.93, 0.86, 0.45))
    d = ImageDraw.Draw(img)
    r = np.random.default_rng(116)
    # 볼펜으로 그린 꼬불꼬불한 길 (오른쪽 벽을 따라감)
    pts = [(18, 112)]
    x, y = 18, 112
    for dx, dy in ((70, 0), (0, -26), (-40, 0), (0, -22), (60, 0), (0, -24)):
        x += dx
        y += dy
        pts.append((x + r.normal(0, 1.2), y + r.normal(0, 1.2)))
    d.line(pts, fill=(30, 40, 120), width=3)
    d.ellipse([12, 106, 24, 118], outline=(30, 40, 120), width=2)
    d.rectangle([x - 8, y - 12, x + 10, y - 2], outline=(160, 20, 20), width=2)
    size = 15
    while font(size).getlength(text) > w - 10 and size > 8:
        size -= 1
    d.text((w / 2, 18), text, font=font(size), fill=(30, 40, 120), anchor="mm")
    save(dirty(img, 0.12, 116), name)


def notes():
    _note116("note116", "오른쪽 벽에 붙어")
    _note116("note116_en", "hug the right wall")


# ---------- 화면에 비친 얼굴 (모델) ----------

def reflect_face():
    """흐릿하게 비치는 창백한 얼굴. 알파 채널이 있어 CRT 위에 옅게 겹친다."""
    S = 512
    r = np.random.default_rng(404)
    yy, xx = np.mgrid[0:S, 0:S]
    cx, cy = S * 0.5, S * 0.47
    d = np.sqrt(((xx - cx) / (S * 0.24)) ** 2 + ((yy - cy) / (S * 0.34)) ** 2)
    a = np.clip(1.25 - d ** 2.2, 0, 1)
    n = fbm(S, 5, 4, 405)
    tone = 0.55 + (n - 0.5) * 0.25
    # 눈구멍 (아주 어둡게), 입은 가늘게 벌어짐
    for side in (-1, 1):
        ex, ey = cx + side * S * 0.085, cy - S * 0.04
        de = np.sqrt(((xx - ex) / (S * 0.05)) ** 2 + ((yy - ey) / (S * 0.06)) ** 2)
        tone = tone * np.clip(de ** 1.5, 0.05, 1)
    dm = np.sqrt(((xx - cx) / (S * 0.07)) ** 2 + ((yy - (cy + S * 0.17)) / (S * 0.018)) ** 2)
    tone = tone * np.clip(dm ** 1.3, 0.1, 1)
    rgb = np.stack([tone * 0.80, tone * 0.88, tone * 0.95], -1)
    alpha = (a * 0.85 * np.clip(0.6 + n * 0.6, 0, 1))
    rgba = np.concatenate([rgb, alpha[..., None]], -1)
    img = Image.fromarray(np.clip(rgba * 255, 0, 255).astype(np.uint8), "RGBA").filter(ImageFilter.GaussianBlur(2.2))
    img = img.resize((256, 256), Image.LANCZOS)
    os.makedirs(G.OUT, exist_ok=True)
    img.save(os.path.join(G.OUT, "reflect_face.bytes"), format="PNG", optimize=True)
    print("   reflect_face (256, 256)")


# ---------- 그것: 전체 화면 (처형 깜짝 장면) ----------

def entity_full():
    S = 1024
    r = np.random.default_rng(1117)
    img = Image.new("RGB", (S, S), (0, 0, 0))
    d = ImageDraw.Draw(img)
    # 가운데로 덮쳐 오는 검은 형체 (아주 짙은 회색 → 검정)
    sil = Image.new("L", (S, S), 0)
    sd = ImageDraw.Draw(sil)
    sd.ellipse([S * 0.18, S * 0.02, S * 0.82, S * 1.25], fill=255)
    sil = sil.filter(ImageFilter.GaussianBlur(S * 0.05))
    base = np.asarray(sil) / 255.0
    n = fbm(S, 6, 4, 1118)
    body = base * (0.06 + n * 0.08)
    arr = np.stack([body * 0.8, body * 0.85, body], -1)
    img = to_img(arr)
    d = ImageDraw.Draw(img)
    # 눈: 가운데 큰 한 쌍 + 사방의 작은 눈들
    def eye(x, y, s, glow):
        for k in range(4, 0, -1):
            rad = s * (1 + k * 0.35)
            c = int(glow * 9 / k)
            d.ellipse([x - rad, y - rad * 0.55, x + rad, y + rad * 0.55], fill=(c, c, int(c * 1.2)))
        d.ellipse([x - s, y - s * 0.55, x + s, y + s * 0.55], fill=(235, 240, 255))
        d.ellipse([x - s * 0.22, y - s * 0.45, x + s * 0.22, y + s * 0.45], fill=(0, 0, 0))
    eye(S * 0.40, S * 0.40, S * 0.085, 6)
    eye(S * 0.60, S * 0.40, S * 0.085, 6)
    for _ in range(46):
        x, y = r.uniform(0.04, 0.96) * S, r.uniform(0.04, 0.96) * S
        if abs(x - S * 0.5) < S * 0.2 and abs(y - S * 0.4) < S * 0.1:
            continue
        s = r.uniform(0.008, 0.03) * S
        eye(x, y, s, 3)
        eye(x + s * 2.6, y + r.normal(0, s * 0.2), s, 3)
    img = img.filter(ImageFilter.GaussianBlur(0.8)).resize((512, 512), Image.LANCZOS)
    os.makedirs(G.OUT, exist_ok=True)
    img.save(os.path.join(G.OUT, "js_entity.bytes"), format="PNG", optimize=True)
    print("   js_entity (512, 512)")


# ---------- 공허 바닥, 서버 랙 ----------

def void_floor():
    s = 128
    n = fbm(s, 4, 4, 900)
    v = 0.12 + n * 0.12
    a = to_img(colorize(np.clip(v, 0, 1), (0.0, 0.0, 0.0), (0.5, 0.52, 0.56)))
    d = ImageDraw.Draw(a)
    d.line([(0, 0), (s - 1, 0)], fill=(96, 104, 122), width=1)
    d.line([(0, 0), (0, s - 1)], fill=(96, 104, 122), width=1)
    save(a, "void_floor")


def rack_front():
    w, h = 128, 256
    img = canvas(w, h, (0.07, 0.08, 0.09))
    d = ImageDraw.Draw(img)
    r = np.random.default_rng(55)
    for k in range(12):
        y = 10 + k * 20
        d.rectangle([8, y, w - 9, y + 15], fill=(26, 29, 33), outline=(44, 48, 54))
        for j in range(6):
            d.line([(40 + j * 12, y + 4), (40 + j * 12, y + 11)], fill=(12, 13, 15), width=2)
        c = [(40, 220, 90), (230, 160, 40), (40, 220, 90), (200, 40, 40)][int(r.integers(0, 4))]
        d.rectangle([14, y + 5, 19, y + 9], fill=c)
    save(img, "rack_front")


# ---------- 겁쟁이 모드: 춤추는 아저씨 얼굴 (오리지널 만화풍) ----------

def uncle_face():
    """민머리, 굵은 눈썹, 동그란 눈, 크게 벌린 입. 실존 인물을 따라 그리지 않은 만화 얼굴."""
    S = 1024
    img = Image.new("RGB", (S, S), (176, 226, 214))  # 민트 배경
    d = ImageDraw.Draw(img)
    # 배경 동심원 (집중선 느낌)
    for k in range(14, 0, -1):
        c = (176 + k * 3, 226 - k * 2, 214 + k * 2)
        d.ellipse([S / 2 - k * 52, S / 2 - k * 52, S / 2 + k * 52, S / 2 + k * 52], outline=c, width=10)
    cx, cy = S * 0.5, S * 0.52
    skin, line = (238, 196, 160), (70, 44, 32)
    # 머리 (민머리) + 귀
    d.ellipse([cx - 300, cy - 330, cx + 300, cy + 300], fill=skin, outline=line, width=10)
    for s in (-1, 1):
        d.ellipse([cx + s * 300 - 46, cy - 40, cx + s * 300 + 46, cy + 80], fill=skin, outline=line, width=8)
    # 머리 광택
    d.ellipse([cx - 150, cy - 300, cx + 20, cy - 230], fill=(250, 222, 196))
    # 굵은 눈썹 (치켜올림)
    for s in (-1, 1):
        d.line([(cx + s * 70, cy - 120), (cx + s * 210, cy - 165)], fill=line, width=34)
    # 동그란 눈
    for s in (-1, 1):
        ex = cx + s * 135
        d.ellipse([ex - 62, cy - 100, ex + 62, cy + 20], fill=(255, 255, 255), outline=line, width=8)
        d.ellipse([ex - 26, cy - 62, ex + 26, cy - 10], fill=(30, 22, 18))
        d.ellipse([ex - 12, cy - 56, ex, cy - 44], fill=(255, 255, 255))
    # 볼 홍조
    for s in (-1, 1):
        d.ellipse([cx + s * 210 - 50, cy + 40, cx + s * 210 + 50, cy + 90], fill=(244, 160, 150))
    # 크게 벌린 입 ("샨센부!")
    d.ellipse([cx - 110, cy + 60, cx + 110, cy + 230], fill=(120, 30, 40), outline=line, width=10)
    d.ellipse([cx - 60, cy + 150, cx + 60, cy + 222], fill=(230, 110, 120))
    d.rectangle([cx - 70, cy + 64, cx + 70, cy + 92], fill=(255, 255, 255))
    # 아이보리 V넥 옷깃
    d.polygon([(cx - 330, S), (cx - 150, cy + 290), (cx, cy + 420), (cx + 150, cy + 290), (cx + 330, S)], fill=(240, 232, 212), outline=line)
    d.polygon([(cx - 90, cy + 300), (cx, cy + 420), (cx + 90, cy + 300)], fill=skin)
    img = img.resize((512, 512), Image.LANCZOS)
    os.makedirs(G.OUT, exist_ok=True)
    img.save(os.path.join(G.OUT, "js_uncle.bytes"), format="PNG", optimize=True)
    print("   js_uncle (512, 512)")
    # 3D 모델 얼굴용 (머리 앞면에 붙이는 작은 텍스처)
    face = img.crop((96, 96, 416, 416)).resize((128, 128), Image.LANCZOS)
    save(face, "uncle_face")


def main():
    print("리부트 텍스처 →", G.OUT)
    signs()
    notes()
    reflect_face()
    entity_full()
    void_floor()
    rack_front()
    uncle_face()


if __name__ == "__main__":
    main()
