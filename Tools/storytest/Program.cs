// 이야기 데이터 검증기 (story.json v2): 모든 선택·미로 결과·추격 결과를 끝까지 따라가 엔딩 도달, 참조 오류,
// 판정 규칙, 할 일 깃발, 미로 길(출발점 → 도착점이 이어져 있는지)을 검사한다. 게임과 같은 이야기 코드를 그대로 쓴다.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using NightEval.Story;

static class Program
{
    static StoryData data;
    static readonly List<string> errors = new List<string>();
    static readonly HashSet<string> warnings = new HashSet<string>();
    static readonly Dictionary<string, int> endingHits = new Dictionary<string, int>();
    static readonly HashSet<string> visited = new HashSet<string>();
    static readonly HashSet<string> seenStates = new HashSet<string>();
    static readonly Dictionary<string, List<StoryAction>> flagSources = new Dictionary<string, List<StoryAction>>();
    static int paths;

    static int Main(string[] args)
    {
        string root = args.Length > 0 ? args[0] : "../..";
        data = StoryData.FromJson(File.ReadAllText(Path.Combine(root, "Assets/StreamingAssets/Story/story.json")));
        Console.WriteLine($"노드 {data.Nodes.Count}개, 이벤트 {data.Events.Count}개, 엔딩 {data.Endings.Count}개, 장 {data.Chapters.Count}개, 규칙 {data.Rules.Count}개");

        CheckReferences();
        CheckMazes();
        Walk(data.Start, new StoryVars(), new List<string>());

        Console.WriteLine($"엔딩까지 간 경로: {paths}개 (같은 상태는 한 번만 셈)");
        foreach (var e in data.Endings.Values.OrderBy(x => x.Number))
        {
            endingHits.TryGetValue(e.Id, out int n);
            string note = e.Id == "END_4" ? " (책상 밑 멀티탭을 뽑는 공간 상호작용 — 이야기 경로 밖)" : "";
            Console.WriteLine($"  ENDING {e.Number} {e.Title}: {n}개 경로{note}");
            if (n == 0 && e.Id != "END_4") errors.Add($"엔딩 {e.Id} 에 도달하는 경로가 없음");
        }
        var unvisited = data.Nodes.Keys.Where(k => !visited.Contains(k) && k != data.ChaseRetry && k != "end4_seq").ToList();
        if (unvisited.Count > 0) errors.Add("도달하지 않는 노드: " + string.Join(", ", unvisited));

        foreach (var w in warnings.OrderBy(x => x)) Console.WriteLine("경고: " + w);
        foreach (var e in errors.Distinct()) Console.WriteLine("오류: " + e);
        Console.WriteLine(errors.Count == 0 ? "결과: 통과" : $"결과: 실패 ({errors.Distinct().Count()}건)");
        return errors.Count == 0 ? 0 : 1;
    }

    static readonly HashSet<string> Speakers = new HashSet<string> { "sys", "corp", "user", "ai", "guide", "me", "radio" };
    static readonly HashSet<string> Runs = new HashSet<string> { "glanceClock", "freeze", "finalWait", "chase", "end1", "end3", "end4", "end5", "end6" };
    static readonly HashSet<string> Known = new HashSet<string> { "wait", "set", "door", "light", "flicker", "sound", "stopsound", "cctv", "terminal", "glitch",
        "phone", "checkpoint", "hint", "caption", "monologue", "tension", "music", "standup", "mood", "print", "projector", "monitors", "scare" };

