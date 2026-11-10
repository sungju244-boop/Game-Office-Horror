// 형체 모델 (CC0 휴머노이드 GLB) 불러오기와 뼈 움직임. 브라우저판 web/js/world.js 의 buildRig / animRigWalk / animRigDance 와 같은 동작.
// glTFast(com.unity.cloud.gltfast) 로 StreamingAssets/models/*.glb 를 실행 중에 불러온다.
// 컴파일 검사 환경에는 glTFast 가 없어서 리플렉션으로 부른다 (패키지가 없으면 대신 상자 형체를 쓴다).
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using NightEval.Story;
using UnityEngine;

namespace NightEval.World
{
    public static class FigureLoader
    {
        /// <summary>models/&lt;key&gt;.glb 를 parent 아래에 만든다. 실패하면 done(null)</summary>
        public static IEnumerator Load(string key, Transform parent, Action<GameObject> done)
        {
            string path = Path.Combine(Application.streamingAssetsPath, "models", key + ".glb");
            Type t = Type.GetType("GLTFast.GltfImport, glTFast");
            if (t == null || !File.Exists(path)) { Debug.LogWarning("[야간 평가실] glTFast 패키지 또는 모델 파일이 없어 상자 형체로 대신합니다: " + path); done(null); yield break; }
            object imp = null; Task load = null;
            try
            {
                var ctor = t.GetConstructors()[0];
                imp = ctor.Invoke(new object[ctor.GetParameters().Length]);
                MethodInfo loadBytes = null;
                foreach (var m in t.GetMethods())
                {
                    var ps = m.GetParameters();
                    if (m.Name == "Load" && ps.Length >= 1 && ps[0].ParameterType == typeof(byte[])) { loadBytes = m; break; }
                }
                load = (Task)loadBytes.Invoke(imp, Args(loadBytes, File.ReadAllBytes(path)));
            }
            catch (Exception e) { Debug.LogWarning("[야간 평가실] 모델 불러오기 실패: " + e.Message); done(null); yield break; }
            while (!load.IsCompleted) yield return null;
            if (load.IsFaulted || !(bool)load.GetType().GetProperty("Result").GetValue(load)) { Debug.LogWarning("[야간 평가실] 모델 읽기 실패: " + key); done(null); yield break; }
            var holder = new GameObject("Model_" + key);
            holder.transform.SetParent(parent, false);
            Task inst = null;
            try
            {
                MethodInfo im = null;
                foreach (var m in t.GetMethods())
                {
                    var ps = m.GetParameters();
                    if (m.Name == "InstantiateMainSceneAsync" && ps.Length >= 1 && ps[0].ParameterType == typeof(Transform)) { im = m; break; }
                }
                inst = (Task)im.Invoke(imp, Args(im, holder.transform));
            }
            catch (Exception e) { Debug.LogWarning("[야간 평가실] 모델 만들기 실패: " + e.Message); UnityEngine.Object.Destroy(holder); done(null); yield break; }
            while (!inst.IsCompleted) yield return null;
            done(inst.IsFaulted ? null : holder);
        }

        /// <summary>첫 인자만 채우고 나머지는 기본값 (CancellationToken 같은 값 형식은 default)</summary>
        static object[] Args(MethodInfo m, object first)
        {
            var ps = m.GetParameters();
            var a = new object[ps.Length];
            a[0] = first;
            for (int i = 1; i < ps.Length; i++)
                a[i] = ps[i].HasDefaultValue && ps[i].DefaultValue != null ? ps[i].DefaultValue : (ps[i].ParameterType.IsValueType ? Activator.CreateInstance(ps[i].ParameterType) : null);
            return a;
        }

        public static Dictionary<string, string> ReadBones(string key)
        {
            var res = new Dictionary<string, string>();
            string path = Path.Combine(Application.streamingAssetsPath, "models", key + ".bones.json");
            if (!File.Exists(path)) return res;
            if (MiniJson.Parse(File.ReadAllText(path)) is Dictionary<string, object> d)
                foreach (var kv in d) if (kv.Value is string s) res[kv.Key] = s;
            return res;
        }
    }

    /// <summary>휴머노이드 뼈를 코드로 움직인다. 뼈의 처음 자세는 회전 없는 T자, 모델 앞 = -z (브라우저판과 같은 각도를 쓰고 glTFast 의 x 뒤집기를 맞춰 준다).</summary>
    public sealed class FigureRig : MonoBehaviour
    {
        public Transform Model;                 // 키를 맞춘 모델 (앞을 +z 로 돌려 둔다)
        readonly Dictionary<string, Transform> B = new Dictionary<string, Transform>();
        readonly Dictionary<string, Quaternion> restRot = new Dictionary<string, Quaternion>();
        Vector3 hipsRest;
        float phase, jitter, jitterT, headZ;
        static readonly string[] Parts = { "hips", "spine", "chest", "upperChest", "neck", "head", "leftUpperArm", "rightUpperArm", "leftLowerArm", "rightLowerArm",
            "leftUpperLeg", "rightUpperLeg", "leftLowerLeg", "rightLowerLeg" };

        public Transform Head => B.TryGetValue("head", out var h) ? h : transform;

