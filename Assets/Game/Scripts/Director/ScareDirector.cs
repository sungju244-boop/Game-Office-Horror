// 깜짝 연출 (브라우저판 Session.scare / sc* 와 같은 흐름). 모든 깜짝 연출은 3초 예고 뒤에 일어난다:
// 일반 = 3초 조용히 기다림, 겁쟁이 모드 = 오른쪽 아래 카운트다운. 겁쟁이 모드에서는 형체 대신 휴지가 나오고 영상 외침을 낸다.
using System.Collections;
using System.Collections.Generic;
using NightEval.World;
using UnityEngine;

namespace NightEval.Director
{
    public sealed class ScareDirector : MonoBehaviour
    {
        GameManager gm;
        Session s;
        WorldRegistry w;
        int tok;
        bool busy;
        float whisperT = 60f;
        AudioSource whisper; float whisperLeft; float whisperYaw0;
        GameObject handRoot; Dictionary<string, Transform> handJ; Dictionary<string, Quaternion> handRest;
        int voiceN;

        bool Chicken => s.Figures.Chicken;
        bool Standing => !s.Seat.IsSeated && !s.Seat.InTransition;
        bool Alive(int t) => t == tok && gm.Phase == GamePhase.Playing && !s.Story.Ending;

        public void Init(GameManager gm, Session session)
        {
            this.gm = gm; s = session; w = session.World;
            StartCoroutine(LoadHand());
            // 회의실 유리 앞을 처음 지날 때 (유리에 비친 실루엣)
            if (!s.Vars.Truthy("seen_glass")) StartCoroutine(GlassZone());
        }

        IEnumerator GlassZone()
        {
            while (true)
            {
                var p = s.Player.transform.position;
                if (gm.Phase == GamePhase.Playing && p.x >= 6f && p.x <= 12f && p.z >= -4f && p.z <= -1.6f) { s.Vars.Set("seen_glass", "1"); Run("glassFigure"); yield break; }
                yield return new WaitForSeconds(0.2f);
            }
        }

        /// <summary>겁쟁이 모드 목소리: "샨쎈부"(A)와 "랑쓰티치오우"(C)를 부를 때마다 번갈아</summary>
        void TpVoice(float vol) { voiceN++; s.Audio.Play2D(voiceN % 2 == 1 ? "tp_a" : "tp_c", vol); }

        public void Run(string kind)
        {
            if (kind == "blueflash") { s.Vars.Set("sig_blue", "1"); StartCoroutine(BlueFlash()); return; }
            if (kind == "mascotGlitch") { s.Terminal.Glitch(0.5f, 0.3f); s.Audio.Ui("sfx_static_2", 0.2f); return; }
            StartCoroutine(Scare(kind));
        }

        public void Cancel()
        {
            tok++; busy = false;
            s.Hud.Countdown(0);
            s.Figures.Hide("ent"); if (!s.Chase.Running) s.Figures.Hide("sup");
            if (handRoot != null) handRoot.SetActive(false);
        }

        IEnumerator Scare(string kind)
        {
            // 준비 조건 (서 있을 때 / 앉아 있을 때)
            string need = kind == "typing116" || kind == "chairTurn" || kind == "blindsEye" ? "standing" : kind == "hand" || kind == "twitch" ? "seated" : "";
            while (gm.Phase == GamePhase.Playing && !s.Story.Ending && ((need == "standing" && !Standing) || (need == "seated" && !s.Seat.IsSeated))) yield return null;
            while (busy) yield return null;
            int t = ++tok;
            busy = true;
            switch (kind)
            {
                case "twitch": yield return Twitch(t); break;
                case "hand": yield return Hand(t); break;
                case "typing116": yield return Typing116(t); break;
                case "cctvBehind": yield return CctvBehind(t); break;
                case "blindsEye": yield return BlindsEye(t); break;
                case "glassFigure": yield return GlassFigure(t); break;
                case "chairTurn": yield return ChairTurn(t); break;
                case "lightsOut": yield return LightsOut(t); break;
                case "phoneKeys": yield return PhoneKeys(t); break;
                default: Debug.LogWarning("[야간 평가실] 알 수 없는 깜짝 연출: " + kind); break;
            }
            if (t == tok) { busy = false; s.Hud.Countdown(0); }
        }

