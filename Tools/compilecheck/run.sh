#!/usr/bin/env bash
# Unity 없이 C# 스크립트 컴파일 검사 (개발 도구, 게임에 포함되지 않음).
# UnityEngine/UnityEditor 참조: NuGet Unity3D.SDK 2021.1 (Unity 6 API와 대부분 같지만 완전히 같지는 않음)
# UnityEngine.UI 참조: GitHub Unity-Technologies/uGUI 소스를 함께 컴파일하거나, 실패하면 stubs/ 사용
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$ROOT/Tools/_out"
mkdir -p "$OUT"
if [ ! -f "$OUT/sdk/lib/UnityEngine.dll" ]; then
  curl -sSL -o "$OUT/sdk.nupkg" https://api.nuget.org/v3-flatcontainer/unity3d.sdk/2021.1.14.1/unity3d.sdk.2021.1.14.1.nupkg
  python3 -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$OUT/sdk.nupkg" "$OUT/sdk"
fi
cd "$HERE"
dotnet build Runtime.csproj -nologo -v q -p:UnityLib="$OUT/sdk/lib" -p:RootDir="$ROOT" -o "$OUT/bin" 2>&1 | grep -E "error|warning CS|Build succeeded|FAILED" | sed "s#$ROOT/##" | sort -u
dotnet build Editor.csproj -nologo -v q -p:UnityLib="$OUT/sdk/lib" -p:RootDir="$ROOT" -o "$OUT/bin" 2>&1 | grep -E "error|warning CS|Build succeeded|FAILED" | sed "s#$ROOT/##" | sort -u
