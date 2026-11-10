// F키 손동작 (브라우저판 web/js/fingerhand.js 와 같은 동작): 1인칭 오른손이 가운데손가락을 올렸다 내린다.
// 연타하면 누르는 빠르기에 맞춰 접었다 폈다 (초당 3~8번), 손을 떼면 바로 멈춘다.
// 손 모델: WebXR generic hand (MIT, StreamingAssets/models/hand_right.glb). 관절이 모두 형제로 붙어 있어 손가락 사슬로 다시 잇는다.
// 손은 따로 깊이를 지우고 그리는 카메라(손 전용 레이어)로 그려 벽에 파묻히지 않는다.
using System.Collections;
using System.Collections.Generic;
using NightEval.World;
using UnityEngine;

namespace NightEval.Player
{
    public sealed class HandView : MonoBehaviour
    {
        public const int HandLayer = 29;
        static readonly string[] Fingers = { "index", "middle", "ring", "pinky" };
        static readonly string[] Seg = { "metacarpal", "phalanx-proximal", "phalanx-intermediate", "phalanx-distal", "tip" };
        static readonly string[] Thumb = { "thumb-metacarpal", "thumb-phalanx-proximal", "thumb-phalanx-distal", "thumb-tip" };

        public System.Func<bool> Blocked = () => false;
        Camera handCam;
        Transform root;
        readonly Dictionary<string, Transform> J = new Dictionary<string, Transform>();
        readonly Dictionary<string, Quaternion> rest = new Dictionary<string, Quaternion>();
        readonly List<float> taps = new List<float>();
        float v, target, holdUntil, jab, flick, pump;
        bool ready;

        public void Init(Camera main)
        {
            main.cullingMask &= ~(1 << HandLayer);
            var camGo = new GameObject("HandCamera");
            camGo.transform.SetParent(main.transform, false);
            handCam = camGo.AddComponent<Camera>();
            handCam.clearFlags = CameraClearFlags.Depth;
            handCam.cullingMask = 1 << HandLayer;
            handCam.depth = main.depth + 1;
            handCam.fieldOfView = 50f;
            handCam.nearClipPlane = 0.01f; handCam.farClipPlane = 3f;
            handCam.allowHDR = false;
            var light = new GameObject("HandLight").AddComponent<Light>();
            light.transform.SetParent(camGo.transform, false);
            light.transform.localRotation = Quaternion.Euler(35f, -25f, 0f);
            light.type = LightType.Directional; light.intensity = 0.9f; light.cullingMask = 1 << HandLayer; light.shadows = LightShadows.None;
            root = new GameObject("HandRoot").transform;
            root.SetParent(camGo.transform, false);
            StartCoroutine(Load());
        }

        IEnumerator Load()
        {
            GameObject model = null;
            yield return FigureLoader.Load("hand_right", root, m => model = m);
            if (model == null) yield break;
            foreach (var t in model.GetComponentsInChildren<Transform>(true)) { t.gameObject.layer = HandLayer; if (!J.ContainsKey(t.name)) J[t.name] = t; }
            // 손가락 사슬로 다시 잇기 (세계 위치는 그대로)
            void Chain(IEnumerable<string> names) { if (!J.TryGetValue("wrist", out var par)) return; foreach (var n in names) if (J.TryGetValue(n, out var b)) { b.SetParent(par, true); par = b; } }
            foreach (var f in Fingers) { var list = new List<string>(); foreach (var sg in Seg) list.Add(f + "-finger-" + sg); Chain(list); }
            Chain(Thumb);
            foreach (var kv in J) rest[kv.Key] = kv.Value.localRotation;
            foreach (var r in model.GetComponentsInChildren<Renderer>())
            {
                r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                foreach (var m in r.materials) m.color = new Color(0.85f, 0.65f, 0.52f);
                if (r is SkinnedMeshRenderer sm) sm.updateWhenOffscreen = true;
            }
            // 손바닥이 나를 보고 손가락이 위로. 브라우저판 카메라(앞 = -z) 기준 각 (-0.25, -1.4, 3.05) 을 옮긴다:
            // Unity 카메라(앞 = +z) = z 뒤집기, 모델 = glTFast 의 x 뒤집기 → 회전 = (y축 180°) × (x 뒤집기한 회전)
            model.transform.localRotation = Quaternion.Euler(0f, 180f, 0f) * Web(-0.25f, -1.4f, 3.05f);
            ready = true;
        }

