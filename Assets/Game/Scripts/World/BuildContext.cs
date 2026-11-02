using System.Collections.Generic;
using UnityEngine;

namespace NightEval.World
{
    /// <summary>
    /// 한 세션 동안 만든 재질·메시·렌더텍스처를 모아 두었다가 세션이 끝나면 한꺼번에 해제한다.
    /// (처음부터 다시 시작할 때 이전 상태가 남지 않도록)
    /// </summary>
    public sealed class BuildContext
    {
        public readonly MatLib Mats;
        readonly Dictionary<string, Mesh> meshCache = new Dictionary<string, Mesh>();
        readonly List<Object> owned = new List<Object>();

        public BuildContext()
        {
            Mats = new MatLib(this);
        }

        public T Own<T>(T obj) where T : Object
        {
            if (obj != null) owned.Add(obj);
            return obj;
        }

        public Mesh BoxMesh(Vector3 size, float uvWorld)
        {
            string key = "box:" + size.x.ToString("F3") + "," + size.y.ToString("F3") + "," + size.z.ToString("F3") + ":" + uvWorld.ToString("F2");
            if (!meshCache.TryGetValue(key, out var m)) { m = Own(MeshKit.Box(size, uvWorld)); meshCache[key] = m; }
            return m;
        }

        public Mesh QuadMesh(Vector2 size)
        {
            string key = "quad:" + size.x.ToString("F3") + "," + size.y.ToString("F3");
            if (!meshCache.TryGetValue(key, out var m)) { m = Own(MeshKit.Quad(size)); meshCache[key] = m; }
            return m;
        }

        public Mesh CylMesh(float r, float h, int sides)
        {
            string key = "cyl:" + r.ToString("F3") + "," + h.ToString("F3") + "," + sides;
            if (!meshCache.TryGetValue(key, out var m)) { m = Own(MeshKit.Cylinder(r, h, sides)); meshCache[key] = m; }
            return m;
        }

        public Mesh Cached(string key, System.Func<Mesh> make)
        {
            if (!meshCache.TryGetValue(key, out var m)) { m = Own(make()); meshCache[key] = m; }
            return m;
        }

        public void Dispose()
        {
            foreach (var o in owned)
            {
                if (o == null) continue;
                if (o is RenderTexture rt) rt.Release();
                Object.Destroy(o);
            }
            owned.Clear();
            meshCache.Clear();
            Mats.Clear();
        }
    }

    /// <summary>재질 모음. 텍스처는 Resources/Textures, 셰이더는 Resources/Shaders.</summary>
    public sealed class MatLib
    {
        readonly BuildContext ctx;
        readonly Dictionary<string, Material> cache = new Dictionary<string, Material>();
        Shader lit, crt;

        public MatLib(BuildContext ctx) { this.ctx = ctx; }

        public Shader LitShader => lit != null ? lit : (lit = Res.FindShader("NightEval/Lit", "Legacy Shaders/Diffuse"));
        public Shader CrtShader => crt != null ? crt : (crt = Res.FindShader("NightEval/CRT", "Sprites/Default"));

        public void Clear() { cache.Clear(); }

        public Material Get(string key)
        {
            if (cache.TryGetValue(key, out var m) && m != null) return m;
            m = Create(key);
            cache[key] = m;
            return m;
        }

