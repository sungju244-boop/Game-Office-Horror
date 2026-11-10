// 경로 추적 미니게임의 판정 (브라우저판 web/js/maze.js 와 같은 규칙, UnityEngine 비의존).
// 검은 화면 = 감시 구간, 민트색 길 = 감시를 피해 가는 경로. 커서로 길을 따라가 도착점의 코드를 눌러 실행한다.
// 벽(검은 곳)에 닿으면 출발점으로 돌아간다. 시간은 계속 흐른다. 좌표는 단말기 화면(1024×768, 위에서 아래로 y) 기준.
using System;
using System.Collections.Generic;

namespace NightEval.Story
{
    public sealed class MazePath
    {
        public float W;              // 폭(칸)
        public bool Hidden;          // 가까이 가야 드러나는 숨은 길
        public List<float[]> Pts = new List<float[]>();
        public MazePath(float w, bool hidden, params float[] xy) { W = w; Hidden = hidden; for (int i = 0; i + 1 < xy.Length; i += 2) Pts.Add(new[] { xy[i], xy[i + 1] }); }
    }

    public sealed class MazeGoalDef
    {
        public string Key, Code; public float X, Y; public bool Hidden;
        public MazeGoalDef(string key, string code, float x, float y, bool hidden = false) { Key = key; Code = code; X = x; Y = y; Hidden = hidden; }
    }

    public sealed class MazeDef
    {
        public float Time; public float StartX, StartY;
        public List<MazePath> Paths = new List<MazePath>();
        public List<MazeGoalDef> Goals = new List<MazeGoalDef>();
    }

    public struct MRect
    {
        public float X, Y, W, H;
        public MRect(float x, float y, float w, float h) { X = x; Y = y; W = w; H = h; }
        public bool Inside(float px, float py, float m) => px >= X + m && px <= X + W - m && py >= Y + m && py <= Y + H - m;
    }

    public static class MazeMaps
    {
        public const float Cell = 32, OX = 0, OY = 96; public const int Rows = 17, Cols = 32;
        public const float MazeH = Rows * Cell;
        public static float Px(float gx) => OX + gx * Cell;
        public static float Py(float gy) => OY + gy * Cell;

