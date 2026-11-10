#!/usr/bin/env python3
"""넓힌 4층 배치(office_layout.json)를 만든다. docs/floorplan_v1.png 와 같은 구조.

좌표: 미터, pos = [x, z]. x+ = 동쪽, z+ = 북쪽(창문). 건물은 x -15..15, z -10..10 (30×20m).
- 남쪽 띠(z -10..-4): 엘리베이터 홀(시작), 관리자실(CCTV), 회의실(유리벽, 안쪽에 숨은 직원용 문)
- 가운데: 칸막이 구역 A(서쪽, 117 자리) · 가운데 통로 · 칸막이 구역 B(동쪽)
- 북서쪽 비상구 통로(탈출), 북동쪽 서버실(감독관 등장), 회의실 동쪽 벽 너머 = 공허
"""
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "Assets/Resources/Data/office_layout.json")

H_OFFICE, H_ROOM, H_CORR = 2.8, 2.7, 2.6

L = {
    "spawn": {"pos": [-11.0, -8.3], "yaw": 0},
    "deskStand": {"pos": [-5.6, 4.25], "yaw": 0},
    "titleCam": {"pos": [-0.6, 2.05, 9.1], "look": [-6.2, 0.85, 3.6]},
    "supSpawn": [13.4, 7.6],
    "exitPoint": [-13.5, 9.15],
    "voidPoint": [24.0, -8.0],
    "fog": 0.062,
}

L["floors"] = [
    {"id": "office", "min": [-12, -4], "max": [12, 10], "mat": "carpet", "ceiling": H_OFFICE, "ceilMat": "ceiling"},
    {"id": "aisleW", "min": [-15, -4], "max": [-12, -2], "mat": "carpet", "ceiling": H_OFFICE, "ceilMat": "ceiling"},
    {"id": "eastEnd", "min": [12, -4], "max": [15, 2], "mat": "carpet", "ceiling": H_OFFICE, "ceilMat": "ceiling"},
    {"id": "corridor", "min": [-15, -2], "max": [-12, 10], "mat": "floor_tile", "ceiling": H_CORR, "ceilMat": "ceiling_dark"},
    {"id": "landing", "min": [-14.6, 10], "max": [-12.4, 12], "mat": "floor_tile", "ceiling": H_CORR, "ceilMat": "ceiling_dark"},
    {"id": "hall", "min": [-15, -10], "max": [-7, -4], "mat": "floor_tile", "ceiling": H_ROOM, "ceilMat": "ceiling_dark"},
    {"id": "manager", "min": [-4, -10], "max": [3, -4], "mat": "carpet", "ceiling": H_ROOM, "ceilMat": "ceiling"},
    {"id": "meeting", "min": [5, -10], "max": [12, -4], "mat": "carpet", "ceiling": H_ROOM, "ceilMat": "ceiling_dark"},
    {"id": "server", "min": [12, 2], "max": [15, 10], "mat": "floor_tile", "ceiling": H_OFFICE, "ceilMat": "ceiling_dark"},
    {"id": "void", "min": [12, -14], "max": [30, -4], "mat": "void_floor", "ceilMat": "none", "void": True},
]

def op(c, w, y0=0.0, y1=2.1, **kw):
    d = {"c": round(c, 3), "w": w, "y0": y0, "y1": y1}
    d.update(kw)
    return d

# 북쪽 외벽 창문: 구역 A 3개, 구역 B 3개
win_x = [-10.0, -7.0, -4.0, 3.0, 6.0, 9.0]
north_ops = [op(1.5, 1.0)]  # 비상구 문 (x -14..-13)
for i, x in enumerate(win_x):
    north_ops.append(op(x + 15, 1.8, 0.9, 2.2, window="Window%d" % (i + 1)))

