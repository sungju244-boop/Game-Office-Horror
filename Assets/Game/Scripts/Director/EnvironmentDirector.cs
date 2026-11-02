using System.Collections;
using System.Collections.Generic;
using NightEval.Story;
using NightEval.World;
using UnityEngine;

namespace NightEval.Director
{
    /// <summary>
    /// story.json 의 events 를 실제 공간 변화로 바꾼다 (문, 조명, 소리, CCTV, 모니터, 확인 지점…).
    /// 이벤트 하나는 동작 목록이며, "wait" 로 순서와 간격을 만든다.
    /// </summary>
    public sealed class EnvironmentDirector : MonoBehaviour
    {
        GameManager gm;
        Session s;
        StoryData data;
        StoryVars vars;
        WorldRegistry w;
        readonly Dictionary<string, AudioSource> loops = new Dictionary<string, AudioSource>();
        RenderTexture cctvRT;

        public void Init(GameManager gm, Session session, StoryData data)
        {
            this.gm = gm;
            s = session;
            this.data = data;
            vars = session.Vars;
            w = session.World;
            SetupDefaultInteractions();
        }

        public void Fire(string id)
        {
            if (string.IsNullOrEmpty(id)) return;
            if (!data.Events.TryGetValue(id, out var ev))
            {
                Debug.LogWarning("[야간 평가실] 정의되지 않은 이벤트: " + id);
                return;
            }
            StartCoroutine(Run(ev));
        }

        IEnumerator Run(StoryEvent ev)
        {
            foreach (var a in ev.Actions)
            {
                if (a.Type == "wait")
                {
                    yield return new WaitForSeconds(a.Num("s", 1f));
                    continue;
                }
                if (a.Type == "monitors")
                {
                    yield return Monitors(a);
                    continue;
                }
                try { Do(a); }
                catch (System.Exception e) { Debug.LogError("[야간 평가실] 이벤트 '" + ev.Id + "' 동작 '" + a.Type + "' 오류: " + e); }
            }
        }

        void Do(StoryAction a)
        {
            string target = a.Str("target", "");
            switch (a.Type)
            {
                case "set":
                    vars.Apply(a.Str("value", ""));
                    break;
                case "door":
                    if (w.Doors.TryGetValue(target, out var door))
                    {
                        if (a.Has("locked")) door.SetLocked(a.Bool("locked"));
                        if (a.Has("open")) door.SetOpen(a.Num("open"), a.Num("time", 1.5f));
                    }
                    break;
                case "drawer":
                    if (w.Drawers.TryGetValue(target, out var dr)) dr.Open();
                    break;
                case "light":
                    foreach (var l in w.Lights(target)) l.FadeTo(a.Num("level", 1f), a.Num("time", 1f));
                    break;
                case "flicker":
                    foreach (var l in w.Lights(target)) l.Flicker = a.Bool("on", true);
                    break;
                case "hum":
                    s.Audio.SetHum(a.Bool("on", true), a.Num("time", 1f));
                    SetLoop("fan", a.Bool("on", true) ? 0.3f : 0f);
                    break;
                case "sound":
                {
                    string clip = a.Str("clip", "");
                    float vol = a.Num("volume", 0.8f);
                    if (a.Bool("loop"))
                    {
                        string lid = a.Str("id", clip);
                        StopLoop(lid);
                        var anchor = ResolveAnchor(a.Str("at", "player"));
                        var src = s.Audio.Loop3D(clip, anchor, vol, 1f, a.Num("range", 14f));
                        if (src != null) loops[lid] = src;
                    }
                    else s.Audio.PlayAt(clip, ResolvePos(a.Str("at", "player")), vol, 0.03f, a.Num("range", 20f));
                    break;
                }
                case "stopsound":
                    StopLoop(a.Str("id", ""));
                    break;
                case "cctv":
                    Cctv(a);
                    break;
                case "terminal":
                    if (a.Has("power")) s.Terminal.SetPower(a.Num("power"), a.Num("time", 0.6f));
                    if (a.Has("glitch")) s.Terminal.Glitch(a.Num("glitch"), a.Num("time", 0.5f));
                    break;
                case "glitch":
                    s.Terminal.Glitch(a.Num("amount", 0.6f), a.Num("time", 0.4f));
                    s.Post.Flash(a.Num("flash", 0f));
                    break;
                case "phone":
                    if (a.Bool("ring", true))
                    {
                        StopLoop("phone");
                        var src = s.Audio.Loop3D("sfx_phone", w.Anchor("Phone"), 0.55f, 1f, 16f);
                        if (src != null) loops["phone"] = src;
                    }
                    else StopLoop("phone");
                    break;
                case "checkpoint":
                    Checkpoint(a);
                    break;
                case "hint":
                    s.Hud.SetObjective(vars.Format(a.Str("text", "")));
                    break;
                case "caption":
                    s.Hud.Caption(vars.Format(a.Str("text", "")));
                    break;
                case "monologue":
                    if (a.Has("inspect")) ShowInspect(a.Str("inspect", ""));
                    else s.Hud.Monologue(new List<string> { vars.Format(a.Str("text", "")) });
                    break;
                case "tension":
                {
                    int lv = (int)a.Num("level", 0f);
                    s.Audio.SetTension(lv);
                    s.Terminal.Tension = lv;
                    s.Post.Tension = lv;
                    vars.SetNum("tension", lv);
                    break;
                }
                case "fog":
                    StartCoroutine(FogTo(a.Num("density", 0.08f), a.Num("time", 3f)));
                    break;
                case "music":
                    s.Audio.SetMusic(a.Str("track", "game"));
                    break;
                case "standup":
                    s.Seat.ForceExit(false);
                    break;
                case "draft":
                    SetDraft(a.Num("volume", 0.3f));
                    break;
                case "led":
                    if (w.Doors.TryGetValue(target, out var d2)) d2.SetLocked(a.Bool("red", d2.Locked));
                    break;
                default:
                    Debug.LogWarning("[야간 평가실] 알 수 없는 동작: " + a.Type);
                    break;
            }
        }

