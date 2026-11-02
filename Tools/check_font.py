#!/usr/bin/env python3
"""폰트 검사 (개발 도구): 게임에 쓰인 모든 글자가 Galmuri11 / Galmuri11-Bold 에 있는지 확인."""
import glob
import os
import re
import sys

from fontTools.ttLib import TTFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
reg = TTFont(os.path.join(ROOT, "Assets/Resources/Fonts/Galmuri11.ttf")).getBestCmap()
bold = TTFont(os.path.join(ROOT, "Assets/Resources/Fonts/Galmuri11-Bold.ttf")).getBestCmap()

chars = set()
for path in glob.glob(os.path.join(ROOT, "Assets/Game/Scripts/**/*.cs"), recursive=True):
    src = open(path, encoding="utf-8").read()
    for lit in re.findall(r'"((?:[^"\\\n]|\\.)*)"', src):
        chars.update(lit)
story = open(os.path.join(ROOT, "Assets/StreamingAssets/Story/story.json"), encoding="utf-8").read()
story = re.sub(r"^\s*//.*$", "", story, flags=re.M)
for lit in re.findall(r'"((?:[^"\\\n]|\\.)*)"', story):
    chars.update(lit)
# 글리치용 무작위 한글 음절 전체 범위
chars.update(chr(c) for c in range(0xAC00, 0xD7A4))

chars = {c for c in chars if ord(c) >= 0x20}
miss_r = sorted(c for c in chars if ord(c) not in reg)
miss_b = sorted(c for c in chars if ord(c) not in bold)
print("검사한 글자 수:", len(chars))
print("Galmuri11 에 없는 글자:", "".join(miss_r) or "없음", [hex(ord(c)) for c in miss_r][:20])
print("Galmuri11-Bold 에 없는 글자:", "".join(miss_b) or "없음", [hex(ord(c)) for c in miss_b][:20])
sys.exit(1 if miss_r or miss_b else 0)
