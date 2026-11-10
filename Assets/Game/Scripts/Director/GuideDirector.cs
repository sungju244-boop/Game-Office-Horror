// 길 안내 (브라우저판 updateWaypoint / buildGuide / updateGuide 와 같은 동작):
//  - 화면 방향 표시: 목표의 방향과 거리("117 · 15m"). 화면 밖이면 가장자리 화살표. delay 초 동안 못 찾으면 나온다
//  - 바닥 화살표: 엘리베이터 홀 → 117 자리 (처음 앉으면 흐려지며 사라짐)
//  - 117 모니터 대기 화면: 처음 앉기 전까지 '▶ 117 · 여기 ◀' 와 번갈아 깜빡임
using System.Collections.Generic;
using NightEval.UI;
using NightEval.World;
using UnityEngine;
using UnityEngine.UI;

namespace NightEval.Director
{
    public sealed class GuideDirector : MonoBehaviour
    {
        Session s;
        GameManager gm;
        RectTransform box, arrowRt;
        Text label, arrow;
        string wpId, wpLabel;
        float wpAt;
        float elapsed;
        GameObject arrowsRoot;
        readonly List<Material> arrowMats = new List<Material>();
        float arrowFade = 1f;
        bool idleBlink;

        public void Init(GameManager gm, Session session)
        {
            this.gm = gm;
            s = session;
            var canvas = UIKit.OverlayCanvas(session.Root.transform, "Waypoint", 12);
            var root = (RectTransform)canvas.transform;
            box = UIKit.Fixed(root, "Box", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(220, 40));
            UIKit.Panel(box, new Color(0.5f, 0.96f, 0.85f, 0.92f));
            label = UIKit.Label(UIKit.Rect(box, "Label", Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero), "", Res.Bold, 24, new Color(0.02f, 0.12f, 0.1f), TextAnchor.MiddleCenter);
            arrowRt = UIKit.Fixed(root, "Arrow", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(40, 40));
            arrow = UIKit.Label(arrowRt, "▲", Res.Bold, 34, new Color(0.5f, 0.96f, 0.85f), TextAnchor.MiddleCenter);
            box.gameObject.SetActive(false); arrowRt.gameObject.SetActive(false);
            idleBlink = !session.Vars.Truthy("sat_once");
            if (idleBlink) BuildArrows();
        }

        /// <summary>id: 기준점 이름 (null 이면 지움). delay 초 뒤부터 보인다</summary>
        public void Set(string id, string lbl, float delay = 0f)
        {
            wpId = id; wpLabel = lbl; wpAt = elapsed + delay;
        }
        public void Clear(string onlyId = null) { if (onlyId == null || wpId == onlyId) wpId = null; }

        void Update()
        {
            float dt = Time.deltaTime;
            elapsed += dt;
            UpdateWaypoint();
            UpdateArrows(dt);
            UpdateBlink();
        }

        void UpdateWaypoint()
        {
            bool show = wpId != null && elapsed >= wpAt && gm.Phase == GamePhase.Playing && !gm.Paused
                && !s.Seat.IsSeated && !s.Seat.InTransition && !s.Chase.Running && !s.Story.Ending;
            var a = show ? s.World.Anchor(wpId) : null;
            if (a == null) { box.gameObject.SetActive(false); arrowRt.gameObject.SetActive(false); return; }
            Vector3 target = a.position;
            float dist = Vector3.Distance(new Vector3(target.x, 0, target.z), new Vector3(s.Player.transform.position.x, 0, s.Player.transform.position.z));
            if (dist < 1.6f) { box.gameObject.SetActive(false); arrowRt.gameObject.SetActive(false); return; }
            var cam = s.Cam;
            Vector3 v = cam.WorldToViewportPoint(target);
            bool behind = v.z < 0f;
            Vector2 p = new Vector2(v.x - 0.5f, v.y - 0.5f) * 2f; // -1..1
            if (behind) p = -p;
            bool edge = behind || Mathf.Abs(p.x) > 0.82f || Mathf.Abs(p.y) > 0.82f;
            if (edge)
            {
                float m = Mathf.Max(Mathf.Abs(p.x), Mathf.Abs(p.y), 0.001f);
                p = p / m * 0.82f;
            }
            var sz = ((RectTransform)box.parent).rect.size;
            Vector2 px = new Vector2(p.x * sz.x / 2f, p.y * sz.y / 2f);
            box.gameObject.SetActive(true);
            box.anchoredPosition = px + (edge ? -p.normalized * 60f : new Vector2(0, 30f));
            label.text = wpLabel + " · " + Mathf.RoundToInt(dist) + "m";
            arrowRt.gameObject.SetActive(edge);
            if (edge) { arrowRt.anchoredPosition = px; arrowRt.localRotation = Quaternion.Euler(0, 0, Mathf.Atan2(p.y, p.x) * Mathf.Rad2Deg - 90f); }
        }

