#!/usr/bin/env python3
"""
번역 파일 생성·검사 (개발 도구).
story.json 에서 화면에 나오는 한국어 문장을 모두 뽑아 Tools/lang_en_source.py 와 대조하고,
Assets/StreamingAssets/Story/lang_en.json (한국어 → 영어 사전)을 만든다. 빠진 번역이 있으면 실패.
"""
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lang_en_source import EN  # noqa: E402

STORY = os.path.join(ROOT, "Assets/StreamingAssets/Story/story.json")
OUT = os.path.join(ROOT, "Assets/StreamingAssets/Story/lang_en.json")


def strings(d):
    out = []

    def add(x):
        if isinstance(x, str) and x.strip() and re.search("[가-힣]", x) and x not in out:
            out.append(x)

    def lines(arr):
        for line in arr or []:
            add(line["text"] if isinstance(line, dict) else line)

    for line in d["intro"]:
        add(line)
    for c in d.get("chapters", []):
        add(c.get("label")); add(c.get("title"))
    for n in d["nodes"]:
        add(n.get("record")); add(n.get("status"))
        lines(n.get("lines"))
        lines(n.get("hidden"))
        for c in n.get("choices", []):
            add(c["text"])
        t = n.get("task") or {}
        add(t.get("hint")); add(t.get("screen"))
        m = n.get("maze") or {}
        add(m.get("subtle")); add(m.get("direct"))
    for e in d["events"]:
        for a in e["actions"]:
            for k in ("text", "prompt"):
                add(a.get(k))
    for e in d["endings"]:
        add(e["title"]); add(e.get("hint"))
        lines(e["lines"])
    for v in d["inspects"].values():
        for var in v:
            for t in (var["text"] if isinstance(var["text"], list) else [var["text"]]):
                add(t)
    for v in d.get("sheets", {}).values():
        for t in v:
            add(t)
    return out


def main():
    text = open(STORY, encoding="utf-8").read()
    d = json.loads("\n".join(l for l in text.split("\n") if not l.strip().startswith("//")))
    src = strings(d)
    missing = [s for s in src if s not in EN]
    for m in missing:
        print("번역 없음:", m)
    unused = [k for k in EN if k not in src]
    for u in unused:
        print("쓰이지 않는 번역:", u)
    table = {k: EN[k] for k in src if k in EN}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(table, f, ensure_ascii=False, indent=1)
    print("문장 %d개, 번역 %d개, 빠짐 %d개 → %s" % (len(src), len(table), len(missing), os.path.relpath(OUT, ROOT)))
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
