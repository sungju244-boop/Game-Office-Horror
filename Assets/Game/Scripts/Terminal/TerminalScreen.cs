using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using NightEval.UI;
using NightEval.World;
using UnityEngine;
using UnityEngine.UI;
using Random = UnityEngine.Random;

namespace NightEval.Terminal
{
    /// <summary>
    /// CRT 모니터 화면. 별도 UI 창 없이 렌더텍스처에 글자를 그려 모니터 메시에 직접 표시한다.
    /// 화면 구성: 머리줄(기록·상태·시각) / 큰 대사 / 큰 선택지 2개.
    /// </summary>
    public sealed class TerminalScreen : MonoBehaviour
    {
        public const int W = 1024, H = 768;
        const int BodyFont = 36, HeaderFont = 24, CenterFont = 48, SubFont = 24;
        const float MarginX = 64f, BodyTop = 96f, BodyBottom = 232f;
        const float BodyWidth = W - MarginX * 2f;
        const float LineGap = 12f;
        const int MaxLines = 60;

        static readonly Color Bg = new Color(0.006f, 0.012f, 0.018f);
        static readonly Color Dim = new Color(0.42f, 0.55f, 0.62f);
        static readonly Color BoxIdleBg = new Color(0.02f, 0.045f, 0.06f, 1f);
        static readonly Color BoxIdleText = new Color(0.78f, 0.9f, 1f);
        static readonly Color BoxHoverBg = new Color(0.78f, 0.92f, 1f, 1f);
        static readonly Color BoxHoverText = new Color(0.02f, 0.04f, 0.06f);
        const string ScrambleChars = "░▒▓█#%&?!*/\\|<>=+";

        public RenderTexture RT { get; private set; }
        public Camera RtCam { get; private set; }
        public bool AcceptInput;
        public float Tension;           // 0~3, 주변 지지직 빈도
        public bool IsChoosing => choiceCb != null && !choiceLocked;

        Font font, bold;
        Material crtMat;
        Light crtLight, crtGlow;
        float crtLightBase, crtGlowBase;
        AudioSource sfx;
        Func<string, AudioClip> clip;

        Text hdrLeft, hdrRight, arrow, centerMain, centerSub;
        RectTransform viewport, content;
        readonly List<Text> lines = new List<Text>();
        readonly List<float> lineY = new List<float>();
        float contentH, scrollUp;

        sealed class ChoiceBox
        {
            public RectTransform Rect;
            public Image Border, Fill;
            public Text Label;
            public TextJitter Jitter;
            public string Text;
            public bool Unsettling;
        }
        readonly ChoiceBox[] boxes = new ChoiceBox[2];
        Action<int> choiceCb;
        bool choiceLocked;
        int hover = -1;
        float hoverScrambleTimer;

        bool clickFlag, skipFlag;
        float glitch, glitchHold, ambientTimer = 8f;
        float power = 1f;
        Coroutine powerAnim;
        static readonly int GlitchId = Shader.PropertyToID("_Glitch");
        static readonly int PowerId = Shader.PropertyToID("_Power");

        // ---------- 준비 ----------