    static void CheckReferences()
    {
        bool NodeOk(string id) => string.IsNullOrEmpty(id) || data.Nodes.ContainsKey(id);
        if (!data.Nodes.ContainsKey(data.Start)) errors.Add("start 노드 없음: " + data.Start);
        foreach (var r in data.Rules) if (!NodeOk(r.Goto) || r.Goto.Length == 0) errors.Add($"규칙 '{r.Cond}': 없는 노드 {r.Goto}");
        foreach (var n in data.Nodes.Values)
        {
            foreach (var ev in n.OnEnter.Concat(n.After)) if (!data.Events.ContainsKey(ev)) errors.Add($"{n.Id}: 없는 이벤트 {ev}");
            if (!NodeOk(n.Next)) errors.Add($"{n.Id}: 없는 next {n.Next}");
            if (n.Chapter.Length > 0 && !data.ChapterById.ContainsKey(n.Chapter)) errors.Add($"{n.Id}: 없는 장 {n.Chapter}");
            if (n.Run.Length > 0 && !Runs.Contains(n.Run)) errors.Add($"{n.Id}: 알 수 없는 연출 {n.Run}");
            foreach (var b in n.Branch) if (!NodeOk(b.Next)) errors.Add($"{n.Id}: 없는 branch {b.Next}");
            foreach (var c in n.Choices)
            {
                if (!NodeOk(c.Next) || string.IsNullOrEmpty(c.Next)) errors.Add($"{n.Id}: 선택지 '{c.Text}' 다음 노드 없음");
                foreach (var ev in c.Events) if (!data.Events.ContainsKey(ev)) errors.Add($"{n.Id}: 없는 이벤트 {ev}");
                if (c.Text.Length > 14) warnings.Add($"{n.Id}: 선택지 '{c.Text}' 가 김 ({c.Text.Length}자)");
            }
            if (n.Choices.Count > 5) errors.Add($"{n.Id}: 선택지는 5개까지 (별점)");
            if (n.Maze != null)
            {
                if (!MazeMaps.All.ContainsKey(n.Maze.Map)) errors.Add($"{n.Id}: 없는 미로 {n.Maze.Map}");
                if (n.Maze.Kind == "calibrate") { if (!NodeOk(n.Maze.Done) || n.Maze.Done.Length == 0) errors.Add($"{n.Id}: calibrate done 노드 없음"); }
                else foreach (var k in new[] { "subtle", "direct", "timeout" })
                        if (!n.Maze.Outcomes.TryGetValue(k, out var to) || !NodeOk(to) || to.Length == 0) errors.Add($"{n.Id}: 미로 결과 '{k}' 의 다음 노드 없음");
            }
            if (!string.IsNullOrEmpty(n.Ending) && !data.Endings.ContainsKey(n.Ending)) errors.Add($"{n.Id}: 없는 엔딩 {n.Ending}");
            if (n.Chase != null && (!NodeOk(n.Chase.Escaped) || !NodeOk(n.Chase.Caught))) errors.Add($"{n.Id}: 추격 결과 노드 없음");
            foreach (var l in n.Lines.Concat(n.Hidden))
            {
                if (l.Text.Length > 70) warnings.Add($"{n.Id}: 대사가 김 ({l.Text.Length}자)");
                if (!Speakers.Contains(l.Who)) errors.Add($"{n.Id}: 알 수 없는 화자 {l.Who}");
            }
        }
        foreach (var ev in data.Events.Values)
        {
            foreach (var a in ev.Actions)
            {
                if (!Known.Contains(a.Type)) errors.Add($"이벤트 {ev.Id}: 알 수 없는 동작 {a.Type}");
                string flag = a.Str("flag", "");
                if ((a.Type == "checkpoint" || a.Type == "print") && flag.Length > 0)
                {
                    if (!flagSources.TryGetValue(flag, out var l)) flagSources[flag] = l = new List<StoryAction>();
                    l.Add(a);
                }
                if (a.Type == "checkpoint")
                {
                    string insp = a.Str("inspect", "");
                    if (insp.Length > 0 && !data.Inspects.ContainsKey(insp)) errors.Add($"이벤트 {ev.Id}: 없는 조사 문구 {insp}");
                    string then = a.Str("then", "");
                    if (then.Length > 0 && !data.Events.ContainsKey(then)) errors.Add($"이벤트 {ev.Id}: 없는 후속 이벤트 {then}");
                }
                if (a.Type == "print" && !data.Sheets.ContainsKey(a.Str("sheet", ""))) errors.Add($"이벤트 {ev.Id}: 없는 출력물 {a.Str("sheet", "")}");
            }
        }
    }

    /// <summary>미로마다 출발점에서 각 도착점까지 길로만 갈 수 있는지 (3px 간격 격자 탐색)</summary>
    static void CheckMazes()
    {
        foreach (var kv in MazeMaps.All)
        {
            var m = new MazeState(kv.Value, kv.Value.Time, false, false, new Random(1));
            m.Measure(s => s.Length * 13.5f); // 24px 굵은 글꼴의 대략 폭
            const int step = 4;
            int w = 1024 / step, h = 768 / step;
            var seen = new bool[w * h];
            var q = new Queue<(int, int)>();
            void Push(int x, int y)
            {
                if (x < 0 || y < 0 || x >= w || y >= h || seen[y * w + x]) return;
                float px = x * step, py = y * step;
                bool ok = m.Rects.Any(r => r.Inside(px, py, 3)) || m.HiddenRects.Any(r => r.Inside(px, py, 3));
                if (!ok) return;
                seen[y * w + x] = true; q.Enqueue((x, y));
            }
            Push((int)(m.CX / step), (int)(m.CY / step));
            while (q.Count > 0) { var (x, y) = q.Dequeue(); Push(x + 1, y); Push(x - 1, y); Push(x, y + 1); Push(x, y - 1); }
            foreach (var g in m.Goals)
            {
                bool reach = false;
                for (int y = (int)(g.Rect.Y / step); y <= (g.Rect.Y + g.Rect.H) / step && !reach; y++)
                    for (int x = (int)(g.Rect.X / step); x <= (g.Rect.X + g.Rect.W) / step; x++)
                        if (x >= 0 && y >= 0 && x < w && y < h && seen[y * w + x]) { reach = true; break; }
                if (!reach) errors.Add($"미로 {kv.Key}: 도착점 {g.Def.Code} 에 길이 닿지 않음");
            }
        }
        Console.WriteLine($"미로 {MazeMaps.All.Count}개: 출발점 → 도착점 연결 검사 완료");
    }

