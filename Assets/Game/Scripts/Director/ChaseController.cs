using System;
using System.Collections;
using System.Collections.Generic;
using NightEval.World;
using UnityEngine;

namespace NightEval.Director
{
    /// <summary>
    /// 추격: 입구에서 "회수 담당"이 들어와 플레이어를 쫓는다. 비상구에 닿으면 탈출, 잡히면 실패.
    /// 지금 외형은 테스트용 회전 고양이 (PropFactory.Cat). 외형만 바꾸면 그대로 괴물이 된다.
    /// 길찾기: 시야가 트이면 곧장, 아니면 플레이어가 지나간 자취를 따라온다 (벽에 끼지 않음).
    /// </summary>
    public sealed class ChaseController : MonoBehaviour
    {
        public float StartDelay = 4.2f;      // 고양이가 보이고 움직이기 시작하기까지
        public float SpeedStart = 2.6f;
        public float SpeedMax = 4.1f;
        public float RampTime = 12f;
        public float CatchDistance = 0.85f;
        public float EscapeDistance = 1.15f;

        Session s;
        WorldRegistry w;
        PropFactory pf;
        GameObject cat;
        Transform visual;
        AudioSource voice;
        readonly List<Vector3> trail = new List<Vector3>();
        Action<bool> onDone;
        bool running, finished;
        float t, speed;

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
            var spawn = w.Anchor("CatSpawn");
            Vector3 start = spawn != null ? spawn.position : new Vector3(-1.5f, 0f, -6.7f);
            cat = pf.Cat(w.Root, start);
            visual = cat.transform.Find("Visual");
            Vector3 toPlayer = s.Player.transform.position - start;
            toPlayer.y = 0f;
            if (toPlayer.sqrMagnitude > 0.01f) cat.transform.rotation = Quaternion.LookRotation(toPlayer.normalized);
            voice = s.Audio.Loop3D("sfx_cat", cat.transform, 0.75f, 1.5f, 16f);

            // 비상구 쪽 문에서 E 로도 나갈 수 있게
            if (w.Interactables.TryGetValue("ExitDoor", out var exit))
                exit.Add("비상구로 나간다", () => running && !finished, () => Finish(true), 50, this);

            // 먼저 입구 문을 지나 사무실 안으로 들어온다
            trail.Clear();
            var door = w.Anchor("FrontDoor");
            Vector3 doorway = door != null ? new Vector3(door.position.x, 0f, door.position.z) : new Vector3(-1.5f, 0f, -5f);
            trail.Add(doorway + new Vector3(0f, 0f, -0.3f));
            trail.Add(doorway + new Vector3(0f, 0f, 0.8f));
            trail.Add(s.Player.transform.position);
            float wait = StartDelay;
            while (wait > 0f)
            {
                wait -= Time.deltaTime;
                RecordTrail();
                Spin();
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
                MoveCat();
                Spin();
                if (CheckEscape()) yield break;
                Vector3 d = s.Player.transform.position - cat.transform.position;
                d.y = 0f;
                if (d.magnitude < CatchDistance)
                {
                    Finish(false);
                    yield break;
                }
                yield return null;
            }
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

        void MoveCat()
        {
            Vector3 pos = cat.transform.position;
            Vector3 player = s.Player.transform.position;
            Vector3 target;
            if (ClearLine(pos, player))
            {
                target = player;
                // 지나온 자취 중 이미 앞지른 점은 버린다
                trail.Clear();
                trail.Add(player);
            }
            else
            {
                while (trail.Count > 1 && Flat(trail[0] - pos).magnitude < 0.3f) trail.RemoveAt(0);
                // 보이는 자취 중 가장 먼 점으로 지름길
                int best = 0;
                for (int i = Mathf.Min(trail.Count - 1, 12); i > 0; i--)
                {
                    if (ClearLine(pos, trail[i])) { best = i; break; }
                }
                if (best > 0) trail.RemoveRange(0, best);
                target = trail.Count > 0 ? trail[0] : player;
            }
            Vector3 step = Flat(target - pos);
            float dist = step.magnitude;
            if (dist > 0.001f)
            {
                Vector3 move = step / dist * Mathf.Min(dist, speed * Time.deltaTime);
                cat.transform.position = new Vector3(pos.x + move.x, 0f, pos.z + move.z);
            }
        }

        static Vector3 Flat(Vector3 v) { v.y = 0f; return v; }

        void Spin()
        {
            if (visual == null) return;
            visual.Rotate(0f, 820f * Time.deltaTime, 0f, Space.Self);
            visual.localPosition = new Vector3(0f, Mathf.Abs(Mathf.Sin(Time.time * 9f)) * 0.06f, 0f);
        }

        bool CheckEscape()
        {
            var exit = w.Anchor("ExitPoint");
            if (exit == null || finished) return finished;
            Vector3 d = Flat(s.Player.transform.position - exit.position);
            if (d.magnitude < EscapeDistance)
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
            if (!escaped && cat != null)
            {
                // 잡혀도 비명·점프스케어 없이 조용히 암전
                s.Player.SetControl(false, false);
                s.Audio.Play2D("sfx_catch", 0.5f);
            }
            else
            {
                s.Audio.PlayAt("sfx_door_open", w.Anchor("ExitDoor") != null ? w.Anchor("ExitDoor").position : s.Player.transform.position, 0.7f, 0.03f, 10f);
                s.Player.SetControl(false, false);
            }
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
