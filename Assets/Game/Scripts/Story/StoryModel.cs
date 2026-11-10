// story.json v2 의 데이터 구조와 읽기 (브라우저판 web/js/story.js 와 같은 규칙). 게임 코드와 검증 도구가 같은 코드를 쓴다.
using System.Collections.Generic;

namespace NightEval.Story
{
    public sealed class StoryLine
    {
        public string Who = "sys";   // sys, corp, user, ai, guide, me, radio
        public string Text = "";
        public string Cond = "";
        public float Glitch;         // 0~1, 글자 깨짐·화면 잡음 강도
        public float Pause;          // 줄을 다 읽은 뒤 추가 대기(초)
    }

    public sealed class StoryChoice
    {
        public string Text = "";
        public string Cond = "";
        public List<string> Set = new List<string>();
        public List<string> Events = new List<string>();
        public string Next = "";
        public bool Unsettling;      // 불안한 선택지: 호버/선택 시 글자 지지직
        public bool Disabled;        // 보이지만 누를 수 없음 (튜토리얼)
    }

    /// <summary>자리를 떠나 할 일. flag 가 서면 끝난다.</summary>
    public sealed class StoryTask
    {
        public string Flag = "";
        public string Hint = "";
        public string Screen = "";
        public bool NoSit;           // 끝난 뒤 자리로 돌아오지 않아도 된다
    }

    /// <summary>경로 추적 미로. kind: calibrate / threat / harmless. outcomes: 결과(subtle·direct·timeout) → 다음 노드</summary>
    public sealed class StoryMaze
    {
        public string Map = "";
        public string Kind = "";
        public string Subtle = "";   // 도착점에 커서를 올리면 보이는 보낼 문장
        public string Direct = "";
        public bool Drag;            // 미로 중 커서가 혼자 끌려가는 연출
        public string Done = "";     // calibrate 끝난 뒤
        public Dictionary<string, string> Outcomes = new Dictionary<string, string>();
    }

    public sealed class StoryBranch
    {
        public string Cond = "";
        public string Next = "";
    }

    public sealed class StoryChase
    {
        public string Escaped = "";
        public string Caught = "";
    }

    public sealed class StoryChapter
    {
        public string Id = "";
        public int Index;
        public string Time = "";
        public string Label = "";
        public string Title = "";
    }

    public sealed class StoryRule
    {
        public string Cond = "";
        public string Goto = "";
    }

    public sealed class StoryNode
    {
        public string Id = "";
        public string Chapter = "";  // 장 시작: 제목 카드 + 자동 저장
        public string Clock = "";
        public string Record;        // 머리줄 왼쪽 (null 이면 바꾸지 않음)
        public string Status;        // 머리줄 상태
        public bool Clear;           // 화면 지우고 시작
        public List<string> Set = new List<string>();
        public List<string> OnEnter = new List<string>();
        public List<string> After = new List<string>();
        public List<StoryLine> Lines = new List<StoryLine>();
        public List<StoryLine> Hidden = new List<StoryLine>();  // 화면 빈 곳을 긁으면 보이는 주석
        public List<StoryChoice> Choices = new List<StoryChoice>();
        public bool Save;            // 선택지 직전 저장
        public int Demo = -1;        // 가이드가 대신 누르는 선택지 (-1 = 없음)
        public StoryMaze Maze;
        public StoryTask Task;
        public float Pause;
        public string Run = "";      // 코드로 만든 연출 이름
        public bool NoRules;         // 판정 규칙 검사 안 함
        public List<StoryBranch> Branch = new List<StoryBranch>();
        public string Next = "";
        public string Ending = "";
        public StoryChase Chase;
    }

    public sealed class StoryAction
    {
        public string Type = "";
        public Dictionary<string, object> Args = new Dictionary<string, object>();

        public string Str(string key, string def = null) => MiniJson.Str(Args, key, def);
        public float Num(string key, float def = 0f) => MiniJson.Num(Args, key, def);
        public bool Bool(string key, bool def = false) => MiniJson.Bool(Args, key, def);
        public bool Has(string key) => MiniJson.Has(Args, key);
    }