        /// <summary>3초 예고. 끝까지 살아 있으면 true</summary>
        IEnumerator Arm(int t, System.Action<bool> ok)
        {
            if (Chicken)
                for (int n = 3; n > 0; n--) { if (!Alive(t)) { ok(false); yield break; } s.Hud.Countdown(n); s.Audio.Ui("sfx_tick", 0.4f); yield return new WaitForSeconds(1f); }
            else yield return new WaitForSeconds(3f);
            s.Hud.Countdown(0);
            ok(Alive(t));
        }

        /// <summary>앉은 시점에서 모니터 옆 (각도: 도, 오른쪽 +) 자리</summary>
        bool SeatSpot(float dist, float[] angles, out Vector3 pos, out float yaw)
        {
            var scr = w.LiveScreen; pos = Vector3.zero; yaw = 0f;
            if (scr == null) return false;
            Vector3 n = scr.TransformDirection(Vector3.back); n.y = 0; n.Normalize(); // 화면 → 플레이어
            Vector3 eye = scr.position + n * 0.62f; eye.y = 0;
            foreach (float a in angles)
                foreach (float d in new[] { dist, dist + 0.4f, dist - 0.3f, dist + 0.8f })
                {
                    Vector3 dir = Quaternion.Euler(0, a, 0) * -n;
                    Vector3 p = eye + dir * d;
                    if (Physics.CheckCapsule(p + Vector3.up * 0.35f, p + Vector3.up * 1.6f, 0.3f, Layers.WorldMask, QueryTriggerInteraction.Ignore)) continue;
                    pos = p; yaw = FigureDirector.YawTo(p, eye); return true;
                }
            return false;
        }

        // 프롤로그: 메일을 읽는 동안 모니터 옆 어둠이 한 번 움찔
        IEnumerator Twitch(int t)
        {
            bool ok = false; yield return Arm(t, r => ok = r); if (!ok) yield break;
            if (!SeatSpot(2.1f, new[] { -40f, -34f, -46f, 38f, 44f }, out var p, out var yaw)) yield break;
            s.Figures.Show("ent", p, yaw);
            s.Terminal.Glitch(0.6f, 0.15f);
            if (Chicken) { TpVoice(0.5f); yield return new WaitForSeconds(1f); }
            else { s.Audio.Ui("sfx_static_2", 0.35f); yield return new WaitForSeconds(0.14f); }
            s.Figures.Hide("ent");
        }

        // ---------- 모니터 옆에서 손가락이 책상을 짚는다 (구하지 못한 사람 1명의 전조) ----------
        IEnumerator LoadHand()
        {
            var holder = new GameObject("ScareHand");
            holder.transform.SetParent(w.Root, false);
            GameObject model = null;
            yield return FigureLoader.Load("hand_right", holder.transform, m => model = m);
            if (model == null) { Destroy(holder); yield break; }
            handJ = new Dictionary<string, Transform>(); handRest = new Dictionary<string, Quaternion>();
            foreach (var tr in model.GetComponentsInChildren<Transform>(true)) if (!handJ.ContainsKey(tr.name)) handJ[tr.name] = tr;
            foreach (var f in new[] { "index", "middle", "ring", "pinky" })
            {
                if (!handJ.TryGetValue("wrist", out var par)) break;
                foreach (var sg in new[] { "metacarpal", "phalanx-proximal", "phalanx-intermediate", "phalanx-distal", "tip" })
                    if (handJ.TryGetValue(f + "-finger-" + sg, out var b)) { b.SetParent(par, true); par = b; }
                if (handJ.TryGetValue(f + "-finger-phalanx-proximal", out var pr)) pr.localScale = new Vector3(1f, 1f, 1.5f); // 손가락을 길게
            }
            foreach (var kv in handJ) handRest[kv.Key] = kv.Value.localRotation;
            foreach (var r in model.GetComponentsInChildren<Renderer>()) { foreach (var m in r.materials) m.color = new Color(0.05f, 0.05f, 0.06f); if (r is SkinnedMeshRenderer sm) sm.updateWhenOffscreen = true; }
            // 손끝 = 앞(+z), 손바닥 = 아래 (브라우저판 inner 회전을 옮김)
            // 브라우저판 inner = 오일러 ZYX (π/2, 0, π/2) → x 뒤집기 → 앞 방향 차이(y축 180°) = (-0.5, 0.5, -0.5, 0.5)
            model.transform.localRotation = new Quaternion(-0.5f, 0.5f, -0.5f, 0.5f);
            model.transform.localScale = Vector3.one * 1.25f;
            var pf = new PropFactory(s.Ctx);
            pf.Box(holder.transform, "Arm", new Vector3(0.06f, 0.06f, 0.9f), new Vector3(0, 0.01f, -0.5f), "black");
            handRoot = holder;
            holder.SetActive(false);
        }

