using System;
using System.Collections;
using System.Collections.Generic;
using NightEval.World;
using UnityEngine;

namespace NightEval.Director
{
    /// <summary>
    /// 추격 (엔딩 2): 서버실 문이 열리고 감독관이 걸어 나와 플레이어를 쫓는다. 서쪽 비상구에 닿으면 탈출, 잡히면 실패.
    /// 외형: CC0 모델 Observer (glTFast, StreamingAssets/models/sup.glb). 없으면 어두운 상자 형체.
    /// 길찾기: 시야가 트이면 곧장, 아니면 플레이어가 지나간 자취를 따라온다 (벽에 끼지 않음).
    /// 1단계: 1인칭 그대로 달린다. 위에서 내려다보는 CCTV 화면·쓰러지는 캐비닛은 2단계 (브라우저판 참고).
    /// </summary>
    public sealed class ChaseController : MonoBehaviour
    {
        public float StartDelay = 3.0f;      // 서버실 문이 열리고 움직이기 시작하기까지
        public float SpeedStart = 2.5f;      // 브라우저판과 같다 (플레이어 달리기 4.9m/s)
        public float SpeedMax = 4.15f;
        public float RampTime = 8f;
        public float CatchDistance = 0.85f;
        public float EscapeDistance = 1.15f;

        Session s;
        WorldRegistry w;
        PropFactory pf;
        GameObject sup;
        FigureDirector.Fig fig;
        public const float UncleSpeed = 1.2f; // 겁쟁이 모드: 걷기 속도의 1/4 정도로 춤추며 다가온다
        float voiceT = 0.3f; bool voiceB;
        AudioSource alarm;

        /// <summary>겁쟁이 모드: 영상 속 "샨쎈부!"(A)와 "랑쓰티치오우!"(C)를 쉬지 않고 번갈아</summary>
        void ChickenVoice()
        {
            voiceT -= Time.deltaTime;
            if (voiceT > 0f) return;
            voiceB = !voiceB;
            s.Audio.PlayAt(voiceB ? "tp_a" : "tp_c", sup.transform.position + Vector3.up * 1.4f, 1f, 0f, 30f);
            voiceT = (voiceB ? 0.78f : 1.1f) + 0.12f;
        }
        AudioSource voice;
        readonly List<Vector3> trail = new List<Vector3>();
        Action<bool> onDone;
        bool running, finished;
        float t, speed;
        int stepN;

        public bool Running => running;

        public void Init(Session session)
        {
            s = session;
            w = session.World;
            pf = new PropFactory(session.Ctx);
        }

        public void Begin(Action<bool> callback)
        {
            onDone = callback;
            finished = false;
            StartCoroutine(Routine());
        }

