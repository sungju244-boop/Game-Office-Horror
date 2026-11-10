using System.Collections;
using System.Collections.Generic;
using NightEval.Story;
using UnityEngine;

namespace NightEval.Director
{
    /// <summary>
    /// 이야기 진행 (story.json v2, 브라우저판 Session.runStory 와 같은 순서):
    /// 노드 → 장 제목 카드·자동 저장 → set·시각 → 머리줄 → onEnter → 대사 → 숨은 주석 → after → 판정 규칙
    /// → 연출(run) → 엔딩 / 미로 / 선택지 / 할 일 → 다음.
    /// 대사는 플레이어가 자리에 앉아 있을 때만 진행된다 (자리를 비우면 화면은 그대로 기다린다).
    /// </summary>
    public sealed class StoryDirector : MonoBehaviour
    {
        // 대사를 직접 다루는 연출 (일반 대사 표시를 건너뛴다)
        static readonly HashSet<string> SeqCustom = new HashSet<string> { "end1", "end3", "end4", "end5", "end6", "chase" };

        GameManager gm;
        Session s;
        StoryData data;
        StoryVars vars;
        Coroutine run;
        SaveSnap screenSnap; // 화면이 새로 시작된 지점 (선택 직전 저장에 쓴다)
        string chapterId = "";

        public string CurrentNode { get; private set; }
        public bool Ending;

        public void Init(GameManager gm, Session session, StoryData data)
        {
            this.gm = gm;
            s = session;
            this.data = data;
            vars = session.Vars;
            s.Terminal.OnHiddenFound = () => vars.Add("hidden_found", 1);
        }

        public void Begin(string nodeId)
        {
            Stop();
            run = StartCoroutine(RunFrom(nodeId));
        }

        public void Stop()
        {
            if (run != null) StopCoroutine(run);
            run = null;
            if (s != null && s.Terminal != null) s.Terminal.HideChoices();
        }

        IEnumerator WaitSeated()
        {
            while (!s.Seat.IsSeated) yield return null;
        }

        IEnumerator ChapterCard(string id)
        {
            if (!data.ChapterById.TryGetValue(id, out var ch)) yield break;
            if (s.Seat.IsSeated) yield return s.Terminal.ShowCard(ch.Time, ch.Label, ch.Title);
            else s.Hud.Caption(ch.Time + "  ·  " + ch.Label + "  ·  " + ch.Title);
        }

