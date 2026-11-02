#!/usr/bin/env bash
# 브라우저 테스트판에 필요한 자원을 Unity 프로젝트에서 복사·변환한다 (같은 데이터 사용).
set -euo pipefail
cd "$(dirname "$0")/.."
W=web
cp Assets/StreamingAssets/Story/story.json $W/data/story.json
cp Assets/Resources/Data/office_layout.json $W/data/office_layout.json
for f in Assets/Resources/TexturesRaw/*.bytes; do cp "$f" "$W/tex/$(basename "${f%.bytes}").png"; done
for f in Assets/Resources/Audio/*.wav; do
  out="$W/audio/$(basename "${f%.wav}").ogg"
  ffmpeg -loglevel error -y -i "$f" -c:a libvorbis -q:a 3 "$out"
done
TMP=$(mktemp -d)
if [ ! -f $W/vendor/three.module.min.js ]; then
  curl -sSL -o "$TMP/three.tgz" https://registry.npmjs.org/three/-/three-0.160.0.tgz
  tar -xzf "$TMP/three.tgz" -C "$TMP" package/build/three.module.min.js package/LICENSE
  cp "$TMP/package/build/three.module.min.js" $W/vendor/ && cp "$TMP/package/LICENSE" $W/vendor/THREE_LICENSE.txt
fi
if [ ! -f $W/fonts/Galmuri11.woff2 ]; then
  curl -sSL -o "$TMP/galmuri.tgz" https://registry.npmjs.org/galmuri/-/galmuri-2.40.3.tgz
  tar -xzf "$TMP/galmuri.tgz" -C "$TMP" package/dist/Galmuri11.woff2 package/dist/Galmuri11-Bold.woff2
  cp "$TMP"/package/dist/Galmuri11*.woff2 $W/fonts/
fi
rm -rf "$TMP"
du -sh $W/audio $W/tex $W/fonts $W/vendor $W/data