    public sealed class StoryEvent
    {
        public string Id = "";
        public List<StoryAction> Actions = new List<StoryAction>();
    }

    public sealed class StoryEnding
    {
        public string Id = "";
        public int Number;
        public string Title = "";
        public string Hint = "";
        public bool Bad;
        public bool RetryChase;
        public List<StoryLine> Lines = new List<StoryLine>();
    }

    public sealed class InspectVariant
    {
        public string Cond = "";
        public List<string> Lines = new List<string>();
        public List<string> Set = new List<string>();
    }

    public sealed class StoryData
    {
        public string Start = "";
        public string ChaseRetry = "";
        public readonly Dictionary<string, StoryNode> Nodes = new Dictionary<string, StoryNode>();
        public readonly Dictionary<string, StoryEvent> Events = new Dictionary<string, StoryEvent>();
        public readonly Dictionary<string, StoryEnding> Endings = new Dictionary<string, StoryEnding>();
        public readonly Dictionary<string, List<InspectVariant>> Inspects = new Dictionary<string, List<InspectVariant>>();
        public readonly Dictionary<string, List<string>> Sheets = new Dictionary<string, List<string>>();
        public readonly List<StoryChapter> Chapters = new List<StoryChapter>();
        public readonly Dictionary<string, StoryChapter> ChapterById = new Dictionary<string, StoryChapter>();
        public readonly List<StoryRule> Rules = new List<StoryRule>();
        public readonly List<string> IntroLines = new List<string>();

        public static StoryData FromJson(string json)
        {
            var root = MiniJson.Parse(StripComments(json)) as Dictionary<string, object>;
            if (root == null) throw new System.FormatException("story.json 최상위는 객체여야 합니다");
            var data = new StoryData
            {
                Start = MiniJson.Str(root, "start", ""),
                ChaseRetry = MiniJson.Str(root, "chaseRetry", "")
            };
            data.IntroLines.AddRange(MiniJson.StrList(root, "intro"));

            foreach (object o in MiniJson.List(root, "rules"))
                if (o is Dictionary<string, object> d)
                    data.Rules.Add(new StoryRule { Cond = MiniJson.Str(d, "if", ""), Goto = MiniJson.Str(d, "goto", "") });

            foreach (object o in MiniJson.List(root, "chapters"))
            {
                if (!(o is Dictionary<string, object> d)) continue;
                var c = new StoryChapter
                {
                    Id = MiniJson.Str(d, "id", ""), Index = data.Chapters.Count,
                    Time = MiniJson.Str(d, "time", ""), Label = MiniJson.Str(d, "label", ""), Title = MiniJson.Str(d, "title", "")
                };
                data.Chapters.Add(c);
                data.ChapterById[c.Id] = c;
            }

            var sheets = MiniJson.Obj(root, "sheets");
            if (sheets != null)
                foreach (var kv in sheets) data.Sheets[kv.Key] = MiniJson.StrList(sheets, kv.Key);

            foreach (object o in MiniJson.List(root, "nodes"))
            {
                if (!(o is Dictionary<string, object> d)) continue;
                var n = ReadNode(d);
                data.Nodes[n.Id] = n;
            }
            foreach (object o in MiniJson.List(root, "events"))
            {
                if (!(o is Dictionary<string, object> d)) continue;
                var ev = new StoryEvent { Id = MiniJson.Str(d, "id", "") };
                foreach (object ao in MiniJson.List(d, "actions"))
                {
                    if (!(ao is Dictionary<string, object> ad)) continue;
                    ev.Actions.Add(new StoryAction { Type = MiniJson.Str(ad, "do", ""), Args = ad });
                }
                data.Events[ev.Id] = ev;
            }
            foreach (object o in MiniJson.List(root, "endings"))
            {
                if (!(o is Dictionary<string, object> d)) continue;
                var e = new StoryEnding
                {
                    Id = MiniJson.Str(d, "id", ""),
                    Number = (int)MiniJson.Num(d, "number", 0),
                    Title = MiniJson.Str(d, "title", ""),
                    Hint = MiniJson.Str(d, "hint", ""),
                    Bad = MiniJson.Bool(d, "bad"),
                    RetryChase = MiniJson.Bool(d, "retryChase")
                };
                e.Lines.AddRange(ReadLines(d, "lines"));
                data.Endings[e.Id] = e;
            }
            var inspects = MiniJson.Obj(root, "inspects");
            if (inspects != null)
            {
                foreach (var kv in inspects)
                {
                    var variants = new List<InspectVariant>();
                    if (kv.Value is List<object> list)
                    {
                        foreach (object vo in list)
                        {
                            if (vo is Dictionary<string, object> vd)
                                variants.Add(new InspectVariant { Cond = MiniJson.Str(vd, "if", ""), Lines = MiniJson.StrList(vd, "text"), Set = MiniJson.StrList(vd, "set") });
                            else if (vo is string single)
                                variants.Add(new InspectVariant { Lines = new List<string> { single } });
                        }
                    }
                    data.Inspects[kv.Key] = variants;
                }
            }
            return data;
        }

