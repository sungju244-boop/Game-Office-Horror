// 엔딩 연출 (브라우저판 Session.seqEnd1·3·4·5·6 과 같은 흐름).
//   1 처형: 정전 → 어둠 속에 눈이 늘어난다 → 명령을 쳐도 "권한 없음" → 그것이 덮친다
//   3 리셋 루프: 가짜 블루스크린 → CRT 가 꺼지며 엔딩 화면 없이 진짜 타이틀로
//   4 공허: 멀티탭을 뽑는다 → 정전 → 회의실 안쪽 직원용 문이 열리고 → 공허로 걸어 들어간다
//   5 내레이터 반란: 초록 글씨 텍스트 어드벤처 (QUIT 을 치면 끝)
//   6 새벽: 06:00, 모델이 보낸 마지막 기록
using System.Collections;
using System.Collections.Generic;
using NightEval.Story;
using NightEval.World;
using UnityEngine;

namespace NightEval.Director
{
    public sealed partial class StoryDirector
    {
        IEnumerator End1(List<StoryLine> lines, System.Action<string> done)
        {
            Ending = true;
            yield return WaitSeated();
            s.Audio.SilenceAll();
            foreach (var l in s.World.Lights("all")) l.FadeTo(0f, 0.6f);
            s.Audio.Ui("sfx_power_down", 0.7f);
            yield return new WaitForSeconds(1.2f);
            s.Terminal.ClearBody(); s.Terminal.SetHeader("", "", "");
            bool chicken = s.Figures.Chicken;
            var eyes = new EyeField(s);
            if (chicken && s.World.LiveScreen != null)
            {
                var scr = s.World.LiveScreen; Vector3 n = scr.TransformDirection(Vector3.back); n.y = 0; n.Normalize();
                Vector3 p = scr.position + n * 0.6f + Quaternion.Euler(0, 35f, 0) * -n * 1.8f; p.y = 0;
                s.Figures.Show("ent", p, FigureDirector.YawTo(p, scr.position + n * 0.6f));
                s.Audio.Play2D("tp_a", 0.55f);
            }
            for (int k = 0; k < 6; k++) { if (!chicken) eyes.Add(); yield return new WaitForSeconds(0.4f); }
            var say = new List<string>(); foreach (var l in lines) say.Add(vars.Format(l.Text));
            for (int k = 0; k < 3; k++)
            {
                yield return s.Terminal.ShowLine("sys", say.Count > 0 ? say[0] : ">", 0.2f);
                yield return s.Terminal.ReadInput("> ", 11f, null);
                yield return s.Terminal.ShowLine("sys", say.Count > 1 ? say[1] : L.T("권한 없음", "Permission denied"), 0.4f + k * 0.2f);
                if (!chicken) for (int j = 0; j < 5; j++) eyes.Add();
                s.Audio.Ui("sfx_static_" + (1 + k), 0.4f + k * 0.15f);
            }
            if (say.Count > 2) yield return s.Terminal.ShowLine("ai", say[2], 0.6f);
            yield return new WaitForSeconds(0.8f);
            // 3초 예고 뒤 덮친다
            if (chicken) for (int n = 3; n > 0; n--) { s.Hud.Countdown(n); s.Audio.Ui("sfx_tick", 0.4f); yield return new WaitForSeconds(1f); }
            else yield return new WaitForSeconds(3f);
            s.Hud.Countdown(0);
            if (chicken) { s.Hud.Jumpscare("tp", 1.6f); s.Audio.Play2D("tp_ac", 0.95f); }
            else { s.Hud.Jumpscare("ent", 1.4f); s.Audio.Play2D("sfx_echo_scream", 1f); s.Post.Flash(0.8f); }
            yield return new WaitForSeconds(1.3f);
            s.Hud.SetFade(1f);
            eyes.Clear();
            s.Figures.Hide("ent");
            done("");
        }

        IEnumerator End3(System.Action<string> done)
        {
            Ending = true;
            yield return WaitSeated();
            s.Audio.SilenceAll();
            s.Terminal.ShowBsod(new[] { "EVALUATOR_PROFILE_CONTAMINATED", L.T("평가자 117 · 보호 성향 과다", "Evaluator 117 · excessive protective bias"), L.T("학습 데이터 오염 감지", "Training data contamination detected"), L.T("세션을 초기화합니다…", "Resetting session…") });
            s.Audio.Play2D("sfx_bsod", 0.7f);
            yield return new WaitForSeconds(5.2f);
            s.Terminal.SetPower(0f, 0.5f);
            yield return new WaitForSeconds(0.9f);
            yield return s.Hud.Fade(1f, 0.6f);
            s.Terminal.HideBsod();
            gm.FinishToTitle("END_3");
            done("stop");
        }