        // ---------- 위치 ----------

        Transform ResolveAnchor(string at)
        {
            if (at == "player" || string.IsNullOrEmpty(at)) return s.Player.transform;
            var t = w.Anchor(at);
            return t != null ? t : s.Player.transform;
        }

        Vector3 ResolvePos(string at)
        {
            var p = s.Player.transform;
            switch (at)
            {
                case "player": return p.position + Vector3.up * 1.2f;
                case "behind": return p.position - p.forward * 3.2f + Vector3.up * 1.2f;
                case "above": return p.position + Vector3.up * 2.4f;
            }
            var t = w.Anchor(at);
            return t != null ? t.position : p.position;
        }

        // ---------- 소리 루프 ----------

        void StopLoop(string id)
        {
            if (string.IsNullOrEmpty(id)) return;
            if (loops.TryGetValue(id, out var src) && src != null) StartCoroutine(FadeOut(src, 0.6f));
            loops.Remove(id);
        }

        void SetLoop(string id, float volume)
        {
            if (loops.TryGetValue(id, out var src) && src != null)
            {
                if (volume <= 0f) StartCoroutine(FadeOut(src, 1.5f, false));
                else { src.volume = volume; if (!src.isPlaying) src.Play(); }
            }
        }

        IEnumerator FadeOut(AudioSource src, float time, bool destroy = true)
        {
            float v = src.volume;
            float t = 0f;
            while (t < 1f && src != null)
            {
                t += Time.deltaTime / time;
                src.volume = Mathf.Lerp(v, 0f, t);
                yield return null;
            }
            if (src == null) yield break;
            if (destroy) Destroy(src.gameObject);
            else src.Stop();
        }

        public void StartAmbientLoops()
        {
            var pc = w.Anchor("PlayerDesk");
            if (pc != null)
            {
                var fan = s.Audio.Loop3D("amb_fan", pc, 0.3f, 0.5f, 7f);
                if (fan != null) loops["fan"] = fan;
            }
            if (w.LiveScreen != null)
            {
                var crt = s.Audio.Loop3D("amb_crt", w.LiveScreen, 0.16f, 0.3f, 4f);
                if (crt != null) loops["crt"] = crt;
            }
            var corridor = w.Anchor("Corridor");
            if (corridor != null)
            {
                var draft = s.Audio.Loop3D("amb_draft", corridor, 0.0f, 1f, 9f);
                if (draft != null) loops["draft"] = draft;
            }
        }