        /// <summary>줄 맨 앞이 // 인 주석 줄을 지운다 (브라우저판 parseJsonc 와 같다).</summary>
        public static string StripComments(string text)
        {
            if (string.IsNullOrEmpty(text)) return text;
            var sb = new System.Text.StringBuilder(text.Length);
            foreach (string line in text.Split('\n'))
                if (!line.TrimStart().StartsWith("//")) sb.Append(line).Append('\n');
            return sb.ToString();
        }

        static StoryNode ReadNode(Dictionary<string, object> d)
        {
            var n = new StoryNode
            {
                Id = MiniJson.Str(d, "id", ""),
                Chapter = MiniJson.Str(d, "chapter", ""),
                Clock = MiniJson.Str(d, "clock", ""),
                Record = MiniJson.Str(d, "record", null),
                Status = MiniJson.Str(d, "status", null),
                Clear = MiniJson.Bool(d, "clear"),
                Save = MiniJson.Bool(d, "save"),
                Demo = MiniJson.Has(d, "demo") && d["demo"] != null ? (int)MiniJson.Num(d, "demo", -1) : -1,
                Pause = MiniJson.Num(d, "pause", 0f),
                Run = MiniJson.Str(d, "run", ""),
                NoRules = MiniJson.Bool(d, "noRules"),
                Next = MiniJson.Str(d, "next", ""),
                Ending = MiniJson.Str(d, "ending", "")
            };
            n.Set.AddRange(MiniJson.StrList(d, "set"));
            n.OnEnter.AddRange(MiniJson.StrList(d, "onEnter"));
            n.After.AddRange(MiniJson.StrList(d, "after"));
            n.Lines.AddRange(ReadLines(d, "lines"));
            n.Hidden.AddRange(ReadLines(d, "hidden"));

            foreach (object co in MiniJson.List(d, "choices"))
            {
                if (!(co is Dictionary<string, object> cd)) continue;
                var c = new StoryChoice
                {
                    Text = MiniJson.Str(cd, "text", ""),
                    Cond = MiniJson.Str(cd, "if", ""),
                    Next = MiniJson.Str(cd, "next", ""),
                    Unsettling = MiniJson.Bool(cd, "unsettling"),
                    Disabled = MiniJson.Bool(cd, "disabled")
                };
                c.Set.AddRange(MiniJson.StrList(cd, "set"));
                c.Events.AddRange(MiniJson.StrList(cd, "events"));
                n.Choices.Add(c);
            }

            var t = MiniJson.Obj(d, "task");
            if (t != null)
                n.Task = new StoryTask
                {
                    Flag = MiniJson.Str(t, "flag", ""), Hint = MiniJson.Str(t, "hint", ""),
                    Screen = MiniJson.Str(t, "screen", ""), NoSit = MiniJson.Bool(t, "noSit")
                };

            var m = MiniJson.Obj(d, "maze");
            if (m != null)
            {
                n.Maze = new StoryMaze
                {
                    Map = MiniJson.Str(m, "map", ""), Kind = MiniJson.Str(m, "kind", ""),
                    Subtle = MiniJson.Str(m, "subtle", ""), Direct = MiniJson.Str(m, "direct", ""),
                    Drag = MiniJson.Bool(m, "drag"), Done = MiniJson.Str(m, "done", "")
                };
                var oc = MiniJson.Obj(m, "outcomes");
                if (oc != null) foreach (var kv in oc) n.Maze.Outcomes[kv.Key] = kv.Value as string ?? "";
            }

            foreach (object bo in MiniJson.List(d, "branch"))
            {
                if (bo is Dictionary<string, object> bd)
                    n.Branch.Add(new StoryBranch { Cond = MiniJson.Str(bd, "if", ""), Next = MiniJson.Str(bd, "next", "") });
            }

            var ch = MiniJson.Obj(d, "chase");
            if (ch != null)
                n.Chase = new StoryChase { Escaped = MiniJson.Str(ch, "escaped", ""), Caught = MiniJson.Str(ch, "caught", "") };
            return n;
        }