        /// <summary>model: 불러온 모델 뿌리. height: 키(m)</summary>
        public void Setup(GameObject model, Dictionary<string, string> bones, float height)
        {
            Model = model.transform;
            // 키 맞추기 (처음 자세 기준)
            var rs = model.GetComponentsInChildren<Renderer>();
            if (rs.Length > 0)
            {
                var b = rs[0].bounds; foreach (var r in rs) b.Encapsulate(r.bounds);
                float s = height / Mathf.Max(0.1f, b.size.y);
                Model.localScale *= s;
                Model.localPosition += new Vector3(0, -(b.min.y - transform.position.y) * s, 0);
            }
            Model.localRotation = Quaternion.Euler(0, 180f, 0) * Model.localRotation; // 모델 앞(-z) → 형체 앞(+z)
            var byName = new Dictionary<string, Transform>();
            foreach (var t in model.GetComponentsInChildren<Transform>(true)) if (!byName.ContainsKey(t.name)) byName[t.name] = t;
            foreach (var kv in bones) if (byName.TryGetValue(kv.Value, out var bt)) { B[kv.Key] = bt; restRot[kv.Key] = bt.localRotation; }
            if (B.TryGetValue("hips", out var hp)) hipsRest = hp.localPosition;
            foreach (var r in rs) { r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off; if (r is SkinnedMeshRenderer sm) sm.updateWhenOffscreen = true; }
            phase = UnityEngine.Random.value * 6f;
            Walk(0f, 0f, false);
        }

        // 브라우저판(three.js, 오른손 좌표)의 오일러 XYZ 각 → glTFast 로 x 를 뒤집은 Unity 회전
        static Quaternion Web(float x, float y, float z)
        {
            float c1 = Mathf.Cos(x / 2), c2 = Mathf.Cos(y / 2), c3 = Mathf.Cos(z / 2), s1 = Mathf.Sin(x / 2), s2 = Mathf.Sin(y / 2), s3 = Mathf.Sin(z / 2);
            float qx = s1 * c2 * c3 + c1 * s2 * s3, qy = c1 * s2 * c3 - s1 * c2 * s3, qz = c1 * c2 * s3 + s1 * s2 * c3, qw = c1 * c2 * c3 - s1 * s2 * s3;
            return new Quaternion(qx, -qy, -qz, qw);
        }
        void Rot(string k, float x, float y, float z) { if (B.TryGetValue(k, out var b)) b.localRotation = restRot[k] * Web(x, y, z); }
        void Reset()
        {
            foreach (var k in Parts) if (B.TryGetValue(k, out var b)) b.localRotation = restRot[k];
            if (B.TryGetValue("hips", out var hp)) hp.localPosition = hipsRest;
        }

        /// <summary>걷기·달리기 (speed m/s). reach: 쫓을 때 팔을 앞으로 뻗는다. 발 디딜 때 true</summary>
        public bool Walk(float dt, float speed, bool reach)
        {
            if (B.Count == 0) return false;
            Reset();
            bool moving = speed > 0.15f;
            float prev = Mathf.Sin(phase);
            phase += dt * (moving ? 2.4f + speed * 1.55f : 0.9f);
            float ph = phase, s0 = Mathf.Sin(ph), k = Mathf.Min(1f, speed / 4f), time = Time.time;
            float swing = moving ? 0.38f + 0.3f * k : 0f, knee = moving ? 0.55f + 0.55f * k : 0f, down = 1.25f;
            float rch = reach ? Mathf.Min(1f, speed / 2.2f) : 0f;
            for (int side = 0; side < 2; side++)
            {
                string n = side == 0 ? "left" : "right"; float off = side == 0 ? 0f : Mathf.PI, sg = side == 0 ? 1f : -1f, a = ph + off;
                Rot(n + "UpperLeg", Mathf.Sin(a) * swing, 0, 0);
                Rot(n + "LowerLeg", -Mathf.Max(0f, Mathf.Cos(a)) * knee - (moving ? 0.08f : 0.03f), 0, 0);
                float armSwing = moving ? -Mathf.Sin(a) * (0.3f + 0.25f * k) * (1f - rch) : Mathf.Sin(time * 0.8f + off) * 0.03f;
                float fwd = rch * (1.28f + Mathf.Sin(time * 6.5f + off) * 0.1f);
                // 앞으로 뻗기: 팔을 거의 끝까지 내린 다음(z) 앞으로 든다(x)
                Rot(n + "UpperArm", armSwing + fwd, 0, sg * (down + rch * (Mathf.PI / 2f - 0.12f - down)));
                Rot(n + "LowerArm", 0, -sg * (0.22f + rch * 0.15f), 0);
            }
            if (B.TryGetValue("hips", out var hp)) hp.localPosition = hipsRest + new Vector3(0, moving ? Mathf.Abs(s0) * 0.035f : Mathf.Sin(time * 1.4f) * 0.006f, 0);
            Rot("hips", 0, moving ? Mathf.Sin(ph) * 0.1f : 0f, moving ? s0 * 0.04f : 0f);
            Rot("spine", -(moving ? 0.06f + 0.12f * k : 0.03f), moving ? -Mathf.Sin(ph) * 0.1f : 0f, 0);
            // 고개가 불규칙하게 홱 꺾인다
            jitterT -= dt;
            if (jitterT <= 0f) { jitterT = 0.08f + UnityEngine.Random.value * (moving ? 0.4f : 0.9f); jitter = (UnityEngine.Random.value * 2f - 1f) * (UnityEngine.Random.value < 0.3f ? 0.55f : 0.16f); }
            headZ += (jitter - headZ) * Mathf.Min(1f, dt * 26f);
            Rot("neck", -0.05f, 0, headZ * 0.4f);
            Rot("head", -0.15f, 0, headZ * 0.6f);
            return moving && s0 != 0f && Mathf.Sign(prev) != Mathf.Sign(s0);
        }
    }
}