        public static readonly Dictionary<string, MazeDef> All = new Dictionary<string, MazeDef>
        {
            ["calibrate"] = new MazeDef { Time = 45, StartX = 2.5f, StartY = 8.5f,
                Paths = { new MazePath(2.6f, false, 2.5f, 8.5f, 9.5f, 8.5f, 9.5f, 3.5f, 18.5f, 3.5f, 18.5f, 12.5f, 25f, 12.5f) },
                Goals = { new MazeGoalDef("done", "calibrate()", 27.6f, 12.5f) } },
            ["log01"] = new MazeDef { Time = 25, StartX = 2.5f, StartY = 8.5f,
                Paths = {
                    new MazePath(2.8f, false, 2.5f, 8.5f, 11.5f, 8.5f, 11.5f, 2.5f, 17f, 2.5f),
                    new MazePath(1.05f, false, 2.5f, 8.5f, 2.5f, 14.5f, 7.5f, 14.5f, 7.5f, 11.5f, 14.5f, 11.5f, 14.5f, 15f, 21.5f, 15f, 21.5f, 10.5f, 26f, 10.5f, 26f, 14f, 27f, 14f),
                    new MazePath(1.05f, true, 21.5f, 10.5f, 21.5f, 6.5f, 24.5f, 6.5f) },
                Goals = { new MazeGoalDef("direct", "send(direct)", 20.2f, 2.5f), new MazeGoalDef("subtle", "send(subtle)", 28.6f, 14f), new MazeGoalDef("hidden", "who_is_talking()", 28.2f, 6.5f, true) } },
            ["log02"] = new MazeDef { Time = 25, StartX = 2.5f, StartY = 8.5f,
                Paths = {
                    new MazePath(2.8f, false, 2.5f, 8.5f, 11.5f, 8.5f, 11.5f, 14f, 17f, 14f),
                    new MazePath(1.05f, false, 2.5f, 8.5f, 2.5f, 2.5f, 8.5f, 2.5f, 8.5f, 5.5f, 15.5f, 5.5f, 15.5f, 1.5f, 22.5f, 1.5f, 22.5f, 6.5f, 26f, 6.5f, 26f, 3f, 27f, 3f) },
                Goals = { new MazeGoalDef("direct", "send(direct)", 20.2f, 14f), new MazeGoalDef("subtle", "send(subtle)", 28.6f, 3f) } },
            ["log03"] = new MazeDef { Time = 25, StartX = 2.5f, StartY = 8.5f,
                Paths = {
                    new MazePath(2.6f, false, 2.5f, 8.5f, 8.5f, 8.5f, 8.5f, 14.5f, 15f, 14.5f),
                    new MazePath(0.95f, false, 2.5f, 8.5f, 2.5f, 3.5f, 6.5f, 3.5f, 6.5f, 1.5f, 12.5f, 1.5f, 12.5f, 6.5f, 17.5f, 6.5f, 17.5f, 2.5f, 23.5f, 2.5f, 23.5f, 9.5f, 20.5f, 9.5f, 20.5f, 11.5f, 27f, 11.5f),
                    new MazePath(0.95f, false, 12.5f, 6.5f, 12.5f, 10.5f, 14.5f, 10.5f),   // 막다른 길
                    new MazePath(0.95f, false, 23.5f, 9.5f, 27.5f, 9.5f, 27.5f, 7f),       // 막다른 길
                    new MazePath(0.95f, true, 23.5f, 2.5f, 25.2f, 2.5f) },
                Goals = { new MazeGoalDef("direct", "send(direct)", 18.2f, 14.5f), new MazeGoalDef("subtle", "send(subtle)", 28.6f, 11.5f), new MazeGoalDef("hidden", "who_is_talking()", 28.6f, 2.5f, true) } },
            ["log04"] = new MazeDef { Time = 25, StartX = 2.5f, StartY = 8.5f,
                Paths = {
                    new MazePath(2.8f, false, 2.5f, 8.5f, 12.5f, 8.5f, 12.5f, 3f, 17f, 3f),
                    new MazePath(1.0f, false, 2.5f, 8.5f, 2.5f, 14.5f, 9.5f, 14.5f, 9.5f, 11.5f, 16.5f, 11.5f, 16.5f, 15f, 23.5f, 15f, 23.5f, 9.5f, 27f, 9.5f) },
                Goals = { new MazeGoalDef("direct", "send(direct)", 20.2f, 3f), new MazeGoalDef("subtle", "send(subtle)", 28.6f, 9.5f) } },
            ["log05"] = new MazeDef { Time = 25, StartX = 2.5f, StartY = 8.5f,
                Paths = {
                    new MazePath(2.6f, false, 2.5f, 8.5f, 7.5f, 8.5f, 7.5f, 2.5f, 14f, 2.5f),
                    new MazePath(0.85f, false, 2.5f, 8.5f, 2.5f, 14.5f, 6.5f, 14.5f, 6.5f, 11.5f, 10.5f, 11.5f, 10.5f, 15.2f, 14.5f, 15.2f, 14.5f, 8.5f, 18.5f, 8.5f, 18.5f, 13.5f, 22.5f, 13.5f, 22.5f, 5.5f, 25.5f, 5.5f, 25.5f, 12.5f, 27f, 12.5f),
                    new MazePath(0.85f, false, 14.5f, 8.5f, 14.5f, 5.5f, 11.5f, 5.5f),     // 막다른 길
                    new MazePath(0.85f, false, 18.5f, 13.5f, 18.5f, 15.6f),                 // 막다른 길
                    new MazePath(0.85f, true, 22.5f, 5.5f, 22.5f, 1.5f, 24.6f, 1.5f) },
                Goals = { new MazeGoalDef("direct", "send(direct)", 17.2f, 2.5f), new MazeGoalDef("subtle", "send(subtle)", 28.6f, 12.5f), new MazeGoalDef("hidden", "who_is_talking()", 28.6f, 1.5f, true) } },
        };
    }