        IEnumerator Routine()
        {
            var spawn = w.Anchor("SupSpawn");
            Vector3 start = spawn != null ? spawn.position : new Vector3(13.4f, 0f, 7.6f);
            start.y = 0f;
            while (!s.Figures.Ready) yield return null;
            bool chicken = s.Figures.Chicken;
            if (chicken) { SpeedStart = SpeedMax = UncleSpeed; }
            var cam3 = w.Cctvs.TryGetValue("CAM3", out var c3) ? c3 : null;
            fig = s.Figures.Show("sup", start, FigureDirector.YawTo(start, cam3 != null ? cam3.transform.position : s.Player.transform.position), chicken ? 0f : 0.9f);
            sup = fig.Root;
            if (!chicken) voice = s.Audio.Loop3D("mon_breath", fig.Head, 0.8f, 0.8f, 14f);
            if (w.Doors.TryGetValue("ExitDoor", out var ed)) ed.SetLocked(false);
            s.Audio.SetMusic("chase"); s.Audio.SetTension(3); s.Terminal.Tension = 3;
            alarm = s.Audio.Loop3D("sfx_alarm", s.Player.transform, chicken ? 0.2f : 0.55f, 2f, 60f);
            if (w.Interactables.TryGetValue("ExitDoor", out var exit))
                exit.Add("비상구로 나간다", () => running && !finished, () => Finish(true), 50, this);

            // 1) 서버실 CCTV: 어둠 속 감독관 (앉아 있으면 단말기에)
            if (s.Seat.IsSeated)
            {
                var rt = s.Env.EnsureFeed("CAM3");
                if (rt != null) s.Terminal.ShowFeed(rt);
                yield return new WaitForSeconds(3.4f);
                s.Terminal.HideFeed();
                // 2) 일어난다
                s.Seat.ForceExit(false);
                while (s.Seat.IsSeated || s.Seat.InTransition) yield return null;
            }
            else yield return new WaitForSeconds(1f);
            s.Player.SetControl(false, false);
            s.Hud.SetCrosshair(false);

            // 3) 멀리 서버실 문이 열리고 걸어 나온다 (카메라가 확대해서 보여 줌)
            var door = w.Anchor("ServerDoor");
            if (w.Doors.TryGetValue("ServerDoor", out var sd)) { sd.SetLocked(false); sd.SetOpen(1f, 0.35f); }
            if (door != null) { s.Audio.PlayAt("sfx_door_bang", door.position, 1f, 0.03f, 40f); if (!chicken) s.Audio.PlayAt("mon_roar", door.position, 0.9f, 0f, 40f); }
            Vector3 introTo = door != null ? Flat(door.position) + new Vector3(-1.1f, 0f, 0f) : start;
            var cam = s.Cam;
            float fov0 = cam.fieldOfView;
            float h = chicken ? 1.2f : 1.6f;
            while (Flat(introTo - sup.transform.position).magnitude > 0.05f && !finished)
            {
                Vector3 step = Flat(introTo - sup.transform.position);
                float st = Mathf.Min(step.magnitude, 1.8f * Time.deltaTime);
                sup.transform.position += step.normalized * st;
                sup.transform.rotation = Quaternion.Slerp(sup.transform.rotation, Quaternion.LookRotation(step.normalized), Time.deltaTime * 6f);
                fig.Speed = 1.8f;
                cam.fieldOfView = Mathf.Lerp(cam.fieldOfView, chicken ? 26f : 28f, Time.deltaTime * 3f);
                var look = Quaternion.LookRotation(sup.transform.position + Vector3.up * h - cam.transform.position);
                cam.transform.rotation = Quaternion.Slerp(cam.transform.rotation, look, Time.deltaTime * 5f);
                yield return null;
            }
            fig.Speed = 0f;
            yield return new WaitForSeconds(0.9f);
            // 4) 비상구 쪽을 보여 주고 조작을 돌려준다
            var corr = w.Anchor("Room_corridor");
            for (float t2 = 0; t2 < 1f && corr != null; t2 += Time.deltaTime)
            {
                cam.fieldOfView = Mathf.Lerp(cam.fieldOfView, fov0, Time.deltaTime * 4f);
                cam.transform.rotation = Quaternion.Slerp(cam.transform.rotation, Quaternion.LookRotation(corr.position - cam.transform.position), Time.deltaTime * 4f);
                yield return null;
            }
            cam.fieldOfView = fov0;
            cam.transform.localRotation = Quaternion.identity;
            StartTopdown();
            s.Hud.SetObjective("비상구로! (서쪽 끝 통로 → 북쪽)");
            s.Hud.Help("CCTV 화면 · WASD: 화면 방향으로 이동 · Shift: 달리기", 7f);

            // 먼저 서버실 문을 지나 사무실로 나온다
            trail.Clear();
            trail.Add(s.Player.transform.position);
            running = true;
            t = 0f;
            while (!finished)
            {
                t += Time.deltaTime;
                speed = Mathf.Lerp(SpeedStart, SpeedMax, Mathf.Clamp01(t / RampTime));
                RecordTrail();
                MoveSup();
                fig.Speed = speed;
                if (fig.Stepped && !s.Figures.Chicken) s.Audio.PlayAt("mon_step_" + (1 + stepN++ % 3), sup.transform.position, 0.9f, 0.06f, 24f);
                if (s.Figures.Chicken) ChickenVoice();
                UpdateTopdown();
                UpdateCabinets();
                if (CheckEscape()) yield break;
                if (Flat(s.Player.transform.position - sup.transform.position).magnitude < CatchDistance)
                {
                    Finish(false);
                    yield break;
                }
                yield return null;
            }
        }

