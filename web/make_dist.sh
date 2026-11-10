#!/usr/bin/env bash
# 공개 배포용 폴더(web/dist)를 만든다: index.html 을 완전한 HTML 문서로 감싸고 필요한 자원만 복사.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf dist && mkdir -p dist
{
  printf '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n'
  printf '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
  printf '<meta name="description" content="Night Evaluation Room / 야간 평가실 — a short first-person psychological horror game in the browser.">\n'
  cat index.html
  printf '\n</html>\n'
} > dist/index.html
cp -r js vendor data tex audio fonts models dist/
# Netlify: 빌드 없이 이 폴더 그대로 공개
cat > dist/netlify.toml <<'TOML'
[build]
  publish = "."
  command = ""

[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
TOML
du -sh dist
