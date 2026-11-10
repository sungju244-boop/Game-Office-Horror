// 형체 (브라우저판 Session.figObj / showFig / hideFig / poseFig 와 같은 규칙):
//   감독관 = Observer(sup), 그것 = DisturbingEyes(ent, 빛나는 눈은 구하지 못한 사람마다 늘어남), 겁쟁이 모드 = 휴지(tp, 모든 형체를 대신함).
// 세 모델은 세션을 만들 때 미리 불러 바닥 아래에 둔다 (등장 순간에 멈칫하지 않게).
using System.Collections;
using System.Collections.Generic;
using NightEval.World;
using UnityEngine;

namespace NightEval.Director
{
    public sealed class FigureDirector : MonoBehaviour
    {
        public sealed class Fig
        {
            public string Key;
            public GameObject Root;
            public FigureRig Rig;
            public Light Glow;
            public float Speed;       // m/s (걷기 움직임)
            public bool Stepped;      // 이번 프레임에 발을 디뎠는가 (발소리)
            public bool Shown;
            public int Layer;
            public Transform Head => Rig != null ? Rig.Head : Root.transform;
        }

        static readonly Vector3 Park = new Vector3(0, -60f, 0);
        Session s;
        public bool Chicken;
        public Fig Sup, Ent, Tp;
        readonly List<GameObject> eyes = new List<GameObject>();
        public bool Ready { get; private set; }

        public void Init(Session session)
        {
            s = session;
            StartCoroutine(LoadAll());
        }

        IEnumerator LoadAll()
        {
            Sup = new Fig { Key = "sup" }; Ent = new Fig { Key = "ent" }; Tp = new Fig { Key = "tp" };
            yield return Load(Sup, 2.1f);
            yield return Load(Ent, 2.05f);
            yield return Load(Tp, 1.35f);
            AddEyes(Ent);
            // 감독관 앞을 비추는 약한 빛 (어둠 속에서도 실루엣이 보이게)
            foreach (var f in new[] { Sup, Ent })
            {
                var lg = new GameObject("FigGlow").AddComponent<Light>();
                lg.transform.SetParent(f.Root.transform, false);
                lg.transform.localPosition = new Vector3(0, 1.9f, 0.6f);
                lg.type = LightType.Point; lg.range = 6f; lg.intensity = 0f; lg.color = new Color(0.66f, 0.77f, 1f); lg.shadows = LightShadows.None;
                f.Glow = lg;
            }
            Ready = true;
        }

        IEnumerator Load(Fig f, float height)
        {
            f.Root = new GameObject("Figure_" + f.Key);
            f.Root.transform.SetParent(s.World.Root, false);
            f.Root.transform.position = Vector3.zero;
            GameObject model = null;
            yield return FigureLoader.Load(f.Key, f.Root.transform, m => model = m);
            if (model != null) { f.Rig = f.Root.AddComponent<FigureRig>(); f.Rig.Setup(model, FigureLoader.ReadBones(f.Key), height); }
            else BoxFigure(f.Root.transform, height);
            f.Root.transform.position = Park;
        }

        void BoxFigure(Transform root, float h)
        {
            var pf = new PropFactory(s.Ctx);
            float k = h / 2.1f;
            pf.Box(root, "Body", new Vector3(0.42f, 0.9f, 0.24f) * k, new Vector3(0, 1.35f, 0) * k, "cloth");
            pf.Box(root, "Head", new Vector3(0.36f, 0.36f, 0.36f) * k, new Vector3(0, 2.0f, 0) * k, "plastic_dark");
            foreach (var x in new[] { -0.12f, 0.12f }) pf.Box(root, "Leg", new Vector3(0.12f, 0.9f, 0.14f) * k, new Vector3(x, 0.45f, 0) * k, "cloth");
        }

        /// <summary>그것의 빛나는 눈: 머리 → 가슴 순서로 늘어난다 (브라우저판 addRigEyes 와 같은 자리)</summary>
        void AddEyes(Fig f)
        {
            if (f.Rig == null) return;
            var head = f.Rig.Bone("head") ?? f.Root.transform;
            var chest = f.Rig.Bone("upperChest") ?? f.Rig.Bone("chest") ?? f.Root.transform;
            var tex = EyeTexture();
            var shader = Shader.Find("Sprites/Default");
            var mesh = s.Ctx.QuadMesh(Vector2.one);
            var spots = new (Transform, float, float, float)[] {
                (head, -0.036f, 0.1f, -0.118f), (head, 0.036f, 0.1f, -0.118f),
                (head, 0f, 0.17f, -0.105f), (head, -0.065f, 0.05f, -0.1f), (head, 0.07f, 0.15f, -0.095f), (head, 0.02f, 0.01f, -0.11f),
                (chest, -0.06f, 0.06f, -0.125f), (chest, 0.08f, 0f, -0.125f), (chest, -0.11f, -0.08f, -0.115f), (chest, 0.03f, -0.15f, -0.125f),
                (chest, 0.12f, 0.08f, -0.105f), (chest, -0.02f, -0.04f, -0.13f), (chest, 0.07f, -0.26f, -0.115f), (chest, -0.09f, -0.3f, -0.11f) };
            var mat = s.Ctx.Own(new Material(shader) { mainTexture = tex, color = new Color(1f, 1f, 1f, 0.9f) });
            for (int i = 0; i < spots.Length; i++)
            {
                var (par, x, y, z) = spots[i];
                var go = new GameObject("Eye");
                go.transform.SetParent(par, false);
                go.transform.localPosition = new Vector3(-x, y, z); // 모델 단위 그대로, x 뒤집기
                float sz = i < 2 ? 0.045f : 0.034f;
                go.transform.localScale = Vector3.one * sz;
                go.transform.localRotation = Quaternion.identity; // 모델 앞(-z)을 본다 (양면 재질)
                go.AddComponent<MeshFilter>().sharedMesh = mesh;
                var r = go.AddComponent<MeshRenderer>(); r.sharedMaterial = mat; r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                go.SetActive(i < 2);
                eyes.Add(go);
            }
        }