L["walls"] = [
    # 외벽
    {"a": [-15, 10], "b": [15, 10], "h": H_OFFICE, "mat": "wall", "openings": north_ops},
    {"a": [15, -4], "b": [15, 10], "h": H_OFFICE, "mat": "wall"},
    {"a": [-15, -10], "b": [12, -10], "h": H_ROOM, "mat": "wall"},
    {"a": [-15, -10], "b": [-15, 10], "h": H_OFFICE, "mat": "wall"},
    # 남쪽 방들의 북쪽 벽 (= 남쪽 통로 벽)
    {"a": [-15, -4], "b": [-7, -4], "h": H_OFFICE, "mat": "wall", "openings": [op(4.0, 1.0)]},
    {"a": [-7, -4], "b": [-4, -4], "h": H_OFFICE, "mat": "wall"},
    {"a": [-4, -4], "b": [3, -4], "h": H_OFFICE, "mat": "wall", "openings": [op(1.5, 1.0), op(4.75, 3.5, 1.0, 2.2, glass=True)]},
    {"a": [3, -4], "b": [5, -4], "h": H_OFFICE, "mat": "wall"},
    {"a": [5, -4], "b": [12, -4], "h": H_OFFICE, "mat": "wall", "openings": [op(1.0, 1.0), op(4.25, 5.1, 0.12, 2.45, glass=True)]},
    {"a": [12, -4], "b": [15, -4], "h": H_OFFICE, "mat": "wall"},
    # 방 칸막이 벽
    {"a": [-7, -10], "b": [-7, -4], "h": H_ROOM, "mat": "wall_dark"},
    {"a": [-4, -10], "b": [-4, -4], "h": H_ROOM, "mat": "wall"},
    {"a": [3, -10], "b": [3, -4], "h": H_ROOM, "mat": "wall"},
    {"a": [5, -10], "b": [5, -4], "h": H_ROOM, "mat": "wall"},
    {"a": [12, -10], "b": [12, -4], "h": H_ROOM, "mat": "wall", "openings": [op(3.0, 1.0)]},  # 숨은 직원용 문
    # 비상구 통로
    {"a": [-12, -2], "b": [-12, 10], "h": H_OFFICE, "mat": "wall_dark"},
    {"a": [-15, -2], "b": [-12, -2], "h": H_OFFICE, "mat": "wall_dark", "openings": [op(1.5, 1.2, 0.0, 2.2)]},
    {"a": [-14.6, 10], "b": [-14.6, 12], "h": H_CORR, "mat": "wall_dark"},
    {"a": [-12.4, 10], "b": [-12.4, 12], "h": H_CORR, "mat": "wall_dark"},
    {"a": [-14.6, 12], "b": [-12.4, 12], "h": H_CORR, "mat": "wall_dark"},
    # 서버실
    {"a": [12, 2], "b": [12, 10], "h": H_OFFICE, "mat": "wall_dark", "openings": [op(1.5, 1.0)]},
    {"a": [12, 2], "b": [15, 2], "h": H_OFFICE, "mat": "wall_dark"},
]

L["doors"] = [
    {"id": "FrontDoor", "hinge": [-11.5, -4], "dir": "x", "width": 1.0, "openYaw": -95, "locked": False, "reader": True, "mat": "door"},
    {"id": "ManagerDoor", "hinge": [-3, -4], "dir": "x", "width": 1.0, "openYaw": 95, "locked": False, "mat": "door", "open": 0.75},
    {"id": "MeetDoor", "hinge": [5.5, -4], "dir": "x", "width": 1.0, "openYaw": 95, "locked": False, "mat": "door"},
    {"id": "StaffDoor", "hinge": [12, -7.5], "dir": "z", "width": 1.0, "openYaw": 90, "locked": True, "mat": "door_staff", "handle": False},
    {"id": "ServerDoor", "hinge": [12, 3], "dir": "z", "width": 1.0, "openYaw": -95, "locked": True, "mat": "door"},
    {"id": "ExitDoor", "hinge": [-14, 10], "dir": "x", "width": 1.0, "openYaw": -95, "locked": True, "mat": "door_exit", "pushbar": True},
]