        // ---------- 바닥 화살표 ----------
        void BuildArrows()
        {
            var w = s.World;
            Vector3 from = w.SpawnPos, to = w.ChairSeat != null ? w.ChairSeat.position : w.DeskStandPos;
            var path = GridPath(new Vector2(from.x, from.z), new Vector2(to.x, to.z));
            if (path == null || path.Count < 2) return;
            arrowsRoot = new GameObject("GuideArrows");
            arrowsRoot.transform.SetParent(w.Root, false);
            var tex = ArrowTexture();
            var shader = Shader.Find("Sprites/Default");
            var mesh = s.Ctx.QuadMesh(new Vector2(0.42f, 0.42f));
            float acc = 0.6f;
            var marks = new List<(Vector3, Vector3)>();
            for (int i = 1; i < path.Count; i++)
            {
                Vector3 a = new Vector3(path[i - 1].x, 0, path[i - 1].y), b = new Vector3(path[i].x, 0, path[i].y);
                float len = Vector3.Distance(a, b);
                while (acc <= len) { marks.Add((Vector3.Lerp(a, b, acc / len), (b - a).normalized)); acc += 1.1f; }
                acc -= len;
            }
            if (marks.Count > 1) marks.RemoveAt(marks.Count - 1); // 의자 밑에는 두지 않는다
            foreach (var (pos, dir) in marks)
            {
                var mat = s.Ctx.Own(new Material(shader) { mainTexture = tex, color = new Color(1, 1, 1, 0.5f) });
                arrowMats.Add(mat);
                var go = new GameObject("Arrow");
                go.transform.SetParent(arrowsRoot.transform, false);
                go.transform.position = pos + Vector3.up * 0.012f;
                // 평면을 바닥에 눕히고(+y 가 진행 방향) 진행 방향으로 돌린다
                go.transform.rotation = Quaternion.LookRotation(Vector3.down, dir);
                go.AddComponent<MeshFilter>().sharedMesh = mesh;
                var r = go.AddComponent<MeshRenderer>(); r.sharedMaterial = mat; r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            }
        }

        Texture2D ArrowTexture()
        {
            const int n = 64;
            var t = s.Ctx.Own(new Texture2D(n, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp });
            var px = new Color32[n * n];
            var mint = new Color32(127, 245, 216, 255);
            for (int y = 0; y < n; y++) for (int x = 0; x < n; x++)
            {
                float fx = x / (float)n, fy = y / (float)n; // y 위 = 진행 방향
                bool head = fy > 0.45f && fy < 0.92f && Mathf.Abs(fx - 0.5f) < (0.92f - fy) * 0.9f;
                bool shaft = fy >= 0.08f && fy <= 0.46f && Mathf.Abs(fx - 0.5f) < 0.16f;
                px[y * n + x] = head || shaft ? mint : new Color32(0, 0, 0, 0);
            }
            t.SetPixels32(px); t.Apply(false);
            return t;
        }