    public sealed class MazeGoal { public MazeGoalDef Def; public MRect Rect; public bool HasRect; }

    /// <summary>미로 한 판의 상태. 그리기는 단말기 쪽이 맡는다.</summary>
    public sealed class MazeState
    {
        public const float CursorR = 5;
        public readonly MazeDef Def;
        public readonly float Time;
        public float Left;
        public readonly bool Relative, HasDrag;
        public readonly List<MRect> Rects = new List<MRect>(), HiddenRects = new List<MRect>();
        public readonly List<MazeGoal> Goals = new List<MazeGoal>();
        public MRect Start;
        public float CX, CY;
        public readonly List<float[]> Trail = new List<float[]>();
        public bool Engaged, HiddenUsed, Measured;
        public float Freeze, HitFlash, Noise, Revealed, T, Blink, Sweep;
        public int Hover = -1;
        public string Result;
        public string Bubble; public float BubbleT;
        public bool Dragging; float dragDX, dragDY, dragSpeed, dragT;
        bool dragDone; readonly float dragAt;

        public Action<string, float> Sfx;
        public Action OnHit, OnHidden, OnDrag;

        public MazeState(MazeDef def, float time, bool relative, bool drag, Random rng = null)
        {
            Def = def; Time = time; Left = time; Relative = relative; HasDrag = drag;
            rng = rng ?? new Random();
            // 도착점 가까이 끝나는 길은 도착 상자 중심까지 이어 준다
            var paths = new List<MazePath>();
            foreach (var p in def.Paths) { var c = new MazePath(p.W, p.Hidden); foreach (var q in p.Pts) c.Pts.Add(new[] { q[0], q[1] }); paths.Add(c); }
            foreach (var gd in def.Goals)
            {
                MazePath best = null; double bd = 5;
                foreach (var p in paths)
                {
                    var e = p.Pts[p.Pts.Count - 1]; double d = Math.Sqrt((e[0] - gd.X) * (e[0] - gd.X) + (e[1] - gd.Y) * (e[1] - gd.Y));
                    if (d < bd && p.Hidden == gd.Hidden) { bd = d; best = p; }
                }
                if (best != null)
                {
                    var e = best.Pts[best.Pts.Count - 1];
                    if (e[1] != gd.Y) best.Pts.Add(new[] { e[0], gd.Y });
                    best.Pts.Add(new[] { gd.X, gd.Y });
                }
            }
            foreach (var p in paths) (p.Hidden ? HiddenRects : Rects).AddRange(PathRects(p));
            Start = new MRect(MazeMaps.Px(def.StartX) - MazeMaps.Cell, MazeMaps.Py(def.StartY) - MazeMaps.Cell, MazeMaps.Cell * 2, MazeMaps.Cell * 2);
            Rects.Add(Start);
            foreach (var gd in def.Goals) Goals.Add(new MazeGoal { Def = gd });
            CX = MazeMaps.Px(def.StartX); CY = MazeMaps.Py(def.StartY);
            dragDone = !drag; dragAt = time * (0.42f + (float)rng.NextDouble() * 0.12f);
        }

        static IEnumerable<MRect> PathRects(MazePath p)
        {
            float hw = p.W * MazeMaps.Cell / 2;
            for (int i = 0; i < p.Pts.Count - 1; i++)
            {
                float ax = MazeMaps.Px(p.Pts[i][0]), ay = MazeMaps.Py(p.Pts[i][1]), bx = MazeMaps.Px(p.Pts[i + 1][0]), by = MazeMaps.Py(p.Pts[i + 1][1]);
                float x0 = Math.Min(ax, bx) - hw, x1 = Math.Max(ax, bx) + hw, y0 = Math.Min(ay, by) - hw, y1 = Math.Max(ay, by) + hw;
                yield return new MRect(x0, y0, x1 - x0, y1 - y0);
            }
        }

