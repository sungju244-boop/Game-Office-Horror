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
        FigureRig rig;
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
            sup = new GameObject("Supervisor");
            sup.transform.SetParent(w.Root, false);
            sup.transform.position = start;
            GameObject model = null;
            yield return FigureLoader.Load("sup", sup.transform, m => model = m);
            if (model != null)
            {
                rig = sup.AddComponent<FigureRig>();
                rig.Setup(model, FigureLoader.ReadBones("sup"), 2.1f);
            }
            else BoxFigure(sup.transform);
            Vector3 toPlayer = Flat(s.Player.transform.position - start);
            if (toPlayer.sqrMagnitude > 0.01f) sup.transform.rotation = Quaternion.LookRotation(toPlayer.normalized);
            voice = s.Audio.Loop3D("mon_breath", rig != null ? rig.Head : sup.transform, 0.8f, 0.8f, 14f);

            // 서버실 문이 열리고, 비상구 잠금이 풀린다
            if (w.Doors.TryGetValue("ServerDoor", out var sd)) { sd.SetLocked(false); sd.SetOpen(1f, 0.8f); s.Audio.PlayAt("sfx_door_bang", sd.transform.position + Vector3.up, 0.9f, 0.03f, 30f); }
            if (w.Doors.TryGetValue("ExitDoor", out var ed)) ed.SetLocked(false);
            s.Audio.Play2D("sfx_alarm", 0.4f);
            if (w.Interactables.TryGetValue("ExitDoor", out var exit))
                exit.Add("비상구로 나간다", () => (running || !finished), () => Finish(true), 50, this);

            // 먼저 서버실 문을 지나 사무실로 나온다
            trail.Clear();
            var door = w.Anchor("ServerDoor");
            if (door != null) { var dp = Flat(door.position); trail.Add(dp + new Vector3(0.6f, 0f, 0f)); trail.Add(dp + new Vector3(-0.8f, 0f, 0f)); }
            trail.Add(s.Player.transform.position);
            float wait = StartDelay;
            while (wait > 0f)
            {
                wait -= Time.deltaTime;
                RecordTrail();
                if (rig != null) rig.Walk(Time.deltaTime, 0f, false);
                if (CheckEscape()) yield break;
                yield return null;
            }

            running = true;
            t = 0f;
            while (!finished)
            {
                t += Time.deltaTime;
                speed = Mathf.Lerp(SpeedStart, SpeedMax, Mathf.Clamp01(t / RampTime));
                RecordTrail();
                MoveSup();
                if (rig != null && rig.Walk(Time.deltaTime, speed, true))
                    s.Audio.PlayAt("mon_step_" + (1 + stepN++ % 3), sup.transform.position, 0.9f, 0.06f, 24f);
                if (CheckEscape()) yield break;
                if (Flat(s.Player.transform.position - sup.transform.position).magnitude < CatchDistance)
                {
                    Finish(false);
                    yield break;
                }
                yield return null;
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
            if (voice != null) Destroy(voice.gameObject, 0.1f);
            if (w.Interactables.TryGetValue("ExitDoor", out var exit)) exit.RemoveOwner(this);
            s.Player.SetControl(false, false);
            if (!escaped)
            {
                // 잡힘: 비명 + 번쩍 (깜짝 장면 그림은 2단계)
                s.Audio.Play2D("js_shriek", 0.8f);
                s.Post.Flash(1f);
            }
            else s.Audio.PlayAt("sfx_door_open", w.Anchor("ExitDoor") != null ? w.Anchor("ExitDoor").position : s.Player.transform.position, 0.7f, 0.03f, 10f);
            onDone?.Invoke(escaped);
        }

        public void StopChase()
        {
            finished = true;
            running = false;
            StopAllCoroutines();
        }
    }
}