    static void ApplyEvent(string id, StoryVars v, int depth = 0)
    {
        if (depth > 6 || !data.Events.TryGetValue(id, out var ev)) return;
        foreach (var a in ev.Actions)
        {
            if (!Condition.Eval(a.Str("if", ""), v)) continue;
            if (a.Type == "set") v.Apply(a.Str("value", ""));
            else if (a.Type == "tension") v.SetNum("tension", a.Num("level"));
        }
    }

    /// <summary>할 일: 플레이어가 그 깃발을 세우러 갔다고 보고, 깃발을 세우는 확인 지점의 후속 이벤트·조사 set 까지 적용</summary>
    static bool DoTask(string flag, StoryVars v)
    {
        if (!flagSources.TryGetValue(flag, out var list)) return false;
        v.Set(flag, "1");
        foreach (var a in list)
        {
            string insp = a.Str("inspect", "");
            if (insp.Length > 0) StoryLogic.ApplySets(StoryLogic.Inspect(data, insp, v).Set, v);
            string then = a.Str("then", "");
            if (then.Length > 0) ApplyEvent(then, v);
        }
        return true;
    }

    static string Key(string id, StoryVars v) => id + "|" + string.Join(";", v.All.Where(kv => kv.Key != "clock").OrderBy(kv => kv.Key).Select(kv => kv.Key + "=" + kv.Value));

    static void Walk(string id, StoryVars v, List<string> trail)
    {
        int guard = 0;
        while (true)
        {
            if (++guard > 400) { errors.Add("순환 의심: " + string.Join(">", trail.TakeLast(12))); return; }
            if (string.IsNullOrEmpty(id)) { errors.Add("다음 노드 없이 끝남: " + string.Join(">", trail.TakeLast(12))); return; }
            if (!data.Nodes.TryGetValue(id, out var n)) { errors.Add("없는 노드 " + id); return; }
            if (!seenStates.Add(Key(id, v))) return; // 같은 상태는 이미 따라가 봄
            visited.Add(id);
            trail = new List<string>(trail) { id };
            StoryLogic.ApplySets(n.Set, v);
            if (n.Clock.Length > 0) v.Set("clock", n.Clock);
            foreach (var ev in n.OnEnter) ApplyEvent(ev, v);
            foreach (var ev in n.After) ApplyEvent(ev, v);

            if (!n.NoRules) { string g = StoryLogic.RuleHit(data, v); if (g.Length > 0) { id = g; continue; } }
            if (n.Run == "chase" && n.Chase != null)
            {
                Walk(n.Chase.Escaped, v.Clone(), trail);
                Walk(n.Chase.Caught, v.Clone(), trail);
                return;
            }
            if (!string.IsNullOrEmpty(n.Ending)) { Finish(n.Ending); return; }
            if (n.Maze != null)
            {
                if (n.Maze.Kind == "calibrate") { id = n.Maze.Done; continue; }
                bool hasHidden = MazeMaps.All.TryGetValue(n.Maze.Map, out var md) && md.Goals.Any(g => g.Hidden);
                { // 벽에 9번 닿아 화면이 완전히 깨짐 (crack 3) → 판정 규칙으로 감독관 출동
                    var b = v.Clone(); b.SetNum("crack", 3); b.Add("hits", 9);
                    string g = StoryLogic.RuleHit(data, b);
                    Walk(g.Length > 0 ? g : "end2_crack", b, trail);
                }
                foreach (var res in new[] { "subtle", "direct", "timeout" })
                {
                    Walk(n.Maze.Outcomes[res], v.Clone(), trail);
                    if (hasHidden) // 숨은 노드 who_is_talking() 을 누른 뒤의 같은 결과 (가이드를 귀찮게 함)
                    {
                        var b = v.Clone(); b.Add("annoy", 1); b.Add("hidden_n", 1);
                        string g = StoryLogic.RuleHit(data, b);
                        Walk(g.Length > 0 ? g : n.Maze.Outcomes[res], b, trail);
                    }
                }
                return;
            }
            var choices = StoryLogic.VisibleChoices(n, v).Where(c => !c.Disabled).ToList();
            if (choices.Count > 0)
            {
                foreach (var c in choices)
                {
                    var b = v.Clone();
                    StoryLogic.ApplySets(c.Set, b);
                    foreach (var ev in c.Events) ApplyEvent(ev, b);
                    Walk(c.Next, b, trail);
                }
                return;
            }
            if (n.Task != null && n.Task.Flag.Length > 0 && !v.Truthy(n.Task.Flag) && !DoTask(n.Task.Flag, v))
                warnings.Add($"{id}: 할 일 깃발 '{n.Task.Flag}' 를 세우는 확인 지점이 없음 (320초 뒤 저절로 넘어감)");
            id = StoryLogic.ResolveNext(n, v);
            if (string.IsNullOrEmpty(id)) { errors.Add($"{n.Id}: 막다른 노드"); return; }
        }
    }

    static void Finish(string ending)
    {
        paths++;
        endingHits[ending] = endingHits.TryGetValue(ending, out int n) ? n + 1 : 1;
    }
}