# 조명 (개수 고정). dead = 고장난 등기구(빛 없음)
L["lights"] = [
    {"id": "LH", "pos": [-11, -7], "ceiling": H_ROOM, "group": "hall", "level": 0.9},
    {"id": "LS1", "pos": [-9, -2.75], "group": "aisle", "level": 0.75},
    {"id": "LS2", "pos": [-1.5, -2.75], "group": "aisle", "level": 0.7},
    {"id": "LS3", "pos": [7.5, -2.75], "group": "aisle", "level": 0.55, "flicker": True},
    {"id": "LA1", "pos": [-9.2, 6.4], "group": "zoneA", "level": 0.5, "flicker": True},
    {"id": "LA2", "pos": [-4.7, 2.0], "group": "zoneA", "level": 0.62},
    {"id": "LB1", "pos": [3.5, 6.4], "group": "zoneB", "level": 0.45},
    {"id": "LB2", "pos": [8.2, 2.2], "group": "zoneB", "level": 0.5, "flicker": True},
    {"id": "LE", "pos": [-13.5, 4.0], "ceiling": H_CORR, "group": "corridor", "level": 0.42, "flicker": True},
    {"id": "LM", "pos": [-0.5, -7.0], "ceiling": H_ROOM, "group": "manager", "level": 0.55},
    {"id": "LSV", "pos": [13.6, 6.0], "y": 0.9, "group": "server", "level": 1.0, "fixture": False, "color": [1.0, 0.16, 0.1], "base": 1.6, "range": 5.5},
    {"id": "LX1", "pos": [-4.7, 7.6], "dead": True},
    {"id": "LX2", "pos": [-9.2, 1.8], "dead": True},
    {"id": "LX3", "pos": [8.2, 7.4], "dead": True},
    {"id": "LX4", "pos": [3.5, 1.6], "dead": True},
    {"id": "LX5", "pos": [0.0, 4.4], "dead": True},
    {"id": "LX6", "pos": [8.5, -7.0], "ceiling": H_ROOM, "dead": True},
    {"id": "LX7", "pos": [13.5, -1.0], "dead": True},
]

props = []

def desk(i, x, z, **kw):
    d = {"type": "desk", "id": i, "pos": [x, z], "rot": 0, "crt": "dead", "chair": True, "partition": True}
    d.update(kw)
    props.append(d)

# 칸막이 구역 A (북쪽을 보고 앉는다). 117 = 둘째 줄 셋째 칸, 116 = 바로 오른쪽
colsA = [-10.3, -8.5, -5.6, -3.8]
rows = [8.0, 5.6, 3.2, 0.8]
for r, z in enumerate(rows):
    for c, x in enumerate(colsA):
        key = "A%d%d" % (r + 1, c + 1)
        if (r, c) == (1, 2):
            desk("PlayerDesk", x, z, crt="live", partition=False, pc=True, pedestal=True,
                 items=["badge117", "sticky", "mug", "papers", "powerstrip"])
        elif (r, c) == (1, 3):
            desk("Desk116", x, z, pc=True, pedestal=True, drawer="Drawer116", glow=True, chairOffset=[0.3, -0.9], chairRot=35, chairDynamic=True,
                 items=["mug", "note116"])
        else:
            kw = {}
            if (r + c) % 3 == 0: kw["pc"] = True
            if (r, c) in ((0, 1), (3, 0)): kw["crt"] = "none"; kw["items"] = ["boxes"]
            if (r, c) == (2, 1): kw["chairOffset"] = [0.25, -0.8]; kw["chairRot"] = 25
            if (r, c) == (3, 3): kw["chair"] = False; kw["items"] = ["papers"]
            if (r, c) == (2, 3): kw["items"] = ["papers"]
            desk(key, x, z, **kw)