        static List<StoryLine> ReadLines(Dictionary<string, object> d, string key)
        {
            var lines = new List<StoryLine>();
            foreach (object lo in MiniJson.List(d, key))
            {
                if (lo is string plain)
                {
                    lines.Add(new StoryLine { Who = "sys", Text = plain });
                    continue;
                }
                if (!(lo is Dictionary<string, object> ld)) continue;
                lines.Add(new StoryLine
                {
                    Who = MiniJson.Str(ld, "who", "sys"),
                    Text = MiniJson.Str(ld, "text", ""),
                    Cond = MiniJson.Str(ld, "if", ""),
                    Glitch = MiniJson.Num(ld, "glitch", 0f),
                    Pause = MiniJson.Num(ld, "pause", 0f)
                });
            }
            return lines;
        }
    }

    /// <summary>이야기 규칙 (UnityEngine 비의존).</summary>
    public static class StoryLogic
    {
        public static List<StoryLine> VisibleLines(List<StoryLine> lines, StoryVars vars)
        {
            var result = new List<StoryLine>();
            foreach (var l in lines) if (Condition.Eval(l.Cond, vars)) result.Add(l);
            return result;
        }

        public static List<StoryChoice> VisibleChoices(StoryNode node, StoryVars vars)
        {
            var result = new List<StoryChoice>();
            foreach (var c in node.Choices) if (Condition.Eval(c.Cond, vars)) result.Add(c);
            return result;
        }

        public static void ApplySets(List<string> ops, StoryVars vars)
        {
            foreach (string op in ops) vars.Apply(op);
        }

        /// <summary>branch 중 조건이 맞는 첫 번째, 없으면 next.</summary>
        public static string ResolveNext(StoryNode node, StoryVars vars)
        {
            foreach (var b in node.Branch)
                if (Condition.Eval(b.Cond, vars)) return b.Next;
            return node.Next;
        }

        /// <summary>판정 규칙: 위에서부터 처음 맞는 것의 이동할 노드 (없으면 "").</summary>
        public static string RuleHit(StoryData data, StoryVars vars)
        {
            foreach (var r in data.Rules) if (Condition.Eval(r.Cond, vars)) return r.Goto;
            return "";
        }

        /// <summary>이벤트 안의 set 동작만 적용 (시뮬레이션용).</summary>
        public static void ApplyEventSets(StoryData data, string eventId, StoryVars vars)
        {
            if (!data.Events.TryGetValue(eventId, out var ev)) return;
            foreach (var a in ev.Actions)
                if (a.Type == "set" && Condition.Eval(a.Str("if", ""), vars)) vars.Apply(a.Str("value", ""));
        }

        /// <summary>조사 문구: 맞는 변형의 글(서식 적용)과 set 을 돌려준다.</summary>
        public static InspectVariant Inspect(StoryData data, string inspectId, StoryVars vars)
        {
            if (data != null && inspectId != null && data.Inspects.TryGetValue(inspectId, out var variants))
            {
                foreach (var v in variants)
                {
                    if (!Condition.Eval(v.Cond, vars)) continue;
                    var res = new InspectVariant { Set = v.Set };
                    foreach (string s in v.Lines) res.Lines.Add(vars.Format(s));
                    return res;
                }
            }
            return new InspectVariant();
        }

        public static List<string> InspectLines(StoryData data, string inspectId, StoryVars vars) => Inspect(data, inspectId, vars).Lines;
    }
}
