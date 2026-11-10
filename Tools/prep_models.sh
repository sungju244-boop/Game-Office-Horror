#!/usr/bin/env bash
# CC0 아바타(VRM 0.x, Polygonal Mind "100 Avatars")를 게임용 GLB로 줄인다.
#   원본: https://github.com/PolygonalMind/initiative-opensource-release (CC0 1.0)
#   사용: bash Tools/prep_models.sh <VRM 파일이 있는 폴더>
#   결과: web/models/<역할>.glb (텍스처 512px WebP, 표정 모프 제거) + <역할>.bones.json (휴머노이드 뼈 → 노드 이름)
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=$(realpath "$1"); OUT=web/models; GT="npx -y @gltf-transform/cli@4.1.1"
mkdir -p "$OUT"
# 역할 → 원본 이름 (ent = 그것, sup = 감독관, tp = 겁쟁이 모드 휴지)
for pair in ent:65_DisturbingEyes sup:07_Observer_Avatar tp:86_ToiletPaper; do
  k=${pair%%:*}; n=${pair#*:}; T=$(mktemp -d)
  python3 -I Tools/vrm_info.py "$SRC/$n.vrm" "$OUT/$k.bones.json"
  python3 -I Tools/strip_morph.py "$SRC/$n.vrm" "$T/0.glb"
  $GT resize "$T/0.glb" "$T/a.glb" --width 512 --height 512
  $GT webp "$T/a.glb" "$T/b.glb" --quality 88
  $GT prune "$T/b.glb" "$OUT/$k.glb"
  rm -rf "$T"
done
ls -la "$OUT"