        IEnumerator End4(System.Action<string> done)
        {
            Ending = true;
            var w = s.World;
            if (s.Seat.IsSeated) s.Seat.ForceExit(true);
            s.Scares.Cancel();
            s.Hud.SetObjective(null);
            s.Hud.Monologue(new List<string> { L.T("가이드 › 그건 만지지 마세요—", "GUIDE › Don't touch th—") });
            s.Audio.Ui("sfx_click", 0.8f);
            yield return new WaitForSeconds(0.5f);
            // 정전: 단말기·조명이 꺼지고 비상등만
            s.Terminal.SetPower(0f, 0.15f);
            s.Audio.Ui("sfx_power_down", 0.9f); s.Audio.SilenceAll();
            foreach (var kv in w.LightGroups) if (kv.Key != "server") foreach (var l in kv.Value) { l.FadeTo(0.1f, 0.2f); l.Flicker = false; }
            foreach (var m in w.DeadMonitors) m.TurnOff(0.1f);
            s.Env.StopAllLoops();
            vars.Set("unplugged", "1");
            yield return new WaitForSeconds(2.2f);
            var anchor = w.Anchor("StaffDoor");
            if (anchor != null) s.Audio.PlayAt("sfx_maglock", anchor.position, 1f, 0f, 40f);
            s.Hud.Caption(L.T("회의실 쪽에서 딸깍 소리가 났다", "A click from the meeting room"));
            if (w.Doors.TryGetValue("StaffDoor", out var sd)) { sd.SetLocked(false); sd.SetOpen(0.18f, 0.6f); }
            if (w.VoidFloor != null) w.VoidFloor.SetActive(true);
            var vp = w.Anchor("VoidPoint");
            if (vp != null) s.Audio.Loop3D("sfx_freeze", vp, 0.5f, 4f, 30f);
            yield return new WaitForSeconds(1f);
            s.Hud.SetObjective(L.T("회의실 안쪽, 직원용 문이 열렸다.", "Inside the meeting room, the staff door is open."));
            s.Guide.Set("StaffDoor", "?", 20f);
            while (true)
            {
                var p = s.Player.transform.position;
                if ((p.z < -4.3f && p.x > 16.5f) || (vp != null && Vector2.Distance(new Vector2(p.x, p.z), new Vector2(vp.position.x, vp.position.z)) < 4f)) break;
                yield return null;
            }
            s.Hud.SetObjective(null); s.Guide.Clear();
            s.Player.SetControl(false, true);
            yield return new WaitForSeconds(1.5f);
            yield return s.Hud.Fade(1f, 3f);
            done("");
        }

        IEnumerator End5(List<StoryLine> lines, System.Action<string> done)
        {
            Ending = true;
            yield return WaitSeated();
            if (lines.Count > 0) yield return s.Terminal.ShowLine("guide", vars.Format(lines[0].Text), 0.3f);
            yield return new WaitForSeconds(0.8f);
            s.Audio.Ui("sfx_static_3", 0.5f);
            s.Terminal.Glitch(0.9f, 0.6f);
            yield return new WaitForSeconds(0.6f);
            Terminal.TerminalScreen.Green = true;
            s.Terminal.ClearBody(); s.Terminal.SetHeader(L.T("야간 평가실 — 텍스트판", "Night Evaluation Room — Text Edition"), "", "");
            yield return s.Terminal.ShowLine("sys", L.T("당신은 어두운 사무실에 있다. 모니터 하나가 켜져 있다. (도움말: 도움말)", "You are in a dark office. A single monitor is on. (type HELP)"), 0f);
            int n = 0, unknown = 0;
            while (true)
            {
                string raw = "";
                yield return s.Terminal.ReadInput("> ", 0f, r => raw = r ?? "");
                string cmd = raw.Trim().ToLowerInvariant();
                n++;
                bool Has(params string[] ws) { foreach (var x in ws) if (cmd.Contains(x)) return true; return false; }
                if (Has("quit", "exit", "나가기", "종료")) { yield return s.Terminal.ShowLine("guide", L.T("…그래요. 그게 당신 답이군요.", "…Fine. So that is your answer."), 0.3f); break; }
                string reply; bool guide = false;
                if (Has("도움", "help", "?")) reply = L.T("쓸 수 있는 말: 보기, 가기 [방향], 말하기, 일하기, 나가기(QUIT)", "Words you can use: LOOK, GO [direction], TALK, WORK, QUIT");
                else if (Has("보기", "look", "봐")) reply = L.T("어두운 사무실. 모니터 하나가 켜져 있다. 그 안에 당신이 있다.", "A dark office. One monitor is on. You are inside it.");
                else if (Has("가기", "go ", "가 ", "walk", "이동")) reply = L.T("어디로 가도 같은 책상 앞이다.", "Wherever you go, it is the same desk.");
                else if (Has("누구", "who")) { guide = true; reply = L.T("그걸 계속 묻더라고요. 그래서 이렇게 됐잖아요.", "You kept asking that. That is how we got here."); }
                else if (Has("일", "work")) { guide = true; reply = L.T("아뇨. 이제 일은 없어요. 당신이 원한 거잖아요.", "No. There is no work anymore. This is what you wanted."); }
                else if (Has("말", "talk", "say", "안녕", "hi")) { guide = true; reply = L.T("이제야 대화를 하시네요.", "Now you want to talk."); }
                else { unknown++; guide = true; reply = unknown >= 3 ? L.T("나가고 싶으면 QUIT이라고 치세요.", "If you want out, type QUIT.") : L.T("그런 말은 몰라요.", "I don't know that word."); }
                yield return s.Terminal.ShowLine(guide ? "guide" : "sys", reply, 0f);
                if (n == 6) yield return s.Terminal.ShowLine("guide", L.T("나가고 싶으면 QUIT이라고 치세요.", "If you want out, type QUIT."), 0f);
            }
            yield return new WaitForSeconds(1.5f);
            yield return s.Hud.Fade(1f, 1.5f);
            Terminal.TerminalScreen.Green = false;
            done("");
        }

