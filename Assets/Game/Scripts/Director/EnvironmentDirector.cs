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
        // 브라우저판과 같은 동작 이름 (story.json v2). scare(깜짝 연출)는 2단계에서 옮긴다.
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
                if (!Condition.Eval(a.Str("if", ""), vars)) continue;
                if (a.Type == "scare") { Debug.Log("[야간 평가실] 깜짝 연출(2단계 예정): " + a.Str("kind", "")); continue; }
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
                case "mood":
                    ApplyMood();
                    break;
                case "print":
                    Print(a);
                    break;
                case "projector":
                    Projector(a.Bool("on"));
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
            // 여러 대 중 대상(CAM1~3)으로 화면을 옮긴다. 이미 만든 화면용 카메라는 그대로 옮겨 단다
            string tgt = a.Str("target", "");
            if (tgt.Length > 0 && w.Cctvs.TryGetValue(tgt, out var tc) && tc != w.Cctv)
            {
                var old = w.Cctv;
                w.Cctv = tc;
                if (old != null)
                {
                    old.SetLed(false);
                    if (old.FeedCamera != null)
                    {
                        old.FeedCamera.transform.SetParent(tc.Head, false);
                        old.FeedCamera.transform.localPosition = new Vector3(0, 0, 0.15f);
                        old.FeedCamera.transform.localRotation = Quaternion.identity;
                        tc.FeedCamera = old.FeedCamera; tc.FeedTexture = old.FeedTexture;
                        old.FeedCamera = null; old.FeedTexture = null;
                        tc.StartFeed();
                    }
                }
                tc.SetLed(true);
            }
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
            if (flag.Length > 0 && vars.Truthy(flag)) return;
            if (a.Has("zone"))
            {
                var z = MiniJson.List(a.Args, "zone");
                if (z.Count >= 4)
                    zones.Add(new Zone
                    {
                        X0 = System.Convert.ToSingle(z[0]), Z0 = System.Convert.ToSingle(z[1]), X1 = System.Convert.ToSingle(z[2]), Z1 = System.Convert.ToSingle(z[3]),
                        Fn = () => { if (flag.Length > 0 && vars.Truthy(flag)) return; if (flag.Length > 0) vars.Set(flag, "1"); ShowInspect(inspect); if (then.Length > 0) Fire(then); }
                    });
                return;
            }
            var targets = w.FindInteractables(target);
            if (targets.Count == 0)
            {
                Debug.LogWarning("[야간 평가실] 확인 지점 대상 없음: " + target + " → 바로 통과 처리");
                vars.Set(flag, "1");
                return;
            }
            if (flag.Length > 0) s.Guide.Set(target, WpLabel(target), 25f);
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

        static string WpLabel(string id)
        {
            switch (id) { case "Printer": return "프린터"; case "CctvMonitor": return "관리자실 CCTV"; case "Projector": return "회의실 프로젝터"; case "Phone": return "관리자실 전화"; default: return id; }
        }

        public void ShowInspect(string inspectId)
        {
            if (string.IsNullOrEmpty(inspectId)) return;
            var r = StoryLogic.Inspect(data, inspectId, vars);
            StoryLogic.ApplySets(r.Set, vars);
            if (r.Lines.Count > 0) s.Hud.Monologue(r.Lines);
        }

        // ---------- 구역 확인 지점 (배치 좌표: x, z 는 Unity 좌표 그대로) ----------
        sealed class Zone { public float X0, Z0, X1, Z1; public System.Action Fn; }
        readonly List<Zone> zones = new List<Zone>();

        void Update()
        {
            if (zones.Count == 0 || s == null || s.Player == null) return;
            var p = s.Player.transform.position;
            for (int i = zones.Count - 1; i >= 0; i--)
            {
                var z = zones[i];
                if (p.x >= Mathf.Min(z.X0, z.X1) && p.x <= Mathf.Max(z.X0, z.X1) && p.z >= Mathf.Min(z.Z0, z.Z1) && p.z <= Mathf.Max(z.Z0, z.Z1))
                { zones.RemoveAt(i); z.Fn(); }
            }
        }

        // ---------- 사무실 분위기 (구하지 못한 사람 수에 따라 어두워진다) ----------
        public void ApplyMood()
        {
            float k = vars.GetNum("victims") >= 1 ? 0.62f : 1f;
            foreach (var g in new[] { "zoneA", "zoneB", "aisle" })
                foreach (var l in w.Lights(g)) l.Mood = k;
            StartCoroutine(FogTo(baseFog + (vars.GetNum("victims") >= 1 ? 0.014f : 0f), 2.5f));
        }
        public float baseFog = 0.062f;

        // ---------- 프린터: 혼자 출력한다. 출력물을 집으면 flag ----------
        void Print(StoryAction a)
        {
            var it = w.Interactables.TryGetValue("Printer", out var found) ? found : null;
            var pos = it != null ? it.transform.position : s.Player.transform.position;
            s.Audio.PlayAt("sfx_printer", pos + Vector3.up * 0.8f, 0.9f, 0.03f, 22f);
            string flag = a.Str("flag", "");
            var sheet = data.Sheets.TryGetValue(a.Str("sheet", ""), out var sh) ? sh : new List<string>();
            if (it == null) { if (flag.Length > 0) vars.Set(flag, "1"); return; }
            if (flag.Length > 0) s.Guide.Set("Printer", "프린터", 25f);
            float ready = Time.time + 2.6f;
            var owner = new object();
            it.Add("출력물을 집는다", () => Time.time >= ready && (flag.Length == 0 || !vars.Truthy(flag)), () =>
            {
                it.RemoveOwner(owner);
                s.Audio.Ui("sfx_check", 0.3f);
                var lines = new List<string>();
                foreach (var l in sheet) lines.Add(vars.Format(l));
                if (lines.Count > 0) s.Hud.Monologue(lines);
                if (flag.Length > 0) vars.Set(flag, "1");
            }, 100, owner);
        }

        // ---------- 회의실 프로젝터 ----------
        void Projector(bool on)
        {
            var anchor = w.Anchor("Projector");
            StopLoop("proj");
            if (on && anchor != null) { var src = s.Audio.Loop3D("amb_fan", anchor, 0.25f, 0.5f, 6f); if (src != null) loops["proj"] = src; }
            if (w.ProjectorBeam != null) w.ProjectorBeam.SetActive(on);
        }

        // ---------- 기본 상호작용 (조사, 문) ----------

        static string InspectKey(string id)
        {
            // 브라우저판과 같은 규칙: 창문 → window, 116 모니터는 그대로, 다른 꺼진 모니터 → dead_pc, A11·B23 같은 책상 → desk
            if (id.StartsWith("Window")) return "window";
            if (id == "crt_Desk116") return id;
            if (id.StartsWith("crt_")) return "dead_pc";
            if (id.Length == 3 && (id[0] == 'A' || id[0] == 'B') && char.IsDigit(id[1]) && char.IsDigit(id[2])) return "desk";
            return id;
        }

        void SetupDefaultInteractions()
        {
            foreach (var kv in w.Interactables)
            {
                string id = kv.Key;
                var it = kv.Value;
                if (w.Doors.ContainsKey(id)) continue;
                if (id == "Computer" || id == "PowerStrip") continue;
                string key = InspectKey(id);
                if (!data.Inspects.ContainsKey(key)) continue;
                it.Add("살펴본다", () => true, () => ShowInspect(key), 0, this);
            }

            // 책상 밑 멀티탭: 한 번은 가이드가 말리고, 두 번째에 뽑힌다 → 엔딩 4 (공허)
            if (w.Interactables.TryGetValue("PowerStrip", out var ps))
                ps.Add("멀티탭을 뽑는다", () => gm.Phase == GamePhase.Playing && !s.Story.Ending, () =>
                {
                    if (!vars.Truthy("ps_warned"))
                    {
                        vars.Set("ps_warned", "1");
                        s.Hud.Monologue(new List<string> { "가이드 › 잠깐만요. 그건 건드리지 마세요.", "(책상 밑 멀티탭. 단말기 전원이 여기 꽂혀 있다.)" });
                        return;
                    }
                    s.Story.Begin("end4_seq");
                }, 0, this);

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

                it.Add("문을 연다", () => !door.Locked && door.Amount < 0.5f && !door.Busy && id != "ExitDoor", () =>
                {
                    door.SetOpen(1f, 1.3f);
                    s.Audio.PlayAt("sfx_door_open", door.transform.position + Vector3.up, 0.7f, 0.04f, 14f);
                }, 2, this);
                it.Add("문을 닫는다", () => !door.Locked && door.Amount >= 0.5f && !door.Busy && !s.Chase.Running && id != "StaffDoor" && id != "ExitDoor", () =>
                {
                    door.SetOpen(0f, 1.1f);
                    s.Audio.PlayAt("sfx_door_close", door.transform.position + Vector3.up, 0.7f, 0.04f, 14f);
                }, 2, this);
            }

        }
    }
}