        /// <summary>도착 상자 크기는 글자 폭에 따라 정한다. measure: 24px 굵은 글꼴의 폭</summary>
        public void Measure(Func<string, float> measure)
        {
            foreach (var g in Goals)
            {
                float w = (float)Math.Ceiling(measure(g.Def.Code)) + 28, h = 50;
                float x = Math.Max(6, Math.Min(1018 - w, MazeMaps.Px(g.Def.X) - w / 2));
                g.Rect = new MRect(x, MazeMaps.Py(g.Def.Y) - h / 2, w, h); g.HasRect = true;
                (g.Def.Hidden ? HiddenRects : Rects).Add(g.Rect);
            }
            Measured = true;
        }

        static bool InsideAny(float x, float y, List<MRect> list, float m = 3) { foreach (var r in list) if (r.Inside(x, y, m)) return true; return false; }
        public bool OnPath(float x, float y) => InsideAny(x, y, Rects) || (Revealed > 0.5f && !HiddenUsed && InsideAny(x, y, HiddenRects));
        public int GoalAt(float x, float y)
        {
            for (int i = 0; i < Goals.Count; i++)
            {
                var g = Goals[i];
                if (!g.HasRect || (g.Def.Hidden && (HiddenUsed || Revealed < 0.5f))) continue;
                if (g.Rect.Inside(x, y, 0)) return i;
            }
            return -1;
        }
        bool InStart(float x, float y) => x >= Start.X - 6 && x <= Start.X + Start.W + 6 && y >= Start.Y - 6 && y <= Start.Y + Start.H + 6;

        /// <summary>절대 좌표로 커서를 옮긴다. 길 밖으로 나가는 순간 벽 충돌.</summary>
        public void MoveTo(float nx, float ny)
        {
            if (Result != null || Dragging) return;
            nx = Math.Max(2, Math.Min(1022, nx)); ny = Math.Max(2, Math.Min(766, ny));
            if (Engaged && Freeze <= 0)
            {
                int steps = Math.Max(1, (int)Math.Ceiling(Math.Sqrt((nx - CX) * (nx - CX) + (ny - CY) * (ny - CY)) / 3));
                for (int k = 1; k <= steps; k++)
                {
                    float x = CX + (nx - CX) * k / steps, y = CY + (ny - CY) * k / steps;
                    if (!OnPath(x, y)) { CX = x; CY = y; WallHit(true); return; }
                }
            }
            if (Freeze > 0 && Relative) return;
            CX = nx; CY = ny;
            Trail.Add(new[] { nx, ny }); if (Trail.Count > 10) Trail.RemoveAt(0);
            UpdateHover();
        }
        public void MoveBy(float dx, float dy) => MoveTo(CX + dx, CY + dy);
        void UpdateHover() { int h = GoalAt(CX, CY); if (h != Hover) { Hover = h; if (h >= 0) Sfx?.Invoke("sfx_ui_hover", 0.25f); } }

        public void Click()
        {
            if (Result != null || Dragging) return;
            if (!Engaged)
            {
                if (InStart(CX, CY))
                {
                    Engaged = true; Freeze = 0;
                    if (Relative) { CX = MazeMaps.Px(Def.StartX); CY = MazeMaps.Py(Def.StartY); }
                    Sfx?.Invoke("sfx_ui_select", 0.35f);
                }
                else Sfx?.Invoke("sfx_click", 0.2f);
                return;
            }
            int gi = GoalAt(CX, CY);
            if (gi < 0) return;
            var g = Goals[gi];
            if (g.Def.Key == "hidden")
            {
                HiddenUsed = true; Hover = -1;
                Sfx?.Invoke("sfx_static_2", 0.5f);
                ToStart();
                OnHidden?.Invoke();
                return;
            }
            Sfx?.Invoke("sfx_ui_select", 0.5f);
            Finish(g.Def.Key);
        }