        Texture2D EyeTexture()
        {
            const int n = 64;
            var t = s.Ctx.Own(new Texture2D(n, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp });
            var px = new Color32[n * n];
            for (int y = 0; y < n; y++) for (int x = 0; x < n; x++)
            {
                float d = Mathf.Sqrt((x - n / 2f + 0.5f) * (x - n / 2f + 0.5f) + (y - n / 2f + 0.5f) * (y - n / 2f + 0.5f)) / (n / 2f);
                float a = d < 0.18f ? 1f : d < 0.4f ? Mathf.Lerp(1f, 0.45f, (d - 0.18f) / 0.22f) : Mathf.Max(0f, Mathf.Lerp(0.45f, 0f, (d - 0.4f) / 0.6f));
                Color c = d < 0.18f ? Color.white : Color.Lerp(new Color(0.92f, 0.95f, 1f), new Color(0.24f, 0.35f, 0.78f), d);
                px[y * n + x] = new Color(c.r, c.g, c.b, a);
            }
            t.SetPixels32(px); t.Apply(false);
            return t;
        }

        public void SetEyes(int n) { for (int i = 0; i < eyes.Count; i++) eyes[i].SetActive(i < n); }

        public Fig Obj(string kind) => Chicken ? Tp : kind == "sup" ? Sup : Ent;
        readonly Dictionary<string, Fig> shown = new Dictionary<string, Fig>();

        /// <summary>kind: sup(감독관) / ent(그것). layer: 2 = CCTV 화면에만 보임</summary>
        public Fig Show(string kind, Vector3 pos, float yawDeg, float glow = 1.2f, int layer = 0)
        {
            if (!Ready) return null;
            Hide(kind);
            var f = Obj(kind);
            f.Root.transform.position = new Vector3(pos.x, 0f, pos.z);
            f.Root.transform.rotation = Quaternion.Euler(0, yawDeg, 0);
            f.Speed = 0f; f.Shown = true; f.Layer = layer;
            SetLayer(f.Root, layer == 2 ? Layers.Avatar : Layers.Default);
            if (f == Ent) SetEyes(Mathf.Clamp(2 + (int)s.Vars.GetNum("victims") * 5, 2, 14));
            if (f.Glow != null) f.Glow.intensity = Chicken ? 0f : glow;
            shown[kind] = f;
            return f;
        }

        public void Hide(string kind)
        {
            if (!shown.TryGetValue(kind, out var f)) return;
            shown.Remove(kind);
            bool stillUsed = false; foreach (var g in shown.Values) if (g == f) stillUsed = true;
            if (!stillUsed) { f.Root.transform.position = Park; f.Shown = false; if (f.Glow != null) f.Glow.intensity = 0f; SetLayer(f.Root, Layers.Default); }
        }

        public void HideAll() { foreach (var k in new List<string>(shown.Keys)) Hide(k); }
        public bool IsShown(string kind) => shown.ContainsKey(kind);
        public Fig Get(string kind) => shown.TryGetValue(kind, out var f) ? f : null;

        static void SetLayer(GameObject go, int layer) { foreach (var t in go.GetComponentsInChildren<Transform>(true)) t.gameObject.layer = layer; }

        /// <summary>쉬는 형체를 그 자리에서 사람을 향하게 (yaw = 형체 앞이 target 을 본다)</summary>
        public static float YawTo(Vector3 from, Vector3 target) { var d = target - from; return Mathf.Atan2(d.x, d.z) * Mathf.Rad2Deg; }

        void Update()
        {
            if (!Ready) return;
            float dt = Time.deltaTime;
            foreach (var f in new[] { Sup, Ent, Tp })
            {
                f.Stepped = false;
                if (!f.Shown || f.Rig == null) continue;
                if (f == Tp) f.Rig.Dance(dt);
                else if (f == Ent) f.Rig.Creep(dt, f.Speed);
                else f.Stepped = f.Rig.Walk(dt, f.Speed, f.Speed > 1.5f);
            }
        }
    }
}
