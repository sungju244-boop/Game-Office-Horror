#!/usr/bin/env python3
"""
레이아웃 검사 (개발 도구): office_layout.json 을 위에서 본 지도로 그리고,
플레이어 반지름(0.3m)을 고려해 시작점에서 모든 확인 지점·비상구까지 걸어갈 수 있는지 검사한다.
사용: python3 Tools/check_layout.py [출력.png]
"""
import json
import math
import os
import re
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
LAYOUT = os.path.join(ROOT, "Assets", "Resources", "Data", "office_layout.json")
RES = 0.05            # 5cm 격자
RADIUS = 0.30         # CharacterController 반지름
WALL = 0.15
X0, X1, Z0, Z1 = -8.0, 8.0, -8.5, 14.0


def load():
    text = open(LAYOUT, encoding="utf-8").read()
    text = re.sub(r"^\s*//.*$", "", text, flags=re.M)
    return json.loads(text)


def rot(dx, dz, yaw):
    # Unity: Euler(0,yaw,0) * (x,0,z) = (x cos + z sin, -x sin + z cos)
    r = math.radians(yaw)
    return dx * math.cos(r) + dz * math.sin(r), -dx * math.sin(r) + dz * math.cos(r)


class Grid:
    def __init__(self):
        self.w = int((X1 - X0) / RES)
        self.h = int((Z1 - Z0) / RES)
        self.block = np.zeros((self.h, self.w), bool)
        self.floor = np.zeros((self.h, self.w), bool)

    def cell(self, x, z):
        return int((z - Z0) / RES), int((x - X0) / RES)

    def rect(self, cx, cz, sx, sz, yaw, target):
        # 회전 사각형을 칠한다
        hx, hz = sx / 2, sz / 2
        corners = [rot(px, pz, yaw) for px, pz in ((-hx, -hz), (hx, -hz), (hx, hz), (-hx, hz))]
        xs = [cx + c[0] for c in corners]
        zs = [cz + c[1] for c in corners]
        i0, j0 = self.cell(min(xs), min(zs))[1], self.cell(min(xs), min(zs))[0]
        i1, j1 = self.cell(max(xs), max(zs))[1], self.cell(max(xs), max(zs))[0]
        for j in range(max(0, j0), min(self.h, j1 + 1)):
            for i in range(max(0, i0), min(self.w, i1 + 1)):
                x = X0 + (i + 0.5) * RES - cx
                z = Z0 + (j + 0.5) * RES - cz
                lx, lz = rot(x, z, -yaw)
                if abs(lx) <= hx and abs(lz) <= hz:
                    target[j, i] = True


def build(L, scenario):
    g = Grid()
    for f in L["floors"]:
        (ax, az), (bx, bz) = f["min"], f["max"]
        g.rect((ax + bx) / 2, (az + bz) / 2, bx - ax, bz - az, 0, g.floor)
    for wdef in L["walls"]:
        (ax, az), (bx, bz) = wdef["a"], wdef["b"]
        length = math.hypot(bx - ax, bz - az)
        dx, dz = (bx - ax) / length, (bz - az) / length
        along_x = abs(dx) > abs(dz)
        gaps = sorted([(o["c"] - o["w"] / 2, o["c"] + o["w"] / 2) for o in wdef.get("openings", []) if o.get("y0", 0) < 0.01])
        s = 0.0
        pieces = []
        for g0, g1 in gaps:
            if g0 > s:
                pieces.append((s, g0))
            s = g1
        if length > s:
            pieces.append((s, length))
        for s0, s1 in pieces:
            cx, cz = ax + dx * (s0 + s1) / 2, az + dz * (s0 + s1) / 2
            if along_x:
                g.rect(cx, cz, s1 - s0, WALL, 0, g.block)
            else:
                g.rect(cx, cz, WALL, s1 - s0, 0, g.block)
    for d in L["doors"]:
        hx, hz = d["hinge"]
        w = d.get("width", 1.0)
        is_open = scenario.get(d["id"], False)
        if not is_open:
            g.rect(hx + w / 2, hz, w, 0.05, 0, g.block)
    for p in L["props"]:
        t = p["type"]
        x, z = p["pos"]
        yaw = p.get("rot", 0)
        if t in ("desk", "supervisor"):
            part = p.get("partition", False)
            ox, oz = rot(0, 0.04, yaw)
            g.rect(x + ox, z + oz, 1.4, 0.8 if part else 0.72, yaw, g.block)
            if p.get("chair", False):
                off = p.get("chairOffset", [0, -0.62])
                cx, cz = rot(off[0], off[1], yaw)
                g.rect(x + cx, z + cz, 0.5, 0.5, yaw + p.get("chairRot", 0), g.block)
        elif t == "cabinet":
            g.rect(x, z, 0.46, 0.62, yaw, g.block)
        elif t == "cooler":
            g.rect(x, z, 0.34, 0.34, yaw, g.block)
        elif t == "boxes":
            ox, oz = rot(0.02, -0.18, yaw)
            g.rect(x + ox, z + oz, 0.6, 0.82, yaw, g.block)
    walk = g.floor & ~g.block
    # 반지름만큼 장애물을 키운다
    from scipy import ndimage
    r = int(math.ceil(RADIUS / RES))
    yy, xx = np.mgrid[-r:r + 1, -r:r + 1]
    disk = (xx ** 2 + yy ** 2) <= r * r
    blocked = ndimage.binary_dilation(~walk, structure=disk)
    return g, ~blocked