        void PoseHand(float curl, float tap)
        {
            if (handJ == null) return;
            foreach (var f in new[] { "index", "middle", "ring", "pinky" })
            {
                float c = curl * (f == "index" ? 1f - tap * 0.9f : 1f);
                Bend(f + "-finger-phalanx-proximal", c * 0.9f - (f == "index" ? tap * 0.5f : 0f));
                Bend(f + "-finger-phalanx-intermediate", c);
                Bend(f + "-finger-phalanx-distal", c * 0.7f);
            }
        }
        void Bend(string n, float a) { if (handJ.TryGetValue(n, out var b)) b.localRotation = handRest[n] * Quaternion.AngleAxis(-a * Mathf.Rad2Deg, Vector3.right); }

        IEnumerator Hand(int t)
        {
            s.Vars.Set("sig_hand", "1");
            bool ok = false; yield return Arm(t, r => ok = r); if (!ok) yield break;
            var scr = w.LiveScreen; if (scr == null) yield break;
            Vector3 n = scr.TransformDirection(Vector3.back); n.y = 0; n.Normalize(); // 화면 → 플레이어
            Vector3 right = Vector3.Cross(Vector3.up, n).normalized * -1f;             // 플레이어 기준 오른쪽
            if (Chicken || handRoot == null)
            {
                if (SeatSpot(1.4f, new[] { -50f, 50f }, out var p, out var yaw)) s.Figures.Show("ent", p, yaw);
                if (Chicken) TpVoice(0.6f);
                yield return new WaitForSeconds(2f); s.Figures.Hide("ent"); yield break;
            }
            s.Terminal.Glitch(0.5f, 0.4f);
            yield return new WaitForSeconds(1.1f); if (!Alive(t)) yield break;
            float deskY = 0.775f;
            Vector3 sp = scr.position;
            Vector3 from = sp - right * 0.3f - n * 0.62f; from.y = deskY + 0.03f;
            Vector3 to = sp - right * 0.31f - n * 0.04f; to.y = deskY + 0.025f;
            handRoot.SetActive(true);
            handRoot.transform.position = from;
            handRoot.transform.rotation = Quaternion.LookRotation(n); // 손끝이 플레이어 쪽
            s.Audio.PlayAt("sfx_whisper", to, 0.35f, 0f, 6f);
            for (float k = 0; k < 1f && Alive(t); k += Time.deltaTime / 1.2f)
            {
                float e = k * k * (3 - 2 * k);
                handRoot.transform.position = Vector3.Lerp(from, to, e);
                PoseHand(Mathf.Min(1f, e * 1.3f), 0f);
                yield return null;
            }
            for (int tap = 0; tap < 2 && Alive(t); tap++)
            {
                for (int k = 0; k <= 8; k++) { PoseHand(1f, Mathf.Sin(k / 8f * Mathf.PI)); yield return new WaitForSeconds(0.03f); }
                s.Audio.PlayAt("sfx_desk_tap", to, 0.8f, 0.05f, 6f);
                yield return new WaitForSeconds(0.35f);
            }
            yield return new WaitForSeconds(0.6f);
            for (float k = 0; k < 1f; k += Time.deltaTime / 0.35f) { handRoot.transform.position = Vector3.Lerp(to, from, k); yield return null; }
            handRoot.SetActive(false);
        }