        Material Create(string key)
        {
            switch (key)
            {
                // 바닥·벽·천장 (텍스처 1회 반복 = worldSize 미터)
                case "carpet": return Lit(key, "carpet", C(0.62f, 0.67f, 0.78f), 1.0f, 0.02f);
                case "floor_tile": return Lit(key, "floor_tile", C(0.62f, 0.64f, 0.66f), 0.6f, 0.25f);
                case "ceiling": return Lit(key, "ceiling_tile", C(0.78f, 0.80f, 0.83f), 1.2f, 0.02f);
                case "ceiling_dark": return Lit(key, "ceiling_tile", C(0.45f, 0.47f, 0.5f), 1.2f, 0.02f);
                case "wall": return Lit(key, "wall", C(0.72f, 0.76f, 0.80f), 2.0f, 0.05f);
                case "wall_dark": return Lit(key, "wall", C(0.48f, 0.51f, 0.55f), 2.0f, 0.05f);
                case "baseboard": return Lit(key, null, C(0.11f, 0.12f, 0.13f), 1f, 0.2f);
                // 가구
                case "desk_top": return Lit(key, "desk_top", C(0.74f, 0.74f, 0.71f), 1.0f, 0.3f);
                case "metal": return Lit(key, "metal", C(0.55f, 0.58f, 0.60f), 1.0f, 0.35f);
                case "metal_dark": return Lit(key, "metal", C(0.20f, 0.21f, 0.23f), 1.0f, 0.35f);
                case "plastic": return Lit(key, "plastic", C(0.80f, 0.76f, 0.66f), 0.5f, 0.25f);
                case "plastic_dark": return Lit(key, "plastic", C(0.20f, 0.20f, 0.21f), 0.5f, 0.25f);
                case "fabric": return Lit(key, "fabric", C(0.33f, 0.37f, 0.45f), 0.6f, 0.02f);
                case "fabric_chair": return Lit(key, "fabric", C(0.13f, 0.14f, 0.17f), 0.6f, 0.02f);
                case "door": return Lit(key, "door", C(0.70f, 0.73f, 0.76f), 0f, 0.2f);
                case "door_exit": return Lit(key, "door", C(0.42f, 0.46f, 0.44f), 0f, 0.2f);
                case "cardboard": return Lit(key, "cardboard", C(0.60f, 0.50f, 0.38f), 0.6f, 0.02f);
                case "paper": return Lit(key, null, C(0.80f, 0.80f, 0.76f), 1f, 0.05f);
                case "black": return Lit(key, null, C(0.015f, 0.015f, 0.018f), 1f, 0.1f);
                case "cable": return Lit(key, null, C(0.03f, 0.03f, 0.035f), 1f, 0.45f);
                case "screen_dead": return Lit(key, null, C(0.025f, 0.03f, 0.035f), 1f, 0.95f, null, C(0.9f, 0.95f, 1f));
                case "water": return Lit(key, null, C(0.35f, 0.5f, 0.62f), 1f, 0.8f);
                case "cloth": return Lit(key, null, C(0.10f, 0.11f, 0.13f), 1f, 0.05f);
                case "skin": return Lit(key, null, C(0.52f, 0.43f, 0.38f), 1f, 0.1f);
                case "hole": return Lit(key, null, C(0.0f, 0.0f, 0.0f), 1f, 0.0f);
                // 고양이 (추격자 임시 외형)
                case "cat_fur": return Lit(key, "cat_fur", C(0.78f, 0.78f, 0.80f), 0f, 0.05f);
                case "cat_white": return Lit(key, null, C(0.9f, 0.9f, 0.88f), 1f, 0.05f);
                case "cat_pink": return Lit(key, null, C(0.85f, 0.55f, 0.6f), 1f, 0.1f);
                case "cat_eye": return Lit(key, null, C(0.02f, 0.02f, 0.02f), 1f, 0.9f, null, C(0.3f, 0.3f, 0.3f));
                // 데칼·인쇄물 (0~1 UV)
                case "keyboard_top": return Lit(key, "keyboard", Color.white, 0f, 0.2f);
                case "tower_front": return Lit(key, "tower_front", Color.white, 0f, 0.2f);
                case "notice": return Lit(key, "notice", Color.white, 0f, 0.05f);
                case "badge117": return Lit(key, "badge117", Color.white, 0f, 0.3f);
                case "badge116": return Lit(key, "badge116", Color.white, 0f, 0.3f);
                case "sticky": return Lit(key, "sticky", Color.white, 0f, 0.02f);
                case "clock_face": return Lit(key, "clock_face", Color.white, 0f, 0.4f);
                case "sign_room": return Lit(key, "sign_room", Color.white, 0f, 0.3f);
                case "panel": return Lit(key, "panel", Color.white, 0f, 0.3f);
                case "elevator": return Lit(key, "elevator", Color.white, 0f, 0.5f);
                case "calendar": return Lit(key, "calendar", Color.white, 0f, 0.05f);
                // 발광
                case "window_night": return Emissive(key, "window_night", C(0.55f, 0.62f, 0.8f), C(0.2f, 0.24f, 0.32f));
                case "exit_sign": return Emissive(key, "exit_sign", Color.white, C(0.45f, 1.3f, 0.6f));
                case "panel_on": return Lit(key, null, C(0.8f, 0.82f, 0.85f), 1f, 0.1f, null, null, C(0.85f, 0.95f, 1.05f));
                case "led_red": return Emissive(key, null, C(0.3f, 0f, 0f), C(2.2f, 0.12f, 0.08f));
                case "led_green": return Emissive(key, null, C(0f, 0.3f, 0f), C(0.15f, 1.8f, 0.35f));
                case "led_amber": return Emissive(key, null, C(0.3f, 0.2f, 0f), C(1.8f, 0.9f, 0.15f));
            }
            Res.Warn("mat:" + key, "정의되지 않은 재질: " + key);
            return Lit(key, null, Color.magenta, 1f, 0f);
        }

        static Color C(float r, float g, float b) => new Color(r, g, b, 1f);

        public Material Lit(string name, string tex, Color color, float worldSize, float gloss,
            Texture emissionMap = null, Color? spec = null, Color? emission = null)
        {
            var m = ctx.Own(new Material(LitShader) { name = name });
            var t = Res.Tex(tex);
            if (t != null)
            {
                m.mainTexture = t;
                float s = worldSize > 0f ? 1f / worldSize : 1f;
                m.mainTextureScale = new Vector2(s, s);
            }
            m.color = color;
            if (m.HasProperty("_Gloss")) m.SetFloat("_Gloss", gloss);
            if (m.HasProperty("_SpecColor")) m.SetColor("_SpecColor", spec ?? new Color(0.25f, 0.27f, 0.3f));
            if (m.HasProperty("_EmissionColor")) m.SetColor("_EmissionColor", emission ?? Color.black);
            if (emissionMap != null && m.HasProperty("_EmissionMap")) m.SetTexture("_EmissionMap", emissionMap);
            return m;
        }

        public Material Emissive(string name, string tex, Color albedo, Color emission)
        {
            var t = Res.Tex(tex);
            var m = Lit(name, null, albedo, 0f, 0.1f, t, null, emission);
            if (t != null)
            {
                m.mainTexture = t;
                m.mainTextureScale = Vector2.one;
            }
            return m;
        }

        /// <summary>CRT 화면용 재질 (인스턴스마다 새로 만든다).</summary>
        public Material NewCrt(Texture screen, Color tint, float brightness, float power)
        {
            var m = ctx.Own(new Material(CrtShader) { name = "CRT" });
            m.mainTexture = screen;
            if (m.HasProperty("_Tint")) m.SetColor("_Tint", tint);
            if (m.HasProperty("_Brightness")) m.SetFloat("_Brightness", brightness);
            if (m.HasProperty("_Power")) m.SetFloat("_Power", power);
            if (m.HasProperty("_Glitch")) m.SetFloat("_Glitch", 0f);
            return m;
        }
    }
}