        /// <summary>바닥 격자 길찾기 (문은 지나갈 수 있는 것으로 본다)</summary>
        List<Vector2> GridPath(Vector2 a, Vector2 b)
        {
            const float cell = 0.25f, x0 = -16f, z0 = -11f; const int W = 128, H = 96;
            var doors = new List<Collider>();
            foreach (var d in s.World.Doors.Values) foreach (var c in d.GetComponentsInChildren<Collider>()) if (c.enabled) { c.enabled = false; doors.Add(c); }
            var free = new bool[W * H];
            int mask = Layers.WorldMask & ~(1 << Layers.IgnoreRaycast);
            for (int j = 0; j < H; j++) for (int i = 0; i < W; i++)
            {
                var p = new Vector3(x0 + (i + 0.5f) * cell, 0.9f, z0 + (j + 0.5f) * cell);
                free[j * W + i] = !Physics.CheckCapsule(p + Vector3.down * 0.55f, p + Vector3.up * 0.5f, 0.28f, mask, QueryTriggerInteraction.Ignore)
                                  && Physics.Raycast(p, Vector3.down, 1.2f, mask, QueryTriggerInteraction.Ignore);
            }
            foreach (var c in doors) c.enabled = true;
            int Idx(Vector2 v) => Mathf.Clamp(Mathf.FloorToInt((v.y - z0) / cell), 0, H - 1) * W + Mathf.Clamp(Mathf.FloorToInt((v.x - x0) / cell), 0, W - 1);
            int Near(int k) { if (free[k]) return k; int ci = k % W, cj = k / W; for (int r = 1; r < 10; r++) for (int dj = -r; dj <= r; dj++) for (int di = -r; di <= r; di++) { int ii = ci + di, jj = cj + dj; if (ii >= 0 && jj >= 0 && ii < W && jj < H && free[jj * W + ii]) return jj * W + ii; } return -1; }
            int s0 = Near(Idx(a)), g = Near(Idx(b));
            if (s0 < 0 || g < 0) return null;
            var prev = new int[W * H]; for (int k = 0; k < prev.Length; k++) prev[k] = -1;
            var q = new Queue<int>(); q.Enqueue(s0); prev[s0] = s0;
            int[] dx = { 1, -1, 0, 0, 1, 1, -1, -1 }, dz = { 0, 0, 1, -1, 1, -1, 1, -1 };
            while (q.Count > 0)
            {
                int k = q.Dequeue(); if (k == g) break;
                int ci = k % W, cj = k / W;
                for (int n = 0; n < 8; n++)
                {
                    int ii = ci + dx[n], jj = cj + dz[n]; if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
                    int nk = jj * W + ii; if (prev[nk] != -1 || !free[nk]) continue;
                    if (n >= 4 && (!free[cj * W + ii] || !free[jj * W + ci])) continue;
                    prev[nk] = k; q.Enqueue(nk);
                }
            }
            if (prev[g] == -1) return null;
            var pts = new List<Vector2>();
            for (int k = g; k != s0; k = prev[k]) pts.Add(new Vector2(x0 + (k % W + 0.5f) * cell, z0 + (k / W + 0.5f) * cell));
            pts.Add(a); pts.Reverse(); pts.Add(b);
            return pts;
        }

        void UpdateArrows(float dt)
        {
            if (arrowsRoot == null) return;
            if (s.Vars.Truthy("sat_once")) arrowFade = Mathf.Max(0f, arrowFade - dt * 2f);
            if (arrowFade <= 0f) { Destroy(arrowsRoot); arrowsRoot = null; return; }
            for (int i = 0; i < arrowMats.Count; i++)
            {
                float w = 0.5f + 0.5f * Mathf.Sin(elapsed * 3.2f - i * 0.7f);
                arrowMats[i].color = new Color(1, 1, 1, (0.22f + 0.4f * w) * arrowFade);
            }
        }

        void UpdateBlink()
        {
            if (!idleBlink) return;
            string idle = L.T("평가자 117 · 로그인 대기", "Evaluator 117 · awaiting login"), title = L.T("시냅스 평가 단말기", "Synapse Evaluation Terminal"), here = L.T("▶ 117 · 여기 ◀", "▶ 117 · HERE ◀");
            var t = s.Terminal;
            if (s.Vars.Truthy("sat_once") || t.CenterSub != idle) { idleBlink = false; if (t.CenterSub == idle) t.ShowCenter(title, idle); return; }
            string want = Mathf.FloorToInt(elapsed / 0.8f) % 2 == 1 ? here : title;
            if (t.CenterMain != want) t.ShowCenter(want, idle);
        }
    }
}