        // 116 모니터에 혼자 써지는 글자 "117… 도와줘"
        IEnumerator Typing116(int t)
        {
            s.Vars.Set("seen_typing", "1");
            if (!w.Monitors.TryGetValue("Desk116", out var mon)) yield break;
            bool ok = false; yield return Arm(t, r => ok = r); if (!ok) yield break;
            var go = new GameObject("Typing116");
            go.transform.SetParent(mon.Screen.transform, false);
            go.transform.localPosition = new Vector3(0, 0, -0.01f);
            go.transform.localRotation = Quaternion.identity;
            var tm = go.AddComponent<TextMesh>();
            tm.font = Res.Font; tm.fontSize = 64; tm.characterSize = 0.006f; tm.anchor = TextAnchor.MiddleCenter; tm.color = new Color(0.62f, 0.85f, 1f);
            go.GetComponent<MeshRenderer>().sharedMaterial = Res.Font.material;
            if (mon.Glow != null) { mon.Glow.enabled = true; mon.Glow.intensity = 1.2f; }
            Vector3 mp = mon.transform.position + Vector3.up * 1f;
            s.Audio.PlayAt("sfx_crt_on", mp, 0.5f, 0f, 10f);
            string text = L.T("117… 도와줘", "117… help me");
            for (int i = 1; i <= text.Length && Alive(t); i++)
            {
                tm.text = text.Substring(0, i) + "_";
                if (text[i - 1] != ' ' && text[i - 1] != '…') s.Audio.PlayAt("sfx_key", mp, 0.55f, 0.05f, 8f);
                yield return new WaitForSeconds(text[i - 1] == '…' ? 0.9f : 0.22f);
            }
            yield return new WaitForSeconds(4f);
            s.Audio.PlayAt("sfx_static_3", mp, 0.5f, 0f, 10f);
            Destroy(go);
            if (mon.Glow != null) mon.Glow.enabled = false;
        }

        // CCTV 속, 내 바로 뒤에 감독관이 서 있다 (CCTV 화면에만 보인다)
        IEnumerator CctvBehind(int t)
        {
            bool ok = false; yield return Arm(t, r => ok = r); if (!ok) yield break;
            var p = s.Player.transform;
            var f = s.Figures.Show("sup", p.position - p.forward * 1.05f, p.eulerAngles.y, 1.2f, 2);
            if (f == null) yield break;
            s.Audio.Ui("sfx_static_1", 0.25f);
            for (float k = 0; k < 5.5f && Alive(t); k += Time.deltaTime)
            {
                f.Root.transform.position = new Vector3(p.position.x, 0, p.position.z) - p.forward * 1.05f;
                f.Root.transform.rotation = Quaternion.Euler(0, p.eulerAngles.y, 0);
                yield return null;
            }
            if (Chicken) TpVoice(0.5f); else s.Audio.Ui("sfx_static_3", 0.5f);
            yield return new WaitForSeconds(0.2f);
            s.Figures.Hide("sup");
        }

        bool LooksAt(Vector3 pos, float cosMin) { var c = s.Cam.transform; return Vector3.Dot(c.forward, (pos - c.position).normalized) > cosMin; }

