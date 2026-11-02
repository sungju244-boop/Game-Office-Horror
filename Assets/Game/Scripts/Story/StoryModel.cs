// story.json 의 데이터 구조와 읽기. 게임 코드와 검증 도구가 같은 코드를 쓴다.
using System.Collections.Generic;

namespace NightEval.Story
{
    public sealed class StoryLine
    {
        public string Who = "sys";   // sys, user, ai, corp, me
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
    }

    public sealed class StoryWait
    {
        public string Flag = "";
        public string Hint = "";
        public string Screen = "";
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

    public sealed class StoryNode
    {
        public string Id = "";
        public string Record;        // 머리줄 왼쪽 (null 이면 바꾸지 않음)
        public string Status;        // 머리줄 상태
        public bool Clear;           // 화면 지우고 시작
        public List<string> Set = new List<string>();
        public List<string> OnEnter = new List<string>();
        public List<StoryLine> Lines = new List<StoryLine>();
        public List<string> After = new List<string>();
        public List<StoryChoice> Choices = new List<StoryChoice>();
        public StoryWait Wait;
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
        public bool Bad;
        public bool RetryChase;
        public List<StoryLine> Lines = new List<StoryLine>();
    }

    public sealed class InspectVariant
    {
        public string Cond = "";
        public List<string> Lines = new List<string>();
    }

    public sealed class StoryData
    {
        public string Start = "";
        public string ChaseRetry = "";
        public readonly Dictionary<string, StoryNode> Nodes = new Dictionary<string, StoryNode>();
        public readonly Dictionary<string, StoryEvent> Events = new Dictionary<string, StoryEvent>();
        public readonly Dictionary<string, StoryEnding> Endings = new Dictionary<string, StoryEnding>();
        public readonly Dictionary<string, List<InspectVariant>> Inspects = new Dictionary<string, List<InspectVariant>>();
        public readonly List<string> IntroLines = new List<string>();

        public static StoryData FromJson(string json)
        {
            var root = MiniJson.Parse(json) as Dictionary<string, object>;
            if (root == null) throw new System.FormatException("story.json 최상위는 객체여야 합니다");
            var data = new StoryData
            {
                Start = MiniJson.Str(root, "start", ""),
                ChaseRetry = MiniJson.Str(root, "chaseRetry", "")
            };
            data.IntroLines.AddRange(MiniJson.StrList(root, "intro"));

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
                                variants.Add(new InspectVariant { Cond = MiniJson.Str(vd, "if", ""), Lines = MiniJson.StrList(vd, "text") });
                            else if (vo is string single)
                                variants.Add(new InspectVariant { Lines = new List<string> { single } });
                        }
                    }
                    data.Inspects[kv.Key] = variants;
                }
            }
            return data;
        }

        static StoryNode ReadNode(Dictionary<string, object> d)
        {
            var n = new StoryNode
            {
                Id = MiniJson.Str(d, "id", ""),
                Record = MiniJson.Str(d, "record", null),
                Status = MiniJson.Str(d, "status", null),
                Clear = MiniJson.Bool(d, "clear"),
                Next = MiniJson.Str(d, "next", ""),
                Ending = MiniJson.Str(d, "ending", "")
            };
            n.Set.AddRange(MiniJson.StrList(d, "set"));
            n.OnEnter.AddRange(MiniJson.StrList(d, "onEnter"));
            n.After.AddRange(MiniJson.StrList(d, "after"));
            n.Lines.AddRange(ReadLines(d, "lines"));

            foreach (object co in MiniJson.List(d, "choices"))
            {
                if (!(co is Dictionary<string, object> cd)) continue;
                var c = new StoryChoice
                {
                    Text = MiniJson.Str(cd, "text", ""),
                    Cond = MiniJson.Str(cd, "if", ""),
                    Next = MiniJson.Str(cd, "next", ""),
                    Unsettling = MiniJson.Bool(cd, "unsettling")
                };
                c.Set.AddRange(MiniJson.StrList(cd, "set"));
                c.Events.AddRange(MiniJson.StrList(cd, "events"));
                n.Choices.Add(c);
            }

            var w = MiniJson.Obj(d, "wait");
            if (w != null)
                n.Wait = new StoryWait
                {
                    Flag = MiniJson.Str(w, "flag", ""),
                    Hint = MiniJson.Str(w, "hint", ""),
                    Screen = MiniJson.Str(w, "screen", "")
                };

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

        /// <summary>이벤트 안의 set 동작만 적용 (시뮬레이션용).</summary>
        public static void ApplyEventSets(StoryData data, string eventId, StoryVars vars)
        {
            if (!data.Events.TryGetValue(eventId, out var ev)) return;
            foreach (var a in ev.Actions)
                if (a.Type == "set") vars.Apply(a.Str("value", ""));
        }

        public static List<string> InspectLines(StoryData data, string inspectId, StoryVars vars)
        {
            if (data != null && inspectId != null && data.Inspects.TryGetValue(inspectId, out var variants))
            {
                foreach (var v in variants)
                {
                    if (!Condition.Eval(v.Cond, vars)) continue;
                    var lines = new List<string>();
                    foreach (string s in v.Lines) lines.Add(vars.Format(s));
                    return lines;
                }
            }
            return new List<string>();
        }
    }
}
