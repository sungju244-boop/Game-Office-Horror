using System.Collections.Generic;
using System.IO;
using System.Text;
using UnityEngine;

namespace NightEval
{
    /// <summary>Resources / StreamingAssets 읽기와 캐시.</summary>
    public static class Res
    {
        static Font regular, bold;
        static readonly Dictionary<string, Texture2D> textures = new Dictionary<string, Texture2D>();
        static readonly Dictionary<string, AudioClip> clips = new Dictionary<string, AudioClip>();
        static readonly HashSet<string> warned = new HashSet<string>();

        static readonly string[] OsFallbackFonts =
        {
            "Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", "AppleGothic",
            "Noto Sans CJK KR", "Noto Sans KR", "NanumGothic", "Arial"
        };

        public static Font Font
        {
            get
            {
                if (regular == null) regular = LoadFont("Fonts/Galmuri11");
                return regular;
            }
        }

        public static Font Bold
        {
            get
            {
                if (bold == null)
                {
                    bold = Resources.Load<Font>("Fonts/Galmuri11-Bold");
                    if (bold == null) bold = Font;
                }
                return bold;
            }
        }

        static Font LoadFont(string path)
        {
            var f = Resources.Load<Font>(path);
            if (f != null) return f;
            Warn("font:" + path, "한글 폰트를 찾지 못해 OS 폰트로 대체합니다: " + path);
            return Font.CreateDynamicFontFromOSFont(OsFallbackFonts, 32);
        }

        public static Texture2D Tex(string name, bool point = true)
        {
            if (string.IsNullOrEmpty(name)) return null;
            if (textures.TryGetValue(name, out var t) && t != null) return t;
            t = Resources.Load<Texture2D>("Textures/" + name);
            if (t == null)
            {
                Warn("tex:" + name, "텍스처 없음: Textures/" + name);
                return null;
            }
            t.filterMode = point ? FilterMode.Point : FilterMode.Bilinear;
            t.anisoLevel = 4;
            t.wrapMode = TextureWrapMode.Repeat;
            textures[name] = t;
            return t;
        }

        public static AudioClip Clip(string name)
        {
            if (string.IsNullOrEmpty(name)) return null;
            if (clips.TryGetValue(name, out var c) && c != null) return c;
            c = Resources.Load<AudioClip>("Audio/" + name);
            if (c == null)
            {
                Warn("clip:" + name, "오디오 없음: Audio/" + name);
                return null;
            }
            clips[name] = c;
            return c;
        }

        public static Shader FindShader(string name, string fallback)
        {
            var s = Shader.Find(name);
            if (s != null && s.isSupported) return s;
            Warn("shader:" + name, "셰이더 '" + name + "' 를 쓸 수 없어 '" + fallback + "' 로 대체합니다.");
            var f = Shader.Find(fallback);
            if (f == null) f = Shader.Find("Sprites/Default");
            return f;
        }

        public static string ReadStreaming(string relative)
        {
            string path = Path.Combine(Application.streamingAssetsPath, relative);
            if (File.Exists(path)) return File.ReadAllText(path, Encoding.UTF8);
            // 혹시 StreamingAssets가 빠졌을 때를 대비해 Resources 사본도 찾는다.
            var asset = Resources.Load<TextAsset>(Path.ChangeExtension(relative, null));
            if (asset != null) return asset.text;
            Debug.LogError("[야간 평가실] 데이터 파일을 찾지 못했습니다: " + path);
            return null;
        }

        public static string ReadResourceText(string path)
        {
            var asset = Resources.Load<TextAsset>(path);
            if (asset == null)
            {
                Debug.LogError("[야간 평가실] Resources 텍스트 없음: " + path);
                return null;
            }
            return asset.text;
        }

        public static void Warn(string key, string message)
        {
            if (warned.Add(key)) Debug.LogWarning("[야간 평가실] " + message);
        }
    }
}