        IEnumerator RunFrom(string id)
        {
            int guard = 0;
            while (!string.IsNullOrEmpty(id))
            {
                if (++guard > 900) { Debug.LogError("[야간 평가실] 이야기 진행이 끝나지 않습니다 (순환?)"); yield break; }
                if (!data.Nodes.TryGetValue(id, out var node))
                {
                    Debug.LogError("[야간 평가실] 노드를 찾을 수 없습니다: " + id);
                    yield break;
                }
                CurrentNode = id;
                if (node.Chapter.Length > 0 || node.Clear) screenSnap = new SaveSnap { Node = id, Vars = vars.Clone(), Chapter = node.Chapter.Length > 0 ? node.Chapter : chapterId };
                if (node.Chapter.Length > 0) { chapterId = node.Chapter; if (!Ending) SaveSystem.Put("chapter", id, vars, node.Chapter); }
                if (node.Chase != null) gm.SaveChaseSnapshot(id);
                StoryLogic.ApplySets(node.Set, vars);
                if (node.Clock.Length > 0) vars.Set("clock", node.Clock);

                var lines = StoryLogic.VisibleLines(node.Lines, vars);
                bool custom = node.Run.Length > 0 && SeqCustom.Contains(node.Run);
                if (node.Chapter.Length > 0) yield return ChapterCard(node.Chapter);
                if (node.Clear && lines.Count > 0 && !custom) yield return WaitSeated();
                if (node.Clear && !custom) { s.Terminal.ClearBody(); s.Terminal.SetHidden(""); }
                if (node.Record != null)
                    s.Terminal.SetHeader(vars.Format(node.Record), vars.Format(node.Status ?? ""), vars.Get("clock"));
                else
                    s.Terminal.SetClock(vars.Get("clock"));

                foreach (string ev in node.OnEnter) s.Env.Fire(ev);
                if (node.Run == "glanceClock") yield return GlanceClock();

                if (!custom)
                {
                    foreach (var line in lines)
                    {
                        yield return WaitSeated();
                        yield return s.Terminal.ShowLine(line.Who, vars.Format(line.Text), line.Glitch);
                        if (line.Pause > 0f) yield return new WaitForSeconds(line.Pause);
                    }
                    var hid = StoryLogic.VisibleLines(node.Hidden, vars);
                    if (hid.Count > 0) s.Terminal.SetHidden(vars.Format(hid[0].Text));
                }

                foreach (string ev in node.After) s.Env.Fire(ev);
                if (node.Pause > 0f) yield return new WaitForSeconds(node.Pause);

                // 판정 규칙: 대사를 다 보여 준 뒤 검사
                if (!node.NoRules && !Ending)
                {
                    string g = StoryLogic.RuleHit(data, vars);
                    if (g.Length > 0) { id = g; continue; }
                }

                if (node.Run.Length > 0 && node.Run != "glanceClock")
                {
                    string r = null;
                    yield return RunSeq(node, lines, res => r = res);
                    if (r == "stop") yield break;
                    if (!string.IsNullOrEmpty(r)) { id = r; continue; }
                }

                if (!string.IsNullOrEmpty(node.Ending))
                {
                    yield return new WaitForSeconds(0.6f);
                    gm.TriggerEnding(node.Ending);
                    yield break;
                }

                if (node.Maze != null)
                {
                    string res = null;
                    yield return RunMaze(node, r => res = r);
                    if (res == "broken") { string g = StoryLogic.RuleHit(data, vars); id = g.Length > 0 ? g : "end2_crack"; continue; }
                    if (node.Maze.Kind == "calibrate") { id = node.Maze.Done; continue; }
                    id = node.Maze.Outcomes.TryGetValue(res ?? "", out var to) && to.Length > 0 ? to : node.Next;
                    continue;
                }

                var choices = StoryLogic.VisibleChoices(node, vars);
                if (choices.Count > 0)
                {
                    yield return WaitSeated();
                    if (node.Save && screenSnap != null && !Ending) SaveSystem.Put("choice", screenSnap.Node, screenSnap.Vars, screenSnap.Chapter);
                    int picked = -1;
                    var labels = new List<string>();
                    var unsettling = new List<bool>();
                    var disabled = new List<bool>();
                    foreach (var c in choices) { labels.Add(vars.Format(c.Text)); unsettling.Add(c.Unsettling); disabled.Add(c.Disabled); }
                    s.Terminal.ShowChoices(labels, unsettling, disabled, i => picked = i);
                    if (node.Demo >= 0) { yield return new WaitForSeconds(0.8f); s.Terminal.DemoPick(node.Demo); }
                    while (picked < 0) yield return null;
                    var ch = choices[picked];
                    StoryLogic.ApplySets(ch.Set, vars);
                    foreach (string ev in ch.Events) s.Env.Fire(ev);
                    s.Env.ApplyMood();
                    id = ch.Next;
                    continue;
                }

                if (node.Task != null) yield return RunTask(node.Task);
                id = StoryLogic.ResolveNext(node, vars);
            }
        }

        /// <summary>자리를 떠나 할 일. 끝나면 "새 기록"이 와서 다시 앉을 때까지 기다린다</summary>
        IEnumerator RunTask(StoryTask task)
        {
            if (task.Flag.Length > 0 && !vars.Truthy(task.Flag))
            {
                s.Terminal.ClearBody(); // 숨은 주석은 다음 기록이 올 때까지 남겨 둔다
                s.Terminal.ShowCenter(vars.Format(task.Screen.Length > 0 ? task.Screen : "다음 기록 대기 중"), "· · ·");
                string hint = vars.Format(task.Hint ?? "");
                if (hint.Length > 0) s.Hud.SetObjective(hint);
                if (s.Seat.IsSeated) s.Hud.Help("ESC: 일어나기", 8f);
                float waited = 0f;
                bool reminded = false;
                while (!vars.Truthy(task.Flag))
                {
                    waited += Time.deltaTime;
                    if (!reminded && waited > 100f && hint.Length > 0) { reminded = true; s.Hud.SetObjective(hint + "  (E 로 확인)"); }
                    // 안전장치: 확인 지점을 끝내 찾지 못해도 진행이 영원히 멈추지는 않게
                    if (waited > 320f) { Debug.LogWarning("[야간 평가실] 할 일 시간 초과로 자동 진행: " + task.Flag); vars.Set(task.Flag, "1"); }
                    yield return null;
                }
                s.Hud.SetObjective(null);
            }
            if (task.NoSit) yield break;
            s.Terminal.ShowCenter("새 기록 1건", "자리에 앉아 확인하십시오");
            s.Terminal.PlaySfx("sfx_beep_new", 0.6f, 0f);
            if (!s.Seat.IsSeated)
            {
                yield return new WaitForSeconds(2.4f);
                if (!s.Seat.IsSeated) s.Hud.SetObjective("모니터에 새 기록이 도착했다. 자리로 돌아가자.");
            }
            yield return WaitSeated();
            s.Hud.SetObjective(null);
        }