        // 구역 A 창문 블라인드 틈의 눈
        IEnumerator BlindsEye(int t)
        {
            bool ok = false; yield return Arm(t, r => ok = r); if (!ok) yield break;
            Transform best = null;
            for (float k = 0; k < 8f && best == null && Alive(t); k += 0.08f)
            {
                foreach (var id in new[] { "Window1", "Window2", "Window3" }) { var a = w.Anchor(id); if (a != null && LooksAt(a.position, 0.86f)) { best = a; break; } }
                yield return new WaitForSeconds(0.08f);
            }
            if (best == null) yield break;
            if (Chicken) { s.Figures.Show("ent", best.position + best.forward * 0.6f, best.eulerAngles.y + 180f); TpVoice(0.5f); yield return new WaitForSeconds(1.6f); s.Figures.Hide("ent"); yield break; }
            var eyes = new GameObject("BlindsEyes");
            eyes.transform.position = best.position + new Vector3(0.25f, 0.12f, 0f);
            eyes.transform.rotation = Quaternion.LookRotation(s.Cam.transform.position - eyes.transform.position);
            var mat = s.Ctx.Own(new Material(Shader.Find("Sprites/Default")) { color = new Color(0.95f, 0.97f, 1f, 1f) });
            foreach (var x in new[] { -0.063f, 0.063f })
            {
                var e = GameObject.CreatePrimitive(PrimitiveType.Quad);
                Destroy(e.GetComponent<Collider>());
                e.transform.SetParent(eyes.transform, false); e.transform.localPosition = new Vector3(x, 0, 0); e.transform.localScale = Vector3.one * 0.06f;
                e.transform.localRotation = Quaternion.Euler(0, 180f, 0);
                e.GetComponent<Renderer>().sharedMaterial = mat;
            }
            s.Audio.PlayAt("sfx_whisper", best.position, 0.45f, 0f, 10f);
            s.Audio.Ui("js_stinger", 0.35f);
            yield return new WaitForSeconds(1.6f);
            Destroy(eyes);
        }

        // 회의실 유리에 비친 실루엣 (유리 너머 안쪽에)
        IEnumerator GlassFigure(int t)
        {
            bool ok = false; yield return Arm(t, r => ok = r); if (!ok) yield break;
            var glass = new Vector3(9.25f, 1.3f, -4.0f);
            for (float k = 0; k < 9f && Alive(t) && !LooksAt(glass, 0.72f); k += 0.08f) yield return new WaitForSeconds(0.08f);
            if (!Alive(t) || !LooksAt(glass, 0.72f)) yield break;
            var p = s.Player.transform.position;
            var pos = new Vector3(Mathf.Clamp(p.x + 0.6f, 6.4f, 11.2f), 0, -6.3f);
            s.Figures.Show("sup", pos, FigureDirector.YawTo(pos, p), 0.7f);
            if (Chicken) TpVoice(0.5f); else s.Audio.Ui("sfx_static_1", 0.35f);
            yield return new WaitForSeconds(1.55f);
            s.Figures.Hide("sup");
        }

        // 116 의자가 혼자 돌아 나를 본다
        IEnumerator ChairTurn(int t)
        {
            if (!w.Chairs.TryGetValue("Desk116", out var ch)) yield break;
            yield return new WaitForSeconds(1.2f);
            bool ok = false; yield return Arm(t, r => ok = r); if (!ok) yield break;
            Quaternion from = ch.rotation;
            Vector3 d = s.Player.transform.position - ch.position; d.y = 0;
            Quaternion to = Quaternion.LookRotation(-d.normalized); // 의자 등받이가 아닌 앉는 쪽이 나를 향함 (의자 앞 = -z)
            s.Audio.PlayAt("sfx_chair", ch.position, 0.8f, 0.03f, 10f);
            for (float k = 0; k < 1f && Alive(t); k += Time.deltaTime / 1.4f) { float e = k * k * (3 - 2 * k); ch.rotation = Quaternion.Slerp(from, to, e); yield return null; }
        }