        // ---------- 위에서 내려다보는 CCTV 화면 ----------
        bool topdown; int camMask0; Transform camParent0; float stagger;
        void StartTopdown()
        {
            var cam = s.Cam;
            camParent0 = cam.transform.parent; camMask0 = cam.cullingMask;
            cam.transform.SetParent(w.Root, true);
            cam.cullingMask = (camMask0 | (1 << Layers.Avatar)) & ~(1 << Layers.Ceiling);
            cam.fieldOfView = 52f;
            s.Player.SetPose(s.Player.transform.position, 0f); // 화면 위쪽 = 북쪽(+z)
            s.Player.SetControl(true, false);
            s.Player.AnyDirSprint = true;
            s.Hud.CctvOverlay(true);
            s.Post.Flash(0.6f); s.Audio.Ui("sfx_static_2", 0.45f);
            topdown = true;
            UpdateTopdown(true);
        }
        void UpdateTopdown(bool snap = false)
        {
            if (!topdown) return;
            var cam = s.Cam; var p = s.Player.transform.position;
            Vector3 want = new Vector3(p.x, 10f, p.z - 3.2f);
            cam.transform.position = snap ? want : Vector3.Lerp(cam.transform.position, want, Mathf.Min(1f, Time.deltaTime * 4f));
            cam.transform.rotation = Quaternion.LookRotation(new Vector3(p.x, 0f, p.z) - cam.transform.position, Vector3.forward);
            var ex = w.Anchor("ExitPoint");
            s.Hud.CctvOverlayUpdate(s.Vars.Get("clock"), ex != null ? cam.WorldToViewportPoint(ex.position) : (Vector3?)null);
            if (stagger > 0f) { stagger -= Time.deltaTime; s.Player.SpeedMul = 0.45f; } else s.Player.SpeedMul = 1f;
        }
        void StopTopdown()
        {
            if (!topdown) return;
            topdown = false;
            var cam = s.Cam;
            cam.transform.SetParent(camParent0, false);
            cam.transform.localPosition = Vector3.zero; cam.transform.localRotation = Quaternion.identity;
            cam.cullingMask = camMask0; cam.fieldOfView = 62f;
            s.Player.AnyDirSprint = false; s.Player.SpeedMul = 1f;
            s.Hud.CctvOverlay(false);
        }

        /// <summary>추격 중 탈출로의 캐비닛이 가까이 가면 쓰러진다. 밑에 깔리면 비틀거리며 밀려난다</summary>
        void UpdateCabinets()
        {
            var pp = s.Player.transform.position;
            foreach (var c in w.FallCabs)
            {
                if (c.State == 0)
                {
                    if (Flat(pp - c.Center).magnitude < 3.4f) { c.State = 1; c.T = 0f; s.Audio.PlayAt("sfx_chair", c.Center + Vector3.up * 1.2f, 0.9f, 0.03f, 12f); }
                }
                else if (c.State == 1)
                {
                    c.T += Time.deltaTime;
                    float k = Mathf.Min(1f, c.T / 0.6f);
                    c.transform.localRotation = Quaternion.Euler(0, c.Yaw, 0) * Quaternion.Euler(-90f * k * k, 0, 0);
                    if (k >= 1f)
                    {
                        c.State = 2;
                        Vector3 landed = c.transform.position + Quaternion.Euler(0, c.Yaw, 0) * Vector3.back * 0.66f; // 앞쪽으로 넘어진 몸통 가운데
                        s.Audio.PlayAt("sfx_door_bang", landed + Vector3.up * 0.5f, 1f, 0.03f, 26f);
                        float d = Flat(pp - landed).magnitude;
                        if (d < 0.9f)
                        {
                            stagger = 1.3f; s.Post.Flash(0.25f);
                            Vector3 away = Flat(pp - landed); if (away.sqrMagnitude < 0.01f) away = Vector3.right;
                            s.Player.SetPose(pp + away.normalized * (1.1f - d), s.Player.Yaw);
                        }
                    }
                }
            }
        }

