// 이야기 데이터 검증기: 모든 선택 경로를 끝까지 따라가 엔딩 도달, 참조 오류, 대기 교착, 글자 길이를 검사한다.
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
    static int paths;
    static int maxDecisions;
    static readonly HashSet<string> telemetry = new HashSet<string> { "clock" };

    static int Main(string[] args)
    {
        string root = args.Length > 0 ? args[0] : "../..";
        string path = Path.Combine(root, "Assets/StreamingAssets/Story/story.json");
        data = StoryData.FromJson(File.ReadAllText(path));
        Console.WriteLine($"노드 {data.Nodes.Count}개, 이벤트 {data.Events.Count}개, 엔딩 {data.Endings.Count}개, 조사 문구 {data.Inspects.Count}개");

        CheckReferences();
        var start = new StoryVars();
        start.Set("clock", "00:41");
        Walk(data.Start, start, 0, new List<string>());

        Console.WriteLine($"탐색한 경로: {paths}개, 경로당 최대 결정 수: {maxDecisions}");
        foreach (var e in data.Endings.Values.OrderBy(x => x.Number))
        {
            endingHits.TryGetValue(e.Id, out int n);
            string note = e.Id == "END_5" ? " (입구로 퇴근: 이야기 경로 밖의 공간 상호작용 — 입구 문이 처음엔 잠겨 있지 않음을 별도 확인)" : "";
            Console.WriteLine($"  ENDING {e.Number} {e.Title}: {n}개 경로{note}");
            if (n == 0 && e.Id != "END_5") errors.Add($"엔딩 {e.Id} 에 도달하는 경로가 없음");
        }
        var unvisited = data.Nodes.Keys.Where(k => !visited.Contains(k) && k != data.ChaseRetry).ToList();
        if (unvisited.Count > 0) errors.Add("도달하지 않는 노드: " + string.Join(", ", unvisited));

        foreach (var w in warnings) Console.WriteLine("경고: " + w);
        foreach (var e in errors.Distinct()) Console.WriteLine("오류: " + e);
        Console.WriteLine(errors.Count == 0 ? "결과: 통과" : $"결과: 실패 ({errors.Distinct().Count()}건)");
        return errors.Count == 0 ? 0 : 1;
    }

    static void CheckReferences()
    {
        bool NodeOk(string id) => string.IsNullOrEmpty(id) || data.Nodes.ContainsKey(id);
        foreach (var n in data.Nodes.Values)
        {
            foreach (var ev in n.OnEnter.Concat(n.After)) if (!data.Events.ContainsKey(ev)) errors.Add($"{n.Id}: 없는 이벤트 {ev}");
            if (!NodeOk(n.Next)) errors.Add($"{n.Id}: 없는 next {n.Next}");
            foreach (var b in n.Branch) if (!NodeOk(b.Next)) errors.Add($"{n.Id}: 없는 branch {b.Next}");
            foreach (var c in n.Choices)
            {
                if (!NodeOk(c.Next) || string.IsNullOrEmpty(c.Next)) errors.Add($"{n.Id}: 선택지 '{c.Text}' 다음 노드 없음");
                foreach (var ev in c.Events) if (!data.Events.ContainsKey(ev)) errors.Add($"{n.Id}: 없는 이벤트 {ev}");
                if (c.Text.Length > 12) errors.Add($"{n.Id}: 선택지 '{c.Text}' 가 너무 김 ({c.Text.Length}자 > 12)");
            }
            if (n.Choices.Count > 2) errors.Add($"{n.Id}: 선택지는 2개까지");
            if (!string.IsNullOrEmpty(n.Ending) && !data.Endings.ContainsKey(n.Ending)) errors.Add($"{n.Id}: 없는 엔딩 {n.Ending}");
            if (n.Chase != null && (!NodeOk(n.Chase.Escaped) || !NodeOk(n.Chase.Caught))) errors.Add($"{n.Id}: 추격 결과 노드 없음");
            foreach (var l in n.Lines)
            {
                if (l.Text.Length > 60) errors.Add($"{n.Id}: 대사가 너무 김 ({l.Text.Length}자): {l.Text}");
                if (!new[] { "sys", "user", "ai", "corp", "me" }.Contains(l.Who)) errors.Add($"{n.Id}: 알 수 없는 화자 {l.Who}");
            }
            if ((n.Record ?? "").Length > 34) warnings.Add($"{n.Id}: 머리줄이 김 ({n.Record.Length}자)");
        }
        var known = new HashSet<string> { "wait", "set", "door", "drawer", "light", "flicker", "hum", "sound", "stopsound", "cctv", "terminal", "glitch",
            "phone", "checkpoint", "hint", "caption", "monologue", "tension", "fog", "music", "standup", "draft", "monitors", "led", "scare" };
        foreach (var ev in data.Events.Values)
        {
            foreach (var a in ev.Actions)
            {
                if (!known.Contains(a.Type)) errors.Add($"이벤트 {ev.Id}: 알 수 없는 동작 {a.Type}");
                if (a.Type == "checkpoint")
                {
                    string insp = a.Str("inspect", "");
                    if (insp.Length > 0 && !data.Inspects.ContainsKey(insp)) errors.Add($"이벤트 {ev.Id}: 없는 조사 문구 {insp}");
                    string then = a.Str("then", "");
                    if (then.Length > 0 && !data.Events.ContainsKey(then)) errors.Add($"이벤트 {ev.Id}: 없는 후속 이벤트 {then}");
                    if (a.Str("flag", "").Length == 0) errors.Add($"이벤트 {ev.Id}: checkpoint 에 flag 없음");
                    var t = a.Str("timer", ""); if (t.Length > 0) telemetry.Add(t);
                }
            }
        }
        foreach (var e in data.Endings.Values)
            foreach (var l in e.Lines) if (l.Text.Length > 60) errors.Add($"{e.Id}: 엔딩 문장이 너무 김: {l.Text}");
    }

    static void ApplyEvent(string id, StoryVars v)
    {
        if (!data.Events.TryGetValue(id, out var ev)) return;
        foreach (var a in ev.Actions)
        {
            switch (a.Type)
            {
                case "set": v.Apply(a.Str("value", "")); break;
                case "tension": v.SetNum("tension", a.Num("level")); break;
                case "cctv": if (a.Bool("feed")) v.Set("cctv_on", "1"); break;
                case "monitors": if (a.Str("mode", "117") != "off") v.Set("monitors_on", "1"); break;
                case "checkpoint":
                    // 플레이어가 확인하러 갔다고 가정
                    v.Set(a.Str("flag", ""), "1");
                    if (a.Str("place", "").Length > 0) v.Set("last_place", a.Str("place", ""));
                    if (a.Str("timer", "").Length > 0) v.SetNum(a.Str("timer", ""), 7);
                    if (a.Str("then", "").Length > 0) ApplyEvent(a.Str("then", ""), v);
                    break;
            }
        }
    }

    static void CheckText(string where, string text, StoryVars v)
    {
        foreach (var token in StoryVars.Tokens(text))
            if (v.Get(token).Length == 0) errors.Add($"{where}: '{{{token}}}' 값이 비어 있음 → '{text}'");
    }

    static void Walk(string id, StoryVars v, int decisions, List<string> trail)
    {
        int guard = 0;
        while (true)
        {
            if (++guard > 200) { errors.Add("순환 의심: " + string.Join(">", trail)); return; }
            if (string.IsNullOrEmpty(id)) { errors.Add("다음 노드 없이 끝남: " + string.Join(">", trail)); return; }
            if (!data.Nodes.TryGetValue(id, out var n)) { errors.Add("없는 노드 " + id); return; }
            visited.Add(id);
            trail = new List<string>(trail) { id };
            StoryLogic.ApplySets(n.Set, v);
            foreach (var ev in n.OnEnter) ApplyEvent(ev, v);
            foreach (var l in StoryLogic.VisibleLines(n.Lines, v)) CheckText(id, l.Text, v);
            if (n.Record != null) CheckText(id, n.Record, v);
            foreach (var ev in n.After) ApplyEvent(ev, v);

            if (!string.IsNullOrEmpty(n.Ending))
            {
                Finish(n.Ending, v, decisions);
                return;
            }
            if (n.Chase != null)
            {
                Walk(n.Chase.Escaped, v.Clone(), decisions, trail);
                Walk(n.Chase.Caught, v.Clone(), decisions, trail);
                return;
            }
            var choices = StoryLogic.VisibleChoices(n, v);
            if (choices.Count > 0)
            {
                if (choices.Count != 2) warnings.Add($"{id}: 보이는 선택지 {choices.Count}개");
                foreach (var c in choices)
                {
                    var b = v.Clone();
                    StoryLogic.ApplySets(c.Set, b);
                    foreach (var ev in c.Events) ApplyEvent(ev, b);
                    Walk(c.Next, b, decisions + 1, trail);
                }
                return;
            }
            if (n.Wait != null && n.Wait.Flag.Length > 0 && !v.Truthy(n.Wait.Flag))
            {
                errors.Add($"{id}: 대기 플래그 '{n.Wait.Flag}' 를 켜는 이벤트가 없음 (진행 불가) 경로: {string.Join(">", trail)}");
                return;
            }
            id = StoryLogic.ResolveNext(n, v);
            if (string.IsNullOrEmpty(id)) { errors.Add($"{n.Id}: 막다른 노드"); return; }
        }
    }

    static void Finish(string ending, StoryVars v, int decisions)
    {
        paths++;
        maxDecisions = Math.Max(maxDecisions, decisions);
        endingHits[ending] = endingHits.TryGetValue(ending, out int n) ? n + 1 : 1;
        if (data.Endings.TryGetValue(ending, out var e))
            foreach (var l in StoryLogic.VisibleLines(e.Lines, v)) CheckText(ending, l.Text, v);
    }
}