        // 먼 천장등부터 하나씩 꺼지다 머리 위에서 멈춘다
        IEnumerator LightsOut(int t)
        {
            bool ok = false; yield return Arm(t, r => ok = r); if (!ok) yield break;
            var ls = new List<CeilingLight>();
            foreach (var kv in w.LightGroups) if (kv.Key != "server") ls.AddRange(kv.Value);
            var pp = s.Player.transform.position;
            ls.Sort((a, b) => (b.transform.position - pp).sqrMagnitude.CompareTo((a.transform.position - pp).sqrMagnitude));
            var levels = new List<float>(); foreach (var l in ls) levels.Add(l.Level);
            for (int i = 0; i < ls.Count - 1 && Alive(t); i++)
            {
                ls[i].FadeTo(0f, 0.05f);
                s.Audio.PlayAt("sfx_click", ls[i].transform.position, 0.9f, 0.05f, 30f);
                yield return new WaitForSeconds(Chicken ? 0.15f : 0.42f);
            }
            if (ls.Count > 0) ls[ls.Count - 1].Flicker = true;
            yield return new WaitForSeconds(3f);
            for (int i = 0; i < ls.Count; i++) ls[i].FadeTo(levels[i], 0.4f);
            if (ls.Count > 0) ls[ls.Count - 1].Flicker = false;
            s.Audio.Ui("sfx_crt_on", 0.3f);
        }

        // 사내 전화: 수화기 너머로 지금 내 키보드 소리
        IEnumerator PhoneKeys(int t)
        {
            s.Player.SetControl(false, true);
            s.Audio.Ui("sfx_click", 0.5f);
            yield return new WaitForSeconds(0.6f);
            s.Audio.Play2D(Chicken ? "tp_ac" : "sfx_keyboard_far", 0.7f);
            s.Hud.Monologue(new List<string> { L.T("…수화기 너머로 타자 치는 소리가 들린다.", "…Through the receiver: someone typing."), L.T("지금 내 자리에서 나는 소리 같다.", "It sounds like it's coming from my desk. Right now.") });
            yield return new WaitForSeconds(4.5f);
            s.Audio.Ui("sfx_click", 0.5f);
            if (gm.Phase == GamePhase.Playing && !s.Seat.IsSeated) s.Player.SetControl(true, true);
        }

        IEnumerator BlueFlash()
        {
            while (!s.Seat.IsSeated && gm.Phase == GamePhase.Playing) yield return null;
            yield return new WaitForSeconds(1.2f);
            s.Terminal.Glitch(1f, 0.09f);
            s.Audio.Ui("sfx_static_1", 0.25f);
        }

        // ---------- 등 뒤의 속삭임 (구하지 못한 사람이 생긴 뒤 70~120초마다, 돌아보면 끊긴다) ----------
        void Update()
        {
            if (whisper != null)
            {
                whisperLeft -= Time.deltaTime;
                var p = s.Player.transform;
                bool turned = Mathf.Abs(Mathf.DeltaAngle(p.eulerAngles.y, whisperYaw0)) > 115f;
                if (whisperLeft <= 0f || turned || !Standing) { Destroy(whisper.transform.parent != null ? whisper.transform.parent.gameObject : whisper.gameObject); whisper = null; }
                else whisper.transform.parent.position = p.position - p.forward * 0.7f + Vector3.up * 1.55f;
                return;
            }
            if (s.Vars.GetNum("victims") < 1 || !Standing || s.Chase.Running || s.Story.Ending || busy || gm.Phase != GamePhase.Playing) return;
            whisperT -= Time.deltaTime;
            if (whisperT > 0f) return;
            whisperT = 70f + Random.value * 50f;
            var holder = new GameObject("Whisper").transform;
            holder.SetParent(w.Root, false);
            var pl = s.Player.transform;
            holder.position = pl.position - pl.forward * 0.7f + Vector3.up * 1.55f;
            whisper = s.Audio.Loop3D(Chicken ? "tp_ac" : "sfx_whisper", holder, Chicken ? 0.45f : 0.55f, 0.4f, 5f);
            whisperLeft = 3.4f; whisperYaw0 = pl.eulerAngles.y;
            if (whisper == null) Destroy(holder.gameObject);
        }
    }
}