# 칸막이 구역 B
colsB = [2.6, 4.4, 7.3, 9.1]
for r, z in enumerate(rows[:3]):
    for c, x in enumerate(colsB):
        key = "B%d%d" % (r + 1, c + 1)
        kw = {}
        if (r, c) == (0, 3): continue  # 빈자리
        if (r * 2 + c) % 3 == 1: kw["pc"] = True
        if (r, c) == (1, 0): kw["crt"] = "none"; kw["items"] = ["boxes"]
        if (r, c) == (2, 2): kw["chairOffset"] = [-0.3, -0.85]; kw["chairRot"] = -30
        if (r, c) == (1, 3): kw["chair"] = False
        desk(key, x, z, **kw)

props += [
    # 가운데 통로: 프린터 섬, 정수기
    {"type": "printer", "id": "Printer", "pos": [-0.9, 3.0], "rot": 90},
    {"type": "cooler", "id": "Cooler", "pos": [-0.9, 6.6], "rot": 90},
    {"type": "boxes", "pos": [0.8, 8.9], "rot": 12},
    {"type": "cabinet", "pos": [-11.62, 4.6], "rot": -90},
    {"type": "cabinet", "pos": [-11.62, 5.1], "rot": -90},
    {"type": "cabinet", "pos": [11.62, 6.0], "rot": 90},
    {"type": "boxes", "pos": [11.3, 8.6], "rot": -20},
    {"type": "boxes", "pos": [-13.9, -3.4], "rot": 8},
    # 추격 때 쓰러지는 캐비닛 (탈출로: 남쪽 통로 서쪽 → 비상구 통로)
    {"type": "cabinet", "id": "FallCab1", "pos": [-9.6, -3.62], "rot": 180, "fall": True},
    {"type": "cabinet", "id": "FallCab2", "pos": [-12.36, 2.6], "rot": 90, "fall": True},
    {"type": "cabinet", "id": "FallCab3", "pos": [-14.64, 6.2], "rot": -90, "fall": True},
    # 관리자실
    {"type": "supervisor", "id": "SupDesk", "pos": [-3.3, -7.0], "rot": -90},
    {"type": "cabinet", "id": "FileCab", "pos": [2.62, -8.6], "rot": 90},
    {"type": "cabinet", "pos": [2.62, -8.1], "rot": 90},
    {"type": "cabinet", "pos": [2.62, -7.6], "rot": 90},
    {"type": "decal", "id": "Notice", "tex": "notice", "pos": [-0.6, -9.915], "y": 1.45, "rot": 180, "size": [0.4, 0.6], "hit": True},
    {"type": "decal", "id": "Calendar", "tex": "calendar", "pos": [0.6, -9.915], "y": 1.55, "rot": 180, "size": [0.3, 0.45], "hit": True},
    # 회의실
    {"type": "table", "id": "MeetTable", "pos": [8.5, -7.0], "rot": 0, "size": [3.2, 1.2], "chairs": 6},
    {"type": "decal", "tex": "sign_staff", "pos": [11.915, -6.05], "y": 1.55, "rot": 90, "size": [0.42, 0.21]},
    {"type": "projector", "id": "Projector", "pos": [8.9, -7.0], "y": 0.76, "rot": -90, "screen": {"pos": [5.09, -7.0], "y": 1.45, "rot": 90, "size": [2.2, 1.25]}},
    # 엘리베이터 홀
    {"type": "elevator", "pos": [-13.2, -9.92], "rot": 0},
    {"type": "elevator", "pos": [-9.4, -9.92], "rot": 0},
    {"type": "decal", "tex": "sign_room", "pos": [-9.7, -4.085], "y": 1.7, "rot": 0, "size": [0.46, 0.23]},
    # 방 표지판 (통로 쪽에서 보이게)
    {"type": "decal", "tex": "sign_manager", "pos": [-1.6, -3.915], "y": 2.35, "rot": 180, "size": [0.46, 0.23]},
    {"type": "decal", "tex": "sign_meeting", "pos": [5.0, -3.915], "y": 2.35, "rot": 180, "size": [0.46, 0.23]},
    {"type": "decal", "tex": "sign_server", "pos": [11.915, 4.55], "y": 1.75, "rot": -90, "size": [0.46, 0.23]},
    # 벽시계: 117 자리에서 고개를 들면 보이는 북쪽 벽 (창문 사이)
    {"type": "clock", "id": "Clock", "pos": [-5.5, 9.9], "y": 2.25, "rot": 0},
    {"type": "panel", "id": "LightPanel", "pos": [-11.93, 1.2], "y": 1.35, "rot": 90},
    # 비상구 표시
    {"type": "exitsign", "pos": [-13.5, -1.92], "y": 2.4, "rot": 180, "light": False},
    {"type": "exitsign", "pos": [-13.5, 9.9], "y": 2.32, "rot": 0, "light": True},
    # 서버실 랙
    {"type": "rack", "pos": [14.55, 9.0], "rot": 90},
    {"type": "rack", "pos": [14.55, 7.7], "rot": 90},
    {"type": "rack", "pos": [14.55, 5.2], "rot": 90},
    {"type": "rack", "pos": [12.6, 9.2], "rot": -90},
    {"type": "rack", "pos": [12.6, 7.9], "rot": -90},
    # CCTV: CAM1 구역 A, CAM2 관리자실(뒤에서 본다), CAM3 서버실
    {"type": "cctv", "id": "CAM1", "pos": [-1.2, 9.6], "y": H_OFFICE, "look": [-5.6, 1.0, 5.0]},
    {"type": "cctv", "id": "CAM2", "pos": [-3.7, -4.35], "y": H_ROOM, "look": [-1.9, 1.1, -7.2]},
    {"type": "cctv", "id": "CAM3", "pos": [12.35, 2.4], "y": H_OFFICE, "look": [13.6, 1.3, 7.6]},
]
L["props"] = props