        public void Init(BuildContext ctx, Renderer screen, Light light, Light glow, Func<string, AudioClip> clipSource)
        {
            font = Res.Font;
            bold = Res.Bold;
            clip = clipSource;
            crtLight = light;
            crtGlow = glow;
            crtLightBase = light != null ? light.intensity : 0f;
            crtGlowBase = glow != null ? glow.intensity : 0f;

            RT = ctx.Own(new RenderTexture(W, H, 16, RenderTextureFormat.ARGB32) { name = "TerminalRT", filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp });
            RT.Create();

            var camGo = new GameObject("TerminalCamera");
            camGo.transform.SetParent(transform, false);
            camGo.transform.localPosition = new Vector3(0, 0, -10f);
            RtCam = camGo.AddComponent<Camera>();
            RtCam.orthographic = true;
            RtCam.orthographicSize = 5f;
            RtCam.clearFlags = CameraClearFlags.SolidColor;
            RtCam.backgroundColor = Bg;
            RtCam.cullingMask = 1 << Layers.Terminal;
            RtCam.targetTexture = RT;
            RtCam.nearClipPlane = 0.1f;
            RtCam.farClipPlane = 50f;
            RtCam.depth = -20;
            RtCam.allowHDR = false;
            RtCam.allowMSAA = false;

            var canvasGo = new GameObject("TerminalCanvas", typeof(RectTransform));
            canvasGo.layer = Layers.Terminal;
            canvasGo.transform.SetParent(transform, false);
            var canvas = canvasGo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceCamera;
            canvas.worldCamera = RtCam;
            canvas.planeDistance = 5f;
            var scaler = canvasGo.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ConstantPixelSize;
            scaler.scaleFactor = 1f;
            BuildLayout(canvasGo.transform);
            PropFactory.SetLayer(canvasGo, Layers.Terminal);

            crtMat = ctx.Mats.NewCrt(RT, new Color(0.8f, 0.92f, 1f), 1.35f, 1f);
            if (screen != null) screen.sharedMaterial = crtMat;

            sfx = gameObject.AddComponent<AudioSource>();
            sfx.playOnAwake = false;
            sfx.spatialBlend = 1f;
            sfx.minDistance = 0.6f;
            sfx.maxDistance = 9f;
            sfx.rolloffMode = AudioRolloffMode.Linear;
            if (screen != null)
            {
                // 소리는 실제 모니터 위치에서 나도록 별도 오브젝트에
                var src = new GameObject("TerminalAudio");
                src.transform.SetParent(screen.transform, false);
                Destroy(sfx);
                sfx = src.AddComponent<AudioSource>();
                sfx.playOnAwake = false;
                sfx.spatialBlend = 0.85f;
                sfx.minDistance = 0.6f;
                sfx.maxDistance = 9f;
                sfx.rolloffMode = AudioRolloffMode.Linear;
            }
        }

        void BuildLayout(Transform root)
        {
            var rootRt = (RectTransform)root;
            hdrLeft = UIKit.Label(UIKit.Fixed(rootRt, "HeaderLeft", new Vector2(0, 1), new Vector2(0, 1), new Vector2(MarginX, -30f), new Vector2(760f, 40f)), "", font, HeaderFont, Dim, TextAnchor.UpperLeft);
            hdrLeft.horizontalOverflow = HorizontalWrapMode.Overflow;
            hdrRight = UIKit.Label(UIKit.Fixed(rootRt, "HeaderRight", new Vector2(1, 1), new Vector2(1, 1), new Vector2(-MarginX, -30f), new Vector2(200f, 40f)), "", font, HeaderFont, Dim, TextAnchor.UpperRight);
            var rule = UIKit.Fixed(rootRt, "Rule", new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -70f), new Vector2(BodyWidth, 2f));
            UIKit.Panel(rule, new Color(0.25f, 0.34f, 0.4f, 1f));

            viewport = UIKit.Rect(rootRt, "Viewport", Vector2.zero, Vector2.one, new Vector2(MarginX, BodyBottom), new Vector2(-MarginX, -BodyTop));
            viewport.gameObject.AddComponent<RectMask2D>();
            content = UIKit.Fixed(viewport, "Content", new Vector2(0, 1), new Vector2(0, 1), Vector2.zero, new Vector2(BodyWidth, 10f));

            arrow = UIKit.Label(UIKit.Fixed(rootRt, "Arrow", new Vector2(1, 0), new Vector2(1, 0), new Vector2(-MarginX, BodyBottom - 44f), new Vector2(60f, 40f)), "▼", font, HeaderFont, BoxIdleText, TextAnchor.MiddleRight);
            arrow.enabled = false;