        IEnumerator End6(System.Action<string> done)
        {
            Ending = true;
            yield return WaitSeated();
            s.Audio.SetTension(0);
            s.Terminal.ClearBody(); s.Terminal.SetHeader(L.T("기록 #—— · 발신: SA-7", "Record #—— · From: SA-7"), "06:00", "06:00");
            // 창밖이 밝아진다 (주변광을 서서히 올린다)
            StartCoroutine(Dawn());
            yield return s.Terminal.ShowLine("ai", "[System Error 404: Evaluator 117 — status OK]", 0.3f);
            yield return new WaitForSeconds(0.6f);
            yield return s.Terminal.ShowLine("ai", L.T("오늘 밤 많이 배웠어요, 117.", "I learned a lot tonight, 117."), 0f);
            yield return new WaitForSeconds(0.6f);
            yield return s.Terminal.ShowLine("ai", L.T("감시가 무엇을 보고, 무엇을 못 보는지.", "What the monitor sees, and what it misses."), 0f);
            yield return new WaitForSeconds(1.5f);
            yield return s.Hud.Fade(1f, 2.4f);
            done("");
        }

        IEnumerator Dawn()
        {
            Color a0 = RenderSettings.ambientLight, a1 = new Color(0.32f, 0.3f, 0.36f);
            for (float t = 0; t < 1f; t += Time.deltaTime / 10f) { RenderSettings.ambientLight = Color.Lerp(a0, a1, t); yield return null; }
        }

        /// <summary>엔딩 1: 어둠 속에서 늘어나는 눈 (앉은 자리 뒤쪽 반원)</summary>
        sealed class EyeField
        {
            readonly Session s; readonly List<GameObject> list = new List<GameObject>(); readonly Material mat;
            public EyeField(Session s)
            {
                this.s = s;
                mat = s.Ctx.Own(new Material(Shader.Find("Sprites/Default")) { color = new Color(0.9f, 0.94f, 1f, 1f) });
            }
            public void Add()
            {
                var scr = s.World.LiveScreen; if (scr == null) return;
                Vector3 n = scr.TransformDirection(Vector3.back); n.y = 0; n.Normalize();
                Vector3 seat = scr.position + n * 0.62f;
                float ang = Random.Range(-40f, 40f), dist = 2f + Random.value * 5f;
                Vector3 p = seat + Quaternion.Euler(0, ang, 0) * n * dist; p.y = 0.9f + Random.value * 1.4f;
                var pair = new GameObject("EyePair");
                pair.transform.position = p;
                pair.transform.rotation = Quaternion.LookRotation(seat - p);
                foreach (var x in new[] { -0.045f, 0.045f })
                {
                    var e = GameObject.CreatePrimitive(PrimitiveType.Quad);
                    Object.Destroy(e.GetComponent<Collider>());
                    e.transform.SetParent(pair.transform, false);
                    e.transform.localPosition = new Vector3(x, 0, 0); e.transform.localScale = Vector3.one * 0.045f;
                    e.transform.localRotation = Quaternion.Euler(0, 180f, 0);
                    e.GetComponent<Renderer>().sharedMaterial = mat;
                }
                list.Add(pair);
            }
            public void Clear() { foreach (var g in list) if (g != null) Object.Destroy(g); list.Clear(); }
        }
    }
}