        /// <summary>경로 추적 미로. calibrate 는 시간 초과면 다시 한다. threat 미로는 적발될 때마다 25% 짧아진다</summary>
        IEnumerator RunMaze(StoryNode node, System.Action<string> done)
        {
            var m = node.Maze;
            if (!MazeMaps.All.TryGetValue(m.Map, out var def)) { Debug.LogError("[야간 평가실] 미로 없음: " + m.Map); done("timeout"); yield break; }
            yield return WaitSeated();
            while (true)
            {
                float time = def.Time;
                if (m.Kind == "threat") time *= Mathf.Pow(0.75f, vars.GetNum("caught"));
                var state = new MazeState(def, time, false, m.Drag);
                state.Sfx = (n, v) => s.Terminal.PlaySfx(n, v, 0.04f);
                state.OnHit = () => MazeHit(state);
                state.OnHidden = () =>
                {
                    vars.Add("annoy", 1); vars.Add("hidden_n", 1);
                    int n = Mathf.Min(3, (int)vars.GetNum("hidden_n"));
                    state.Say("가이드 › " + (n == 1 ? "…그건 누르지 마세요." : n == 2 ? "누가 말하냐고요? 지금은 제가요." : "계속 그러시면 저도 생각이 있어요."), 3.6f);
                    s.Env.ApplyMood();
                };
                state.OnDrag = () => { s.Audio.Ui("sfx_whisper", 0.4f); state.Drag(300); };
                s.Terminal.PreviewSubtle = vars.Format(m.Subtle);
                s.Terminal.PreviewDirect = vars.Format(m.Direct);
                s.Terminal.MazeStatusText = () => $"충돌 {(int)vars.GetNum("hits") % 3}/3 · 화면 균열 {(int)vars.GetNum("crack")}단계";
                s.Terminal.SetHeader("개입 콘솔 · 경로 추적", m.Kind == "calibrate" ? "calibrate()" : "감시 구간을 피해 도착점을 실행하십시오", vars.Get("clock"));
                string res = null;
                yield return s.Terminal.RunMaze(state, r => res = r);
                if (m.Kind == "calibrate" && res == "timeout") { yield return s.Terminal.ShowLine("guide", "괜찮아요. 다시 해 볼까요?", 0f); continue; }
                s.Terminal.SetHeader(vars.Format(node.Record ?? ""), "", vars.Get("clock"));
                done(res);
                yield break;
            }
        }

        void MazeHit(MazeState maze)
        {
            vars.Add("hits", 1);
            int h = (int)vars.GetNum("hits");
            if (h % 3 != 0) return;
            vars.Add("crack", 1);
            int c = (int)vars.GetNum("crack");
            s.Terminal.SetCrack(c);
            s.Terminal.PlaySfx("sfx_glass_crack", 0.95f, 0.02f);
            if (c >= 3) StartCoroutine(AbortLater(maze, 0.4f));
        }

        static IEnumerator AbortLater(MazeState m, float t) { yield return new WaitForSeconds(t); m.Abort("broken"); }

        // ---------- 코드 연출 (1단계: 흐름과 대사만. 화면 연출은 2단계에서 브라우저판처럼) ----------

        IEnumerator RunSeq(StoryNode node, List<StoryLine> lines, System.Action<string> done)
        {
            switch (node.Run)
            {
                case "freeze":
                    yield return gm.FakeFreeze();
                    yield return s.Terminal.ShowLine("guide", "아직 안 끝났어요.", 0.2f);
                    done(""); yield break;
                case "finalWait":
                    foreach (var c in new[] { "05:54", "05:56", "05:58", "05:59" })
                    {
                        yield return new WaitForSeconds(3.2f);
                        vars.Set("clock", c); s.Terminal.SetClock(c);
                    }
                    yield return new WaitForSeconds(2.5f);
                    done(""); yield break;
                case "chase":
                {
                    bool fin = false, escaped = false;
                    s.Chase.Begin(result => { fin = true; escaped = result; });
                    while (!fin) yield return null;
                    done(escaped ? node.Chase.Escaped : node.Chase.Caught);
                    yield break;
                }
                case "end1": case "end3": case "end4": case "end5": case "end6":
                    // 엔딩 연출: 대사를 보여 준 뒤 엔딩으로 (정전·눈·블루스크린·공허·텍스트 어드벤처 화면은 2단계)
                    if (node.Run == "end3") { s.Terminal.Glitch(1f, 1.2f); s.Terminal.PlaySfx("sfx_bsod", 0.7f, 0f); }
                    foreach (var line in lines)
                    {
                        if (s.Seat.IsSeated) yield return s.Terminal.ShowLine(line.Who, vars.Format(line.Text), line.Glitch);
                        else { s.Hud.Caption(vars.Format(line.Text)); yield return new WaitForSeconds(2.4f); }
                    }
                    done(""); yield break;
            }
            done("");
        }

        /// <summary>01:58: 고개를 들어 벽시계를 본다 (1단계: 잠깐 멈춤 + 시계 소리)</summary>
        IEnumerator GlanceClock()
        {
            yield return WaitSeated();
            s.Audio.Ui("sfx_tick", 0.25f);
            yield return new WaitForSeconds(3.4f);
        }
    }
}
