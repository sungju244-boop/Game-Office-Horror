using System.Collections;
using System.Collections.Generic;
using NightEval.Story;
using UnityEngine;

namespace NightEval.Director
{
    /// <summary>
    /// 이야기 진행: 노드 → (onEnter 이벤트) → 대사 → (after 이벤트) → 선택지 / 확인 대기 / 분기 / 엔딩 / 추격.
    /// 대사는 플레이어가 자리에 앉아 있을 때만 진행된다 (자리를 비우면 화면은 그대로 기다린다).
    /// </summary>
    public sealed class StoryDirector : MonoBehaviour
    {
        GameManager gm;
        Session s;
        StoryData data;
        StoryVars vars;
        Coroutine run;

        public string CurrentNode { get; private set; }

        public void Init(GameManager gm, Session session, StoryData data)
        {
            this.gm = gm;
            s = session;
            this.data = data;
            vars = session.Vars;
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

        IEnumerator RunFrom(string id)
        {
            int guard = 0;
            while (!string.IsNullOrEmpty(id))
            {
                if (++guard > 500) { Debug.LogError("[야간 평가실] 이야기 진행이 끝나지 않습니다 (순환?)"); yield break; }
                if (!data.Nodes.TryGetValue(id, out var node))
                {
                    Debug.LogError("[야간 평가실] 노드를 찾을 수 없습니다: " + id);
                    yield break;
                }
                CurrentNode = id;
                if (node.Chase != null) gm.SaveChaseSnapshot();
                StoryLogic.ApplySets(node.Set, vars);

                var lines = StoryLogic.VisibleLines(node.Lines, vars);
                if (node.Clear && lines.Count > 0) yield return WaitSeated();
                if (node.Clear) s.Terminal.ClearBody();
                if (node.Record != null)
                    s.Terminal.SetHeader(vars.Format(node.Record), vars.Format(node.Status ?? ""), vars.Get("clock"));
                else
                    s.Terminal.SetClock(vars.Get("clock"));

                foreach (string ev in node.OnEnter) s.Env.Fire(ev);

                foreach (var line in lines)
                {
                    yield return WaitSeated();
                    yield return s.Terminal.ShowLine(line.Who, vars.Format(line.Text), line.Glitch);
                    if (line.Pause > 0f) yield return new WaitForSeconds(line.Pause);
                }

                foreach (string ev in node.After) s.Env.Fire(ev);

                if (!string.IsNullOrEmpty(node.Ending))
                {
                    yield return new WaitForSeconds(1.2f);
                    gm.TriggerEnding(node.Ending);
                    yield break;
                }

                if (node.Chase != null)
                {
                    bool done = false, escaped = false;
                    s.Chase.Begin(result => { done = true; escaped = result; });
                    while (!done) yield return null;
                    id = escaped ? node.Chase.Escaped : node.Chase.Caught;
                    continue;
                }

                var choices = StoryLogic.VisibleChoices(node, vars);
                if (choices.Count > 0)
                {
                    yield return WaitSeated();
                    int picked = -1;
                    var labels = new List<string>();
                    var unsettling = new List<bool>();
                    foreach (var c in choices) { labels.Add(vars.Format(c.Text)); unsettling.Add(c.Unsettling); }
                    s.Terminal.ShowChoices(labels, unsettling, i => picked = i);
                    while (picked < 0) yield return null;
                    var ch = choices[picked];
                    StoryLogic.ApplySets(ch.Set, vars);
                    foreach (string ev in ch.Events) s.Env.Fire(ev);
                    id = ch.Next;
                    continue;
                }

                if (node.Wait != null && !string.IsNullOrEmpty(node.Wait.Flag))
                {
                    if (!vars.Truthy(node.Wait.Flag))
                    {
                        s.Terminal.ClearBody();
                        s.Terminal.ShowCenter(string.IsNullOrEmpty(node.Wait.Screen) ? "다음 기록 대기 중" : vars.Format(node.Wait.Screen), "· · ·");
                        string hint = vars.Format(node.Wait.Hint ?? "");
                        if (hint.Length > 0) s.Hud.SetObjective(hint);
                        float waited = 0f;
                        bool reminded = false;
                        while (!vars.Truthy(node.Wait.Flag))
                        {
                            waited += Time.deltaTime;
                            if (!reminded && waited > 90f && hint.Length > 0)
                            {
                                reminded = true;
                                s.Hud.SetObjective(hint + "  (E 로 확인)");
                            }
                            // 안전장치: 확인 지점을 끝내 찾지 못해도 진행이 영원히 멈추지는 않게
                            if (waited > 240f)
                            {
                                Debug.LogWarning("[야간 평가실] 확인 대기 시간 초과로 자동 진행: " + node.Wait.Flag);
                                vars.Set(node.Wait.Flag, "1");
                            }
                            yield return null;
                        }
                        s.Hud.SetObjective(null);
                        s.Terminal.ShowCenter("새 기록 1건", "자리에 앉아 확인하십시오");
                        s.Terminal.PlaySfx("sfx_beep_new", 0.6f, 0f);
                        if (!s.Seat.IsSeated)
                        {
                            yield return new WaitForSeconds(2.2f);
                            if (!s.Seat.IsSeated) s.Hud.SetObjective("모니터에 새 기록이 도착했다. 자리로 돌아가자.");
                        }
                        yield return WaitSeated();
                        s.Hud.SetObjective(null);
                    }
                }

                id = StoryLogic.ResolveNext(node, vars);
            }
        }
    }
}