        public void SetDraft(float volume)
        {
            if (loops.TryGetValue("draft", out var d) && d != null) d.volume = volume;
        }

        public void StopAllLoops()
        {
            foreach (var kv in loops) if (kv.Value != null) Destroy(kv.Value.gameObject);
            loops.Clear();
        }

        // ---------- CCTV / 모니터 ----------

        void Cctv(StoryAction a)
        {
            var cam = w.Cctv;
            if (cam == null) return;
            if (a.Has("led")) cam.SetLed(a.Bool("led"));
            if (a.Has("track"))
            {
                cam.Tracking = a.Bool("track");
                cam.Target = s.Player.transform;
                cam.OnServo = () => s.Audio.PlayAt("sfx_servo", cam.transform.position, 0.35f, 0.05f, 12f);
            }
            if (a.Bool("feed"))
            {
                if (cctvRT == null)
                {
                    cctvRT = s.Ctx.Own(new RenderTexture(320, 240, 16, RenderTextureFormat.ARGB32) { name = "CctvRT", filterMode = FilterMode.Point });
                    cctvRT.Create();
                    var camGo = new GameObject("FeedCamera");
                    camGo.transform.SetParent(cam.Head, false);
                    camGo.transform.localPosition = new Vector3(0, 0, 0.15f);
                    var c = camGo.AddComponent<Camera>();
                    c.enabled = false;
                    c.targetTexture = cctvRT;
                    c.fieldOfView = 78f;
                    c.nearClipPlane = 0.1f;
                    c.farClipPlane = 30f;
                    c.cullingMask = ~(1 << Layers.Terminal);
                    c.clearFlags = CameraClearFlags.SolidColor;
                    c.backgroundColor = Color.black;
                    c.allowHDR = false;
                    c.allowMSAA = false;
                    cam.FeedCamera = c;
                    cam.FeedTexture = cctvRT;
                }
                cam.StartFeed();
                if (w.CctvMonitor != null) w.CctvMonitor.TurnOn(s.Ctx, cctvRT, new Color(0.75f, 0.95f, 0.85f), 1.6f, 0.5f);
                vars.Set("cctv_on", "1");
            }
        }

        IEnumerator Monitors(StoryAction a)
        {
            string mode = a.Str("mode", "117");
            float interval = a.Num("interval", 0.6f);
            var list = new List<MonitorScreen>(w.DeadMonitors);
            // 플레이어에게서 가까운 순서로 하나씩
            Vector3 pp = s.Player.transform.position;
            list.Sort((x, y) => (x.transform.position - pp).sqrMagnitude.CompareTo((y.transform.position - pp).sqrMagnitude));
            var tex = Res.Tex(a.Str("tex", "screen_117"), false);
            foreach (var m in list)
            {
                if (m == null) continue;
                if (mode == "off") m.TurnOff(0.3f);
                else
                {
                    m.TurnOn(s.Ctx, tex, new Color(0.75f, 0.9f, 1f), 1.2f, 0.35f);
                    s.Audio.PlayAt("sfx_crt_on", m.transform.position + Vector3.up * 1f, 0.35f, 0.08f, 14f);
                }
                yield return new WaitForSeconds(interval);
            }
            if (mode != "off") vars.Set("monitors_on", "1");
        }

        IEnumerator FogTo(float density, float time)
        {
            float start = RenderSettings.fogDensity;
            float t = 0f;
            while (t < 1f)
            {
                t += Time.deltaTime / Mathf.Max(0.01f, time);
                RenderSettings.fogDensity = Mathf.Lerp(start, density, t);
                yield return null;
            }
        }

        // ---------- 확인 지점 ----------