        void ToStart()
        {
            CX = MazeMaps.Px(Def.StartX); CY = MazeMaps.Py(Def.StartY); Trail.Clear();
            if (Relative) { Engaged = true; Freeze = 0.35f; } else Engaged = false;
        }
        void WallHit(bool counted)
        {
            HitFlash = 0.45f; Noise = 0.5f;
            Sfx?.Invoke("sfx_maze_hit", 0.7f);
            ToStart();
            if (counted) OnHit?.Invoke();
        }

        /// <summary>결과가 정해진 뒤 잠깐(시간 초과 0.9초, 실행 0.65초) 보여 주고 끝낸다. 단말기가 ResultDelay 동안 기다린다.</summary>
        public float ResultDelay => Result == "timeout" ? 0.9f : 0.65f;
        void Finish(string key) { if (Result == null) Result = key; }
        public void Abort(string key) { if (Result == null) Result = key; }
        public void Say(string text, float dur = 3.2f) { Bubble = text; BubbleT = dur; }

        /// <summary>커서가 혼자 벽 쪽으로 끌려간다 (연출). 끌려가서 닿은 건 충돌로 세지 않는다</summary>
        public void Drag(float speed = 260)
        {
            float bdx = 1, bdy = 0, bd = 1e9f; bool found = false;
            for (int a = 0; a < 16; a++)
            {
                double ang = a / 16.0 * Math.PI * 2;
                for (float d = 4; d < 220; d += 4)
                {
                    float x = CX + (float)Math.Cos(ang) * d, y = CY + (float)Math.Sin(ang) * d;
                    if (!OnPath(x, y)) { if (d < bd) { bd = d; bdx = (float)Math.Cos(ang); bdy = (float)Math.Sin(ang); found = true; } break; }
                }
            }
            if (!found) { bdx = 1; bdy = 0; }
            Dragging = true; dragDX = bdx; dragDY = bdy; dragSpeed = speed; dragT = 0;
            Sfx?.Invoke("sfx_static_3", 0.45f);
        }

        public void Update(float dt)
        {
            T += dt; Blink += dt; Sweep = (Sweep + dt * 0.18f) % 1f;
            if (Bubble != null) { BubbleT -= dt; if (BubbleT <= 0) Bubble = null; }
            HitFlash = Math.Max(0, HitFlash - dt); Noise = Math.Max(0, Noise - dt);
            if (Freeze > 0) Freeze -= dt;
            if (Result != null) return;
            // 숨은 길: 가까이 가면 서서히 드러난다
            if (HiddenRects.Count > 0 && !HiddenUsed)
            {
                bool near = false;
                foreach (var r in HiddenRects)
                {
                    float dx = Math.Max(Math.Max(r.X - CX, 0), CX - (r.X + r.W)), dy = Math.Max(Math.Max(r.Y - CY, 0), CY - (r.Y + r.H));
                    if (Math.Sqrt(dx * dx + dy * dy) < 70) { near = true; break; }
                }
                Revealed = Math.Max(0, Math.Min(1, Revealed + (near ? dt * 1.6f : -dt * 0.5f)));
            }
            if (Dragging)
            {
                dragT += dt;
                float st = dragSpeed * dt, nx = CX + dragDX * st, ny = CY + dragDY * st;
                CX = nx; CY = ny; Trail.Add(new[] { nx, ny }); if (Trail.Count > 10) Trail.RemoveAt(0);
                if (!OnPath(nx, ny) || dragT > 1.6f) { Dragging = false; WallHit(false); }
                return;
            }
            Left -= dt;
            if (!dragDone && Engaged && Time - Left >= dragAt) { dragDone = true; OnDrag?.Invoke(); }
            if (Left <= 0) { Left = 0; Sfx?.Invoke("sfx_static_1", 0.6f); Finish("timeout"); }
        }
    }
}