        /// <summary>모델이 없을 때: 키 큰 어두운 상자 형체</summary>
        void BoxFigure(Transform root)
        {
            pf.Box(root, "Body", new Vector3(0.42f, 0.9f, 0.24f), new Vector3(0, 1.35f, 0), "cloth");
            pf.Box(root, "Head", new Vector3(0.36f, 0.36f, 0.36f), new Vector3(0, 2.0f, 0), "plastic_dark");
            foreach (var x in new[] { -0.12f, 0.12f }) pf.Box(root, "Leg", new Vector3(0.12f, 0.9f, 0.14f), new Vector3(x, 0.45f, 0), "cloth");
            foreach (var x in new[] { -0.3f, 0.3f }) pf.Box(root, "Arm", new Vector3(0.09f, 0.9f, 0.1f), new Vector3(x, 1.3f, 0.2f), "cloth", new Vector3(-70f, 0, 0));
        }

        void RecordTrail()
        {
            Vector3 p = s.Player.transform.position;
            if (trail.Count == 0 || (p - trail[trail.Count - 1]).sqrMagnitude > 0.09f) trail.Add(p);
        }

        bool ClearLine(Vector3 from, Vector3 to)
        {
            Vector3 a = from + Vector3.up * 0.45f, b = to + Vector3.up * 0.45f;
            Vector3 dir = b - a;
            float len = dir.magnitude;
            if (len < 0.01f) return true;
            return !Physics.SphereCast(a, 0.22f, dir / len, out _, len, Layers.WorldMask, QueryTriggerInteraction.Ignore);
        }

        void MoveSup()
        {
            Vector3 pos = sup.transform.position;
            Vector3 player = s.Player.transform.position;
            Vector3 target;
            if (ClearLine(pos, player))
            {
                target = player;
                trail.Clear();
                trail.Add(player);
            }
            else
            {
                while (trail.Count > 1 && Flat(trail[0] - pos).magnitude < 0.3f) trail.RemoveAt(0);
                int best = 0;
                for (int i = Mathf.Min(trail.Count - 1, 12); i > 0; i--)
                    if (ClearLine(pos, trail[i])) { best = i; break; }
                if (best > 0) trail.RemoveRange(0, best);
                target = trail.Count > 0 ? trail[0] : player;
            }
            Vector3 step = Flat(target - pos);
            float dist = step.magnitude;
            if (dist > 0.001f)
            {
                Vector3 move = step / dist * Mathf.Min(dist, speed * Time.deltaTime);
                sup.transform.position = new Vector3(pos.x + move.x, 0f, pos.z + move.z);
                var look = Quaternion.LookRotation(step / dist);
                sup.transform.rotation = Quaternion.Slerp(sup.transform.rotation, look, Mathf.Min(1f, Time.deltaTime * 6f));
            }
        }

        static Vector3 Flat(Vector3 v) { v.y = 0f; return v; }

        bool CheckEscape()
        {
            var exit = w.Anchor("ExitPoint");
            if (exit == null || finished) return finished;
            if (Flat(s.Player.transform.position - exit.position).magnitude < EscapeDistance)
            {
                Finish(true);
                return true;
            }
            return false;
        }

        void Finish(bool escaped)
        {
            if (finished) return;
            finished = true;
            running = false;
            StopTopdown();
            s.Hud.SetObjective(null);
            if (voice != null) Destroy(voice.gameObject, 0.1f);
            if (alarm != null) Destroy(alarm.gameObject, 0.3f);
            if (w.Interactables.TryGetValue("ExitDoor", out var exit)) exit.RemoveOwner(this);
            s.Player.SetControl(false, false);
            if (!escaped)
            {
                // 잡힘: 깜짝 장면 (겁쟁이 모드는 휴지 얼굴 + 외침)
                if (s.Figures.Chicken) { s.Hud.Jumpscare("tp", 1.6f); s.Audio.Play2D("tp_ac", 0.95f); }
                else { s.Hud.Jumpscare("sup", 1.2f); s.Audio.Play2D("js_shriek", 0.8f); s.Post.Flash(1f); }
            }
            else s.Audio.PlayAt("sfx_door_open", w.Anchor("ExitDoor") != null ? w.Anchor("ExitDoor").position : s.Player.transform.position, 0.7f, 0.03f, 10f);
            onDone?.Invoke(escaped);
        }

        public void StopChase()
        {
            if (fig != null) { s.Figures.Hide("sup"); fig = null; }
            StopTopdown();
            finished = true;
            running = false;
            StopAllCoroutines();
        }
    }
}