        void Checkpoint(StoryAction a)
        {
            string target = a.Str("target", "");
            string flag = a.Str("flag", "");
            string prompt = a.Str("prompt", "확인한다");
            string inspect = a.Str("inspect", "");
            string place = a.Str("place", "");
            string timer = a.Str("timer", "");
            string then = a.Str("then", "");
            float created = Time.time;
            var targets = w.FindInteractables(target);
            if (targets.Count == 0)
            {
                Debug.LogWarning("[야간 평가실] 확인 지점 대상 없음: " + target + " → 바로 통과 처리");
                vars.Set(flag, "1");
                return;
            }
            var owner = new object();
            foreach (var it in targets)
            {
                it.Add(prompt, () => !vars.Truthy(flag), () =>
                {
                    if (vars.Truthy(flag)) return;
                    vars.Set(flag, "1");
                    if (place.Length > 0) vars.Set("last_place", place);
                    if (timer.Length > 0) vars.SetNum(timer, Mathf.Max(1f, Mathf.Round(Time.time - created)));
                    foreach (var t2 in targets) t2.RemoveOwner(owner);
                    ShowInspect(inspect);
                    s.Audio.Ui("sfx_check", 0.25f);
                    if (then.Length > 0) Fire(then);
                }, 100, owner);
            }
        }

        public void ShowInspect(string inspectId)
        {
            var lines = StoryLogic.InspectLines(data, inspectId, vars);
            if (lines.Count > 0) s.Hud.Monologue(lines);
        }

        // ---------- 기본 상호작용 (조사, 문) ----------

        static string InspectKey(string id)
        {
            if (id.StartsWith("Window")) return "window";
            if (id.StartsWith("crt_")) return "dead_pc";
            if (id.Length == 3 && id[0] == 'D' && char.IsDigit(id[1])) return "desk";
            return id;
        }

        void SetupDefaultInteractions()
        {
            foreach (var kv in w.Interactables)
            {
                string id = kv.Key;
                var it = kv.Value;
                if (w.Doors.ContainsKey(id)) continue;
                if (id == "Computer") continue;
                string key = InspectKey(id);
                if (!data.Inspects.ContainsKey(key)) continue;
                it.Add("살펴본다", () => true, () => ShowInspect(key), 0, this);
            }

            foreach (var kv in w.Doors)
            {
                var door = kv.Value;
                var it = w.Interactables.TryGetValue(kv.Key, out var found) ? found : null;
                if (it == null) continue;
                string id = kv.Key;

                // 잠긴 문: 손잡이를 돌려본다
                it.Add("문을 열어본다", () => door.Locked && !(id == "ExitDoor" && vars.Truthy("chase")), () =>
                {
                    s.Audio.PlayAt("sfx_door_locked", door.transform.position + Vector3.up, 0.6f, 0.05f, 10f);
                    ShowInspect(id + "_locked");
                }, 1, this);

                if (id == "FrontDoor")
                {
                    // 잠기지 않은 입구 = 퇴근(중도 이탈) 선택
                    it.Add("퇴근한다", () => !door.Locked && !vars.Truthy("final") && !vars.Truthy("chase") && gm.Phase == GamePhase.Playing, () =>
                    {
                        gm.AskLeave();
                    }, 2, this);
                }
                else if (id == "BackDoor")
                {
                    it.Add("문을 연다", () => !door.Locked && door.Amount < 0.5f && !door.Busy, () =>
                    {
                        door.SetOpen(1f, 1.4f);
                        s.Audio.PlayAt("sfx_door_open", door.transform.position + Vector3.up, 0.7f, 0.04f, 14f);
                        vars.Set("back_ajar", "1");
                        SetDraft(0.35f);
                    }, 2, this);
                    it.Add("문을 닫는다", () => !door.Locked && door.Amount >= 0.5f && !door.Busy && !vars.Truthy("chase"), () =>
                    {
                        door.SetOpen(0f, 1.2f);
                        s.Audio.PlayAt("sfx_door_close", door.transform.position + Vector3.up, 0.7f, 0.04f, 14f);
                        vars.Remove("back_ajar");
                        SetDraft(0f);
                    }, 2, this);
                }
            }

        }
    }
}
