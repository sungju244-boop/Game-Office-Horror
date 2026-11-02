#!/usr/bin/env bash
# 여기서 할 수 있는 모든 검사를 한 번에 실행한다 (Unity 없이).
#  1) C# 컴파일 (Unity 참조 DLL)  2) 이야기 전 경로  3) 공간 이동 경로  4) 폰트 글자
set -u
cd "$(dirname "$0")/.."
fail=0
echo "== 1. C# 컴파일 검사 =="; Tools/compilecheck/run.sh || fail=1
echo "== 2. 이야기 경로 검사 =="; (cd Tools/storytest && dotnet run -c Release -- ../.. 2>&1 | tail -12) || fail=1
echo "== 3. 공간 경로 검사 =="; python3 Tools/check_layout.py | tail -15 || fail=1
echo "== 4. 폰트 글자 검사 =="; python3 Tools/check_font.py || fail=1
exit $fail