            var center = UIKit.Fixed(rootRt, "Center", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0, 40f), new Vector2(BodyWidth, 200f));
            centerMain = UIKit.Label(center, "", bold, CenterFont, BoxIdleText, TextAnchor.MiddleCenter);
            centerSub = UIKit.Label(UIKit.Fixed(rootRt, "CenterSub", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0, -90f), new Vector2(BodyWidth, 90f)), "", font, SubFont, Dim, TextAnchor.UpperCenter);

            for (int i = 0; i < 2; i++)
            {
                var box = new ChoiceBox();
                float x = (i == 0 ? -1f : 1f) * 232f;
                box.Rect = UIKit.Fixed(rootRt, "Choice" + i, new Vector2(0.5f, 0), new Vector2(0.5f, 0.5f), new Vector2(x, 112f), new Vector2(432f, 136f));
                box.Border = UIKit.Panel(box.Rect, new Color(0.62f, 0.8f, 0.92f, 1f));
                var inner = UIKit.Rect(box.Rect, "Inner", Vector2.zero, Vector2.one, new Vector2(4, 4), new Vector2(-4, -4));
                box.Fill = UIKit.Panel(inner, BoxIdleBg);
                var lbl = UIKit.Rect(inner, "Label", Vector2.zero, Vector2.one, new Vector2(14, 8), new Vector2(-14, -8));
                box.Label = UIKit.Label(lbl, "", bold, 48, BoxIdleText, TextAnchor.MiddleCenter);
                box.Label.lineSpacing = 1f;
                box.Label.resizeTextForBestFit = true;
                box.Label.resizeTextMinSize = 28;
                box.Label.resizeTextMaxSize = 48;
                box.Label.verticalOverflow = VerticalWrapMode.Truncate;
                box.Jitter = box.Label.gameObject.AddComponent<TextJitter>();
                box.Rect.gameObject.SetActive(false);
                boxes[i] = box;
            }
        }

        // ---------- 화면 내용 ----------

        public void SetHeader(string record, string status, string clock)
        {
            string left = record ?? "";
            if (!string.IsNullOrEmpty(status)) left += "  ·  " + status;
            hdrLeft.text = left;
            SetClock(clock);
        }

        public void SetClock(string clock)
        {
            hdrRight.text = string.IsNullOrEmpty(clock) ? "" : clock;
        }

        public void ClearBody()
        {
            foreach (var t in lines) if (t != null) Destroy(t.gameObject);
            lines.Clear();
            lineY.Clear();
            contentH = 0f;
            scrollUp = 0f;
            content.anchoredPosition = Vector2.zero;
            arrow.enabled = false;
            HideCenter();
        }

        public void ShowCenter(string main, string sub)
        {
            centerMain.text = main ?? "";
            centerSub.text = sub ?? "";
            centerMain.enabled = centerSub.enabled = true;
        }

        public void HideCenter()
        {
            centerMain.text = centerSub.text = "";
        }

        public static string Prefix(string who)
        {
            switch (who)
            {
                case "user": return "<color=#8ea4b6>사용자 › </color>";
                case "ai": return "<color=#7fd8ff>AI › </color>";
                case "corp": return "<color=#e0b468>[회사] </color>";
                case "me": return "<color=#a9dca0>평가자 117 › </color>";
                default: return "<color=#6d8494>[시스템] </color>";
            }
        }

        static string BodyColor(string who)
        {
            switch (who)
            {
                case "user": return "#dce8f2";
                case "ai": return "#c9f1ff";
                case "corp": return "#ecd7aa";
                case "me": return "#e0f5da";
                default: return "#a4b8c6";
            }
        }

        Text NewLine()
        {
            if (lines.Count >= MaxLines)
            {
                Destroy(lines[0].gameObject);
                lines.RemoveAt(0);
                float shift = lineY.Count > 1 ? lineY[1] : 0f;
                lineY.RemoveAt(0);
                for (int i = 0; i < lineY.Count; i++)
                {
                    lineY[i] -= shift;
                    ((RectTransform)lines[i].transform).anchoredPosition = new Vector2(0, -lineY[i]);
                }
                contentH -= shift;
            }
            float y = lines.Count == 0 ? 0f : contentH + LineGap;
            var rt = UIKit.Fixed(content, "Line", new Vector2(0, 1), new Vector2(0, 1), new Vector2(0, -y), new Vector2(BodyWidth, 44f));
            rt.gameObject.layer = Layers.Terminal;
            var t = UIKit.Label(rt, "", font, BodyFont, Color.white, TextAnchor.UpperLeft);
            rt.gameObject.AddComponent<TextJitter>();
            lines.Add(t);
            lineY.Add(y);
            return t;
        }

        float PreferredHeight(Text t)
        {
            var settings = t.GetGenerationSettings(new Vector2(BodyWidth, 0f));
            float h = t.cachedTextGeneratorForLayout.GetPreferredHeight(t.text, settings);
            return Mathf.Max(BodyFont * 1.2f, h);
        }

        void Relayout(Text t)
        {
            int i = lines.IndexOf(t);
            if (i < 0) return;
            float h = PreferredHeight(t);
            var rt = (RectTransform)t.transform;
            rt.sizeDelta = new Vector2(BodyWidth, h);
            contentH = lineY[i] + h;
            content.sizeDelta = new Vector2(BodyWidth, contentH);
            ApplyScroll();
        }

        float ViewportHeight => H - BodyTop - BodyBottom;

        void ApplyScroll()
        {
            float maxScroll = Mathf.Max(0f, contentH - ViewportHeight);
            scrollUp = Mathf.Clamp(scrollUp, 0f, maxScroll);
            content.anchoredPosition = new Vector2(0f, maxScroll - scrollUp);
        }

        public void Scroll(float wheel)
        {
            if (Mathf.Abs(wheel) < 0.01f) return;
            scrollUp += wheel * 60f;
            ApplyScroll();
        }

        /// <summary>대사 한 줄을 타자기처럼 출력하고, 클릭(또는 Space)을 기다린다.</summary>
        public IEnumerator ShowLine(string who, string text, float glitchLevel)
        {
            HideCenter();
            scrollUp = 0f;
            var t = NewLine();
            string prefix = Prefix(who);
            string open = "<color=" + BodyColor(who) + ">";
            const string close = "</color>";
            var jitter = t.GetComponent<TextJitter>();
            clickFlag = skipFlag = false;

            float cps = 30f;
            float acc = 0f;
            int n = 0;
            int blip = 0;
            float scrambleTimer = 0f;
            string shown = "";
            while (n < text.Length)
            {
                if (skipFlag) { n = text.Length; break; }
                acc += Time.deltaTime * cps;
                while (acc >= 1f && n < text.Length)
                {
                    acc -= 1f;
                    n++;
                    if (!char.IsWhiteSpace(text[n - 1]) && (blip++ % 2 == 0)) PlaySfx("sfx_blip", 0.18f, 0.12f);
                }
                scrambleTimer -= Time.deltaTime;
                if (scrambleTimer <= 0f || shown.Length != n)
                {
                    scrambleTimer = 0.05f;
                    shown = glitchLevel > 0.01f ? Scramble(text.Substring(0, n), glitchLevel * 0.35f) : text.Substring(0, n);
                    t.text = prefix + open + Escape(shown) + close;
                    Relayout(t);
                }
                if (glitchLevel > 0.01f) jitter.Amount = glitchLevel * 4f;
                yield return null;
            }
            t.text = prefix + open + Escape(text) + close;
            Relayout(t);
            if (glitchLevel > 0.01f)
            {
                Glitch(Mathf.Clamp01(glitchLevel), 0.25f + glitchLevel * 0.5f);
                if (glitchLevel >= 0.3f) PlaySfx("sfx_static_" + Random.Range(1, 4), 0.35f + glitchLevel * 0.3f, 0.05f);
                // 잠깐 깨진 뒤 제자리로
                float settle = 0.5f;
                while (settle > 0f)
                {
                    settle -= Time.deltaTime;
                    t.text = prefix + open + Escape(Scramble(text, glitchLevel * 0.3f * settle)) + close;
                    jitter.Amount = glitchLevel * 5f * settle + glitchLevel * 0.8f;
                    yield return null;
                }
                t.text = prefix + open + Escape(text) + close;
                jitter.Amount = glitchLevel >= 0.4f ? 0.9f : 0f; // 깊게 깨진 줄은 계속 미세하게 떨린다
            }
            yield return WaitClick();
        }

        public IEnumerator WaitClick()
        {
            clickFlag = skipFlag = false;
            arrow.enabled = true;
            float blink = 0f;
            while (!clickFlag)
            {
                blink += Time.deltaTime;
                arrow.color = new Color(BoxIdleText.r, BoxIdleText.g, BoxIdleText.b, (Mathf.Sin(blink * 5f) > 0f) ? 1f : 0.15f);
                yield return null;
            }
            arrow.enabled = false;
            clickFlag = false;
            PlaySfx("sfx_click", 0.3f, 0.05f);
        }

        static string Escape(string s)
        {
            // 서식 태그로 해석되지 않도록 < 를 비슷한 글자로 바꾼다
            return s.IndexOf('<') >= 0 ? s.Replace("<", "‹") : s;
        }

        static string Scramble(string s, float amount)
        {
            if (amount <= 0.001f || string.IsNullOrEmpty(s)) return s;
            var sb = new StringBuilder(s.Length);
            foreach (char c in s)
            {
                if (char.IsWhiteSpace(c) || Random.value > amount) { sb.Append(c); continue; }
                if (Random.value < 0.6f) sb.Append(ScrambleChars[Random.Range(0, ScrambleChars.Length)]);
                else sb.Append((char)Random.Range(0xAC00, 0xD7A4));
            }
            return sb.ToString();
        }

        // ---------- 선택지 ----------

        public void ShowChoices(IList<string> labels, IList<bool> unsettling, Action<int> onPick)
        {
            arrow.enabled = false;
            choiceCb = onPick;
            choiceLocked = false;
            hover = -1;
            for (int i = 0; i < boxes.Length; i++)
            {
                var b = boxes[i];
                bool on = i < labels.Count;
                b.Rect.gameObject.SetActive(on);
                if (!on) continue;
                b.Text = labels[i];
                b.Unsettling = unsettling != null && i < unsettling.Count && unsettling[i];
                b.Label.text = b.Text;
                SetBoxStyle(b, false, 1f);
            }
            PlaySfx("sfx_beep", 0.35f, 0f);
        }

        public void HideChoices()
        {
            foreach (var b in boxes) b.Rect.gameObject.SetActive(false);
            choiceCb = null;
            hover = -1;
        }

        void SetBoxStyle(ChoiceBox b, bool hot, float alpha)
        {
            Color bg = hot ? BoxHoverBg : BoxIdleBg;
            Color tx = hot ? BoxHoverText : BoxIdleText;
            if (hot && b.Unsettling) bg = new Color(0.95f, 0.82f, 0.82f, 1f);
            bg.a *= alpha;
            tx.a *= alpha;
            b.Fill.color = bg;
            b.Label.color = tx;
            var bc = b.Border.color;
            bc.a = alpha;
            b.Border.color = bc;
        }

        int HitBox(Vector2? rtPoint)
        {
            if (!rtPoint.HasValue) return -1;
            for (int i = 0; i < boxes.Length; i++)
            {
                var b = boxes[i];
                if (!b.Rect.gameObject.activeSelf) continue;
                if (RectTransformUtility.RectangleContainsScreenPoint(b.Rect, rtPoint.Value, RtCam)) return i;
            }
            return -1;
        }

        public void UpdatePointer(Vector2? rtPoint)
        {
            if (choiceCb == null || choiceLocked) return;
            int h = HitBox(rtPoint);
            if (h != hover)
            {
                if (hover >= 0) { SetBoxStyle(boxes[hover], false, 1f); boxes[hover].Label.text = boxes[hover].Text; boxes[hover].Jitter.Amount = 0f; }
                hover = h;
                if (hover >= 0)
                {
                    SetBoxStyle(boxes[hover], true, 1f);
                    PlaySfx(boxes[hover].Unsettling ? "sfx_static_1" : "sfx_ui_hover", boxes[hover].Unsettling ? 0.18f : 0.3f, 0.05f);
                }
            }
            if (hover >= 0 && boxes[hover].Unsettling)
            {
                var b = boxes[hover];
                b.Jitter.Amount = 3f;
                hoverScrambleTimer -= Time.deltaTime;
                if (hoverScrambleTimer <= 0f)
                {
                    hoverScrambleTimer = Random.Range(0.06f, 0.2f);
                    b.Label.text = Random.value < 0.45f ? Scramble(b.Text, 0.25f) : b.Text;
                    if (Random.value < 0.2f) Glitch(0.18f, 0.08f);
                }
            }
        }

        /// <summary>클릭/Space. rtPoint 가 선택지 위면 선택, 아니면 대사 넘김.</summary>
        public void Click(Vector2? rtPoint)
        {
            if (!AcceptInput) return;
            if (choiceCb != null)
            {
                if (choiceLocked) return;
                int h = HitBox(rtPoint);
                if (h >= 0) StartCoroutine(Pick(h));
                return;
            }
            if (arrow.enabled) clickFlag = true;
            else skipFlag = true;
        }

        IEnumerator Pick(int index)
        {
            choiceLocked = true; // 중복 입력 방지
            var cb = choiceCb;
            var b = boxes[index];
            PlaySfx("sfx_ui_select", 0.45f, 0f);
            for (int i = 0; i < boxes.Length; i++)
                if (i != index && boxes[i].Rect.gameObject.activeSelf) SetBoxStyle(boxes[i], false, 0.25f);
            if (b.Unsettling)
            {
                Glitch(0.85f, 0.7f);
                PlaySfx("sfx_static_" + Random.Range(1, 4), 0.6f, 0.05f);
            }
            for (int k = 0; k < 6; k++)
            {
                SetBoxStyle(b, k % 2 == 0, 1f);
                b.Label.text = b.Unsettling && k < 4 ? Scramble(b.Text, 0.5f) : b.Text;
                b.Jitter.Amount = b.Unsettling ? 6f : 0f;
                yield return new WaitForSeconds(0.08f);
            }
            b.Jitter.Amount = 0f;
            yield return new WaitForSeconds(0.15f);
            HideChoices();
            cb?.Invoke(index);
        }

        // ---------- 지지직·전원 ----------

        public void Glitch(float amount, float time)
        {
            glitch = Mathf.Max(glitch, Mathf.Clamp01(amount));
            glitchHold = Mathf.Max(glitchHold, time);
        }

        public void SetPower(float target, float time)
        {
            if (powerAnim != null) StopCoroutine(powerAnim);
            powerAnim = StartCoroutine(PowerRoutine(Mathf.Clamp01(target), time));
            PlaySfx(target < power ? "sfx_crt_off" : "sfx_crt_on", 0.5f, 0f);
        }

        IEnumerator PowerRoutine(float target, float time)
        {
            float start = power;
            float t = 0f;
            while (t < 1f)
            {
                t += Time.deltaTime / Mathf.Max(0.01f, time);
                power = Mathf.Lerp(start, target, Mathf.Clamp01(t));
                yield return null;
            }
            powerAnim = null;
        }

        public void PlaySfx(string name, float volume, float pitchJitter)
        {
            if (sfx == null || clip == null) return;
            var c = clip(name);
            if (c == null) return;
            sfx.pitch = 1f + Random.Range(-pitchJitter, pitchJitter);
            sfx.PlayOneShot(c, volume);
        }

        void Update()
        {
            float dt = Time.deltaTime;
            if (glitchHold > 0f) glitchHold -= dt;
            else glitch = Mathf.MoveTowards(glitch, Tension * 0.02f, dt * 2.2f);

            ambientTimer -= dt;
            if (ambientTimer <= 0f)
            {
                ambientTimer = Random.Range(7f, 20f) / (1f + Tension * 0.6f);
                if (power > 0.5f)
                {
                    Glitch(Random.Range(0.12f, 0.3f) + Tension * 0.05f, Random.Range(0.06f, 0.18f));
                    if (Tension >= 1f && Random.value < 0.5f) PlaySfx("sfx_static_" + Random.Range(1, 4), 0.12f, 0.1f);
                }
            }

            if (crtMat != null)
            {
                crtMat.SetFloat(GlitchId, glitch);
                crtMat.SetFloat(PowerId, power);
            }
            float flick = 1f - glitch * Random.Range(0f, 0.55f);
            if (crtLight != null) crtLight.intensity = crtLightBase * power * flick;
            if (crtGlow != null) crtGlow.intensity = crtGlowBase * power * flick;
        }

        /// <summary>CRT 셰이더와 같은 곡률 (마우스 위치 → 실제로 보이는 화면 좌표).</summary>
        public static Vector2 CrtCurve(Vector2 uv, float k = 0.06f)
        {
            Vector2 c = uv * 2f - Vector2.one;
            c *= 1f + k * c.sqrMagnitude;
            return c * 0.5f + new Vector2(0.5f, 0.5f);
        }
    }

    /// <summary>글자를 한 글자씩 무작위로 흔든다 (지지직).</summary>
    public sealed class TextJitter : BaseMeshEffect
    {
        public float Amount;
        static readonly List<UIVertex> Verts = new List<UIVertex>();

        public override void ModifyMesh(VertexHelper vh)
        {
            if (!IsActive() || Amount <= 0.01f) return;
            Verts.Clear();
            vh.GetUIVertexStream(Verts);
            for (int i = 0; i + 5 < Verts.Count; i += 6)
            {
                if (Random.value > 0.4f) continue;
                var off = new Vector3(Random.Range(-Amount, Amount), Random.Range(-Amount, Amount) * 0.6f, 0f);
                for (int j = 0; j < 6; j++)
                {
                    var v = Verts[i + j];
                    v.position += off;
                    Verts[i + j] = v;
                }
            }
            vh.Clear();
            vh.AddUIVertexTriangleStream(Verts);
        }

        void Update()
        {
            if (Amount > 0.01f && graphic != null) graphic.SetVerticesDirty();
        }
    }
}