        static Quaternion Web(float x, float y, float z)
        {
            float c1 = Mathf.Cos(x / 2), c2 = Mathf.Cos(y / 2), c3 = Mathf.Cos(z / 2), s1 = Mathf.Sin(x / 2), s2 = Mathf.Sin(y / 2), s3 = Mathf.Sin(z / 2);
            return new Quaternion(s1 * c2 * c3 + c1 * s2 * s3, -(c1 * s2 * c3 - s1 * c2 * s3), -(c1 * c2 * s3 + s1 * s2 * c3), c1 * c2 * c3 - s1 * s2 * s3);
        }

        /// <summary>관절을 쉬는 자세에서 a 만큼 손바닥 쪽으로 굽힌다 (관절 x 축, 브라우저판과 같은 방향)</summary>
        void Bend(string name, float a, Vector3 axis)
        {
            if (!J.TryGetValue(name, out var b)) return;
            // 관절 축 회전도 x 뒤집기: x 축은 그대로, y·z 축은 반대
            var ax = new Vector3(axis.x, -axis.y, -axis.z);
            b.localRotation = rest[name] * Quaternion.AngleAxis(-a * Mathf.Rad2Deg, ax);
        }

        void Pose(float ext)
        {
            foreach (var f in Fingers)
            {
                float c = f == "middle" ? 1f - ext : 1f;
                Bend(f + "-finger-phalanx-proximal", 1.45f * c, Vector3.right);
                Bend(f + "-finger-phalanx-intermediate", 1.6f * c, Vector3.right);
                Bend(f + "-finger-phalanx-distal", 0.9f * c, Vector3.right);
            }
            Bend("thumb-metacarpal", 0.35f, Vector3.up);
            Bend("thumb-phalanx-proximal", 0.9f, Vector3.up);
            Bend("thumb-phalanx-distal", 1.0f, Vector3.up);
        }

        void Press(float now)
        {
            taps.RemoveAll(t => now - t >= 1.2f); taps.Add(now);
            target = 1f; holdUntil = now + 0.6f + Mathf.Min(0.6f, taps.Count * 0.05f);
            jab = 1f; flick = 1f;
        }

        void Update()
        {
            float now = Time.time, dt = Time.deltaTime;
            bool blocked = Blocked();
            if (Input.GetKeyDown(KeyCode.F) && !blocked && ready) Press(now);
            if (blocked) { target = 0f; holdUntil = 0f; taps.Clear(); }
            else if (now > holdUntil) target = 0f;
            float rate = target > v ? 9f : (blocked ? 14f : 5f);
            v += (target - v) * Mathf.Min(1f, dt * rate);
            if (v < 0.002f && target == 0f) v = 0f;
            int n = 0; foreach (var t in taps) if (now - t < 1.2f) n++;
            float since = taps.Count > 0 ? now - taps[taps.Count - 1] : 99f;
            jab = Mathf.Max(0f, jab - dt * 7f);
            flick = Mathf.Max(0f, flick - dt * 9f);
            float ext;
            if (n >= 2 && since < 0.45f && target > 0f)
            {
                float hz = Mathf.Min(8f, Mathf.Max(3f, n / 1.2f * 1.1f));
                pump += dt * Mathf.PI * 2f * hz;
                ext = 0.15f + 0.85f * (0.5f + 0.5f * Mathf.Cos(pump));
            }
            else { pump = 0f; ext = 1f - flick * 0.85f; }
            if (ready) Pose(ext);
            float e = 1f - v, shove = jab * 0.035f;
            root.localPosition = new Vector3(0.11f + e * 0.05f, -0.115f - e * 0.36f + shove * 0.6f + Mathf.Sin(now * 1.7f) * 0.003f, 0.42f + shove);
            root.gameObject.SetActive(v > 0.002f);
        }
    }
}