def bfs(free, start):
    h, w = free.shape
    dist = np.full((h, w), -1, int)
    q = deque([start])
    dist[start] = 0
    while q:
        j, i = q.popleft()
        for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nj, ni = j + dj, i + di
            if 0 <= nj < h and 0 <= ni < w and free[nj, ni] and dist[nj, ni] < 0:
                dist[nj, ni] = dist[j, i] + 1
                q.append((nj, ni))
    return dist


def nearest_reach(g, dist, x, z, max_r=2.0):
    """대상 (x,z) 에서 max_r 이내에 도달 가능한 칸이 있는지 (상호작용 거리)."""
    j0, i0 = g.cell(x, z)
    r = int(max_r / RES)
    best = None
    for j in range(max(0, j0 - r), min(g.h, j0 + r + 1)):
        for i in range(max(0, i0 - r), min(g.w, i0 + r + 1)):
            if dist[j, i] >= 0:
                d = math.hypot((j - j0) * RES, (i - i0) * RES)
                if d <= max_r and (best is None or d < best[0]):
                    best = (d, dist[j, i] * RES)
    return best


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "Tools", "_out", "layout_map.png")
    L = load()
    scenarios = {
        "시작 (뒤쪽 문 잠김)": {},
        "뒤쪽 문 열림 (기록1 피드백 후)": {"BackDoor": True},
        "추격 (뒤쪽 문 열림)": {"BackDoor": True, "FrontDoor": True},
    }
    targets = {
        "자리(컴퓨터)": ((-4.65, -4.3), 1.6),
        "뒤쪽 문": ((5.0, 5.0), 1.4),
        "입구 문": ((-1.5, -5.0), 1.4),
        "조명 패널": ((-6.93, -1.05), 1.4),
        "감독석 모니터": ((-6.35, 2.2), 1.6),
        "감독석 전화": ((-6.18, 2.72), 1.6),
        "116번 자리": ((2.7, 3.6), 1.4),
        "꺼진 모니터(D12)": ((-2.45, -1.02), 1.5),
        "창문": ((7.0, 0.0), 1.4),
        "벽시계": ((-6.9, -2.0), 1.8),
        "비상구": ((5.0, 12.55), 1.2),
    }
    sx, sz = L["spawn"]["pos"]
    ok = True
    for name, sc in scenarios.items():
        g, free = build(L, sc)
        start = g.cell(sx, sz)
        if not free[start]:
            print("오류: 시작 지점이 막혀 있음")
            return 1
        dist = bfs(free, start)
        print("[" + name + "]")
        for tname, ((tx, tz), reach) in targets.items():
            res = nearest_reach(g, dist, tx, tz, reach)
            need = (tname == "비상구" and "추격" in name) or (tname not in ("비상구",) and not (tname == "116번 자리" and False))
            if tname == "비상구" and "추격" not in name:
                status = "도달 가능" if res else "도달 불가 (정상: 문이 잠김)"
            else:
                status = ("도달 가능 (걷는 거리 %.1fm, 대상까지 %.2fm)" % (res[1], res[0])) if res else "도달 불가!"
                if not res:
                    ok = False
            print("  %-16s %s" % (tname, status))
        if "추격" in name:
            img = Image.new("RGB", (g.w, g.h), (18, 18, 22))
            px = img.load()
            for j in range(g.h):
                for i in range(g.w):
                    if g.block[j, i]:
                        px[i, j] = (200, 200, 210)
                    elif g.floor[j, i] and free[j, i]:
                        v = dist[j, i]
                        px[i, j] = (40, 70 + min(150, v // 6), 90) if v >= 0 else (90, 40, 40)
                    elif g.floor[j, i]:
                        px[i, j] = (60, 60, 70)
            img = img.transpose(Image.FLIP_TOP_BOTTOM).resize((g.w * 2, g.h * 2), Image.NEAREST)
            d = ImageDraw.Draw(img)

            def mark(x, z, col):
                j, i = g.cell(x, z)
                cx, cy = i * 2, (g.h - j) * 2
                d.ellipse([cx - 6, cy - 6, cx + 6, cy + 6], outline=col, width=3)

            mark(sx, sz, (80, 200, 255))
            for tname, ((tx, tz), _) in targets.items():
                mark(tx, tz, (255, 200, 60))
            os.makedirs(os.path.dirname(out), exist_ok=True)
            img.save(out)
            print("지도 저장:", out)
    print("결과:", "통과" if ok else "실패")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