L["holes"] = [[-7.2, 7.0], [5.6, 4.2], [-1.5, 0.6], [10.6, -1.0]]
L["cables"] = [
    {"hang": [-7.2, 7.0], "len": 0.95}, {"hang": [-7.0, 7.1], "len": 0.7},
    {"hang": [5.6, 4.2], "len": 1.05}, {"hang": [-1.5, 0.6], "len": 0.6}, {"hang": [10.6, -1.0], "len": 1.2},
    {"a": [-9.2, 2.77, 6.4], "b": [-4.7, 2.77, 7.6], "sag": 0.35},
    {"a": [-4.7, 2.77, 2.0], "b": [-1.2, 2.77, 9.6], "sag": 0.5},
    {"a": [3.5, 2.77, 6.4], "b": [8.2, 2.77, 7.4], "sag": 0.4},
    {"floor": [[-6.3, 5.75], [-6.6, 6.2], [-7.2, 6.4]]},
    {"floor": [[-0.5, 3.4], [0.2, 3.9], [0.6, 4.8]]},
]
L["backdrop"] = {"pos": [0, 23], "width": 70, "height": 24, "y": -2}
L["moon"] = {"dir": [0.35, -0.55, -1.0], "center": [0, 1.4, 1.0], "extent": 21}

text = "// 야간 평가실 — 넓힌 4층 배치 (Tools/gen_layout_reboot.py 로 생성). 단위: 미터, pos = [x, z], x+ 동쪽 · z+ 북쪽.\n"
def dump(v):
    return json.dumps(v, ensure_ascii=False, separators=(", ", ": "))

parts = []
for k, v in L.items():
    if isinstance(v, list) and v and isinstance(v[0], dict):
        parts.append('  "%s": [\n' % k + ",\n".join("    " + dump(x) for x in v) + "\n  ]")
    else:
        parts.append('  "%s": %s' % (k, dump(v)))
text += "{\n" + ",\n".join(parts) + "\n}"
json.loads(text.split("\n", 1)[1])
open(OUT, "w", encoding="utf-8").write(text + "\n")
print("wrote", OUT, len(props), "props")
