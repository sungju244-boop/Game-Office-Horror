// 단말기 화면 확장 (story v2): 장 제목 카드, 숨은 주석, 화면 균열, 경로 추적 미로, 가이드가 대신 누르는 선택지.
// 브라우저판 web/js/terminal.js · maze.js 와 같은 화면 구성을 목표로 한다.
using System;
using System.Collections;
using System.Collections.Generic;
using NightEval.Story;
using NightEval.UI;
using NightEval.World;
using UnityEngine;
using UnityEngine.UI;
using Random = UnityEngine.Random;

namespace NightEval.Terminal
{
    public sealed partial class TerminalScreen
    {
        // ---------- 장 제목 카드 ----------
        bool cardActive;

        /// <summary>CRT 부팅 화면에 장 제목 카드("01:00 · 상승 ① · 겨울 코트")를 띄웠다가 지운다.</summary>
        public IEnumerator ShowCard(string time, string label, string title, float dur = 2.8f)
        {
            cardActive = true;
            ClearBody();
            HideChoices();
            Glitch(0.6f, 0.3f);
            PlaySfx("sfx_chapter", 0.6f, 0f);
            ShowCenter(time, label + "  ·  " + title);
            float t = 0f;
            while (t < dur) { t += Time.deltaTime; yield return null; }
            Glitch(0.4f, 0.2f);
            HideCenter();
            cardActive = false;
        }

        // ---------- 가이드가 대신 누름 ----------
        public void DemoPick(int index)
        {
            if (choiceCb == null || choiceLocked || index < 0 || index >= boxes.Length || !boxes[index].Rect.gameObject.activeSelf) return;
            StartCoroutine(Pick(index));
        }

        // ---------- 숨은 주석: 화면 아래 빈 곳을 커서로 문지르면 드러난다 ----------
        Text hiddenText;
        float hiddenReveal;
        bool hiddenFound;
        Vector2 lastHiddenPt;
        public Action OnHiddenFound;

        public void SetHidden(string text)
        {
            EnsureExtras();
            hiddenText.text = text ?? "";
            hiddenReveal = 0f; hiddenFound = false;
            hiddenText.color = new Color(0.62f, 0.8f, 0.86f, 0f);
        }

        void HiddenPointer(Vector2 p)
        {
            if (hiddenText == null || string.IsNullOrEmpty(hiddenText.text) || choiceCb != null) { lastHiddenPt = p; return; }
            // 아래쪽 빈 곳(선택지 자리)에서 움직일수록 드러난다
            if (p.y < BodyBottom && p.y > 20f)
            {
                hiddenReveal = Mathf.Clamp01(hiddenReveal + (p - lastHiddenPt).magnitude / 2400f);
                if (!hiddenFound && hiddenReveal > 0.85f) { hiddenFound = true; PlaySfx("sfx_static_2", 0.2f, 0.05f); OnHiddenFound?.Invoke(); }
            }
            lastHiddenPt = p;
        }

        // ---------- 화면 균열 (밤새 누적, 0~3) ----------
        RawImage crackImg;
        int crackLevel;

        public void SetCrack(int level)
        {
            EnsureExtras();
            level = Mathf.Clamp(level, 0, 3);
            if (level == crackLevel) return;
            crackLevel = level;
            crackImg.enabled = level > 0;
            if (level > 0) crackImg.texture = MakeCrackTexture(level);
            Glitch(0.9f, 0.3f);
        }

        Texture2D MakeCrackTexture(int level)
        {
            const int w = 512, h = 384;
            var tex = new Texture2D(w, h, TextureFormat.RGBA32, false) { filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp };
            var px = new Color32[w * h];
            var rng = new System.Random(117 + level * 31);
            // 맞은 자리에서 사방으로 갈라지는 금 (단계마다 더 많이)
            for (int c = 0; c < level; c++)
            {
                float cx = 120 + rng.Next(280), cy = 90 + rng.Next(200);
                int arms = 6 + level * 3;
                for (int a = 0; a < arms; a++)
                {
                    float ang = (float)(rng.NextDouble() * Math.PI * 2), x = cx, y = cy, len = 60 + rng.Next(160 + level * 40);
                    for (float d = 0; d < len; d += 1f)
                    {
                        ang += (float)(rng.NextDouble() - 0.5) * 0.18f;
                        x += Mathf.Cos(ang); y += Mathf.Sin(ang);
                        int ix = (int)x, iy = (int)y;
                        if (ix < 1 || iy < 1 || ix >= w - 1 || iy >= h - 1) break;
                        byte al = (byte)(220 - d / len * 120);
                        px[iy * w + ix] = new Color32(230, 245, 255, al);
                        px[iy * w + ix + 1] = new Color32(20, 30, 40, (byte)(al / 2));
                    }
                }
            }
            tex.SetPixels32(px); tex.Apply(false);
            return tex;
        }

        // ---------- 경로 추적 미로 ----------
        MazeState maze;
        RawImage mazeImg;
        Texture2D mazeTex;
        Color32[] mazePx;
        Text mazePreviewTitle, mazePreviewBody, mazeStatus, mazeBubble, mazeTimeout;
        readonly List<Text> goalLabels = new List<Text>();
        public Func<string> MazeStatusText;
        public string MazeLabelStart = L.T("▶ 출발점을 클릭해 시작", "▶ Click the start point to begin. Hover a target to preview what it sends."), MazeLabelGoal = L.T("민트색 길을 따라가 도착점의 코드를 클릭", "Follow the mint path to a target and click it. Touch the black and you restart."), MazeLabelClick = L.T("클릭: 실행", "Click: execute"),
            MazeLabelTimeout = L.T("시간 초과", "CONNECTION LOST"), MazeLabelHidden = "???", MazeLabelDone = L.T("보정 완료", "Calibrate the intervention console");
        public string PreviewSubtle = "", PreviewDirect = "";
        public bool InMaze => maze != null;
        public MazeState Maze => maze;

        /// <summary>미로를 끝까지 진행하고 결과(subtle/direct/timeout/done/broken)를 돌려준다.</summary>
        public IEnumerator RunMaze(MazeState m, Action<string> onResult)
        {
            EnsureExtras();
            ClearBody(); HideChoices();
            maze = m;
            maze.Measure(MeasureBold24);
            BuildGoalLabels();
            mazeImg.enabled = true;
            SetMazeTextsVisible(true);
            string result = null;
            while (true)
            {
                maze.Update(Time.deltaTime);
                DrawMaze();
                if (maze.Result != null)
                {
                    float hold = maze.ResultDelay;
                    while (hold > 0) { hold -= Time.deltaTime; maze.Update(Time.deltaTime); DrawMaze(); yield return null; }
                    result = maze.Result;
                    break;
                }
                yield return null;
            }
            maze = null;
            mazeImg.enabled = false;
            SetMazeTextsVisible(false);
            foreach (var t in goalLabels) Destroy(t.gameObject);
            goalLabels.Clear();
            onResult?.Invoke(result);
        }

        void MazePointer(Vector2? rtPoint)
        {
            if (maze == null || !rtPoint.HasValue) return;
            var p = rtPoint.Value;
            maze.MoveTo(p.x, H - p.y); // 단말기 좌표: 아래가 0 → 미로 좌표: 위가 0
        }

        float MeasureBold24(string s)
        {
            if (bold == null) return s.Length * 13.5f;
            bold.RequestCharactersInTexture(s, 24, FontStyle.Normal);
            float w = 0;
            foreach (char c in s) if (bold.GetCharacterInfo(c, out var ci, 24, FontStyle.Normal)) w += ci.advance;
            return w;
        }

        void EnsureExtras()
        {
            if (mazeImg != null) return;
            var root = (RectTransform)hdrLeft.transform.parent;
            // 미로 그림은 맨 뒤 (머리줄 글자는 위에 보이게)
            mazeTex = new Texture2D(W, H, TextureFormat.RGBA32, false) { filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Clamp, name = "MazeTex" };
            mazePx = new Color32[W * H];
            var mrt = UIKit.Rect(root, "Maze", Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            mazeImg = mrt.gameObject.AddComponent<RawImage>();
            mazeImg.texture = mazeTex; mazeImg.raycastTarget = false; mazeImg.enabled = false;
            mrt.SetAsFirstSibling();
            mazePreviewTitle = MazeText(root, 84, 640 + 10, 856, 26, 18, new Color(0.5f, 0.96f, 0.85f), TextAnchor.UpperLeft);
            mazePreviewBody = MazeText(root, 84, 640 + 36, 856, 56, 22, new Color(0.91f, 1f, 0.98f), TextAnchor.UpperLeft);
            mazeStatus = MazeText(root, 84, 640 + 50, 856, 30, 22, new Color(0.53f, 0.66f, 0.63f), TextAnchor.UpperLeft);
            mazeBubble = MazeText(root, 82, 96 + 22, 860, 40, 26, new Color(1f, 0.91f, 0.69f), TextAnchor.UpperCenter);
            mazeBubble.font = bold;
            mazeTimeout = MazeText(root, 0, 96 + 250, 1024, 60, 44, new Color(1f, 0.48f, 0.42f), TextAnchor.MiddleCenter);
            mazeTimeout.font = bold;
            SetMazeTextsVisible(false);
            // 숨은 주석 (아래 빈 곳)
            hiddenText = MazeText(root, 64, H - BodyBottom + 60, BodyWidth, 80, 24, new Color(0.62f, 0.8f, 0.86f, 0f), TextAnchor.MiddleCenter);
            hiddenText.text = "";
            // 균열 (맨 위)
            var crt = UIKit.Rect(root, "Crack", Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            crackImg = crt.gameObject.AddComponent<RawImage>(); crackImg.raycastTarget = false; crackImg.enabled = false;
            PropFactory.SetLayer(root.gameObject, Layers.Terminal);
        }

        /// <summary>미로 좌표(위가 0)로 글자 칸을 만든다</summary>
        Text MazeText(RectTransform root, float x, float yTop, float w, float h, int size, Color col, TextAnchor anchor)
        {
            var rt = UIKit.Fixed(root, "MazeText", new Vector2(0, 1), new Vector2(0, 1), new Vector2(x, -yTop), new Vector2(w, h));
            var t = UIKit.Label(rt, "", font, size, col, anchor);
            t.raycastTarget = false;
            return t;
        }

        void SetMazeTextsVisible(bool on)
        {
            foreach (var t in new[] { mazePreviewTitle, mazePreviewBody, mazeStatus, mazeBubble, mazeTimeout }) if (t != null) t.enabled = on;
        }

        void BuildGoalLabels()
        {
            var root = (RectTransform)hdrLeft.transform.parent;
            foreach (var g in maze.Goals)
            {
                var t = MazeText(root, g.Rect.X, g.Rect.Y, g.Rect.W, g.Rect.H, 24, new Color(0.79f, 1f, 0.94f), TextAnchor.MiddleCenter);
                t.font = bold; t.text = g.Def.Code;
                goalLabels.Add(t);
            }
            PropFactory.SetLayer(root.gameObject, Layers.Terminal);
        }

        // 픽셀 그리기 (미로 좌표 = 위가 0 → 텍스처는 아래가 0)
        void Fill(float x, float y, float w, float h, Color32 c)
        {
            int x0 = Mathf.Max(0, Mathf.FloorToInt(x)), x1 = Mathf.Min(W, Mathf.CeilToInt(x + w));
            int y0 = Mathf.Max(0, Mathf.FloorToInt(y)), y1 = Mathf.Min(H, Mathf.CeilToInt(y + h));
            for (int yy = y0; yy < y1; yy++)
            {
                int row = (H - 1 - yy) * W;
                for (int xx = x0; xx < x1; xx++) mazePx[row + xx] = c;
            }
        }
        void Blend(float x, float y, float w, float h, Color32 c)
        {
            int x0 = Mathf.Max(0, Mathf.FloorToInt(x)), x1 = Mathf.Min(W, Mathf.CeilToInt(x + w));
            int y0 = Mathf.Max(0, Mathf.FloorToInt(y)), y1 = Mathf.Min(H, Mathf.CeilToInt(y + h));
            float a = c.a / 255f;
            for (int yy = y0; yy < y1; yy++)
            {
                int row = (H - 1 - yy) * W;
                for (int xx = x0; xx < x1; xx++)
                {
                    var d = mazePx[row + xx];
                    mazePx[row + xx] = new Color32((byte)(d.r + (c.r - d.r) * a), (byte)(d.g + (c.g - d.g) * a), (byte)(d.b + (c.b - d.b) * a), (byte)Mathf.Max(d.a, c.a));
                }
            }
        }
        void Disc(float cx, float cy, float r, Color32 c)
        {
            for (float y = -r; y <= r; y++) for (float x = -r; x <= r; x++) if (x * x + y * y <= r * r) Blend(cx + x, cy + y, 1, 1, c);
        }

        void DrawMaze()
        {
            var m = maze;
            Array.Clear(mazePx, 0, mazePx.Length); // 투명 (머리줄 영역)
            float oy = MazeMaps.OY, mh = MazeMaps.MazeH;
            Fill(0, oy - 6, W, mh + 12, new Color32(1, 3, 4, 255));
            // 아주 옅은 점 격자
            for (float y = oy + 16; y < oy + mh; y += 32) for (float x = 16; x < W; x += 32) Fill(x - 1, y - 1, 2, 2, new Color32(14, 20, 22, 255));
            // 내려가는 감시선
            float sy = oy + m.Sweep * mh;
            for (int q = 0; q < 40; q++) Blend(0, sy - 40 + q, W, 1, new Color32(255, 70, 70, (byte)(q * 0.65f)));
            bool flash = m.HitFlash > 0 && Mathf.FloorToInt(m.HitFlash * 20) % 2 == 0;
            foreach (var r in m.Rects) Fill(r.X, r.Y, r.W, r.H, flash ? new Color32(122, 46, 46, 255) : new Color32(17, 168, 140, 255));
            foreach (var r in m.Rects) Fill(r.X + 3, r.Y + 3, r.W - 6, r.H - 6, flash ? new Color32(165, 72, 72, 255) : new Color32(25, 201, 166, 255));
            if (m.HiddenRects.Count > 0 && !m.HiddenUsed)
            {
                byte a = (byte)(255 * (0.1f + m.Revealed * 0.75f));
                foreach (var r in m.HiddenRects) Blend(r.X, r.Y, r.W, r.H, new Color32(19, 143, 120, a));
            }
            // 출발점
            var st = m.Start;
            bool sb = !m.Engaged && Mathf.Sin(m.Blink * 6) > 0;
            Fill(st.X, st.Y, st.W, st.H, sb ? new Color32(232, 255, 248, 255) : new Color32(11, 59, 51, 255));
            Fill(st.X + st.W / 2 - 5, st.Y + st.H / 2 - 7, 10, 14, sb ? new Color32(4, 17, 14, 255) : new Color32(166, 255, 233, 255));
            // 도착점 (코드 블록)
            for (int i = 0; i < m.Goals.Count; i++)
            {
                var g = m.Goals[i]; var lbl = i < goalLabels.Count ? goalLabels[i] : null;
                bool visible = g.HasRect && !(g.Def.Hidden && (m.HiddenUsed || m.Revealed < 0.05f));
                if (lbl != null) lbl.enabled = visible;
                if (!visible) continue;
                bool hot = m.Hover == i;
                float al = g.Def.Hidden ? 0.15f + m.Revealed * 0.85f : 1f;
                var border = g.Def.Hidden ? new Color32(95, 209, 255, (byte)(255 * al)) : new Color32(94, 242, 207, (byte)(255 * al));
                Blend(g.Rect.X, g.Rect.Y, g.Rect.W, g.Rect.H, border);
                Blend(g.Rect.X + 3, g.Rect.Y + 3, g.Rect.W - 6, g.Rect.H - 6, hot ? new Color32(217, 255, 245, (byte)(255 * al)) : new Color32(3, 33, 28, (byte)(255 * al)));
                if (lbl != null) lbl.color = hot ? new Color(0.01f, 0.13f, 0.11f, al) : (g.Def.Hidden ? new Color(0.62f, 0.89f, 1f, al) : new Color(0.79f, 1f, 0.94f, al));
            }
            // 커서 (점 + 꼬리)
            for (int i = 0; i < m.Trail.Count; i++) Disc(m.Trail[i][0], m.Trail[i][1], MazeState.CursorR * 0.8f, new Color32(191, 255, 240, (byte)(255 * i / (float)m.Trail.Count * 0.35f)));
            Disc(m.CX, m.CY, MazeState.CursorR + 3, m.Engaged ? new Color32(120, 255, 220, 200) : new Color32(120, 160, 150, 150));
            Disc(m.CX, m.CY, MazeState.CursorR, m.Engaged ? new Color32(255, 255, 255, 255) : new Color32(159, 184, 178, 255));
            // 위쪽 시간 막대
            float k = m.Left / m.Time;
            Fill(64, 78, 896, 10, new Color32(13, 31, 28, 255));
            Fill(64, 78, 896 * k, 10, k > 0.5f ? new Color32(63, 240, 200, 255) : k > 0.25f ? new Color32(255, 195, 92, 255) : new Color32(255, 90, 74, 255));
            // 아래 미리보기 칸
            float ly = oy + mh + 8;
            Fill(64, ly, 896, 88, new Color32(31, 90, 80, 255)); Fill(66, ly + 2, 892, 84, new Color32(4, 16, 14, 255));
            if (m.Hover >= 0)
            {
                var g = m.Goals[m.Hover];
                string text = g.Def.Key == "hidden" ? MazeLabelHidden : g.Def.Key == "done" ? MazeLabelDone : g.Def.Key == "subtle" ? PreviewSubtle : g.Def.Key == "direct" ? PreviewDirect : "";
                mazePreviewTitle.text = g.Def.Code + "  →" + (m.Engaged ? "      " + MazeLabelClick : "");
                mazePreviewBody.text = text; mazeStatus.text = "";
            }
            else
            {
                mazePreviewTitle.text = ""; mazePreviewBody.text = "";
                mazeStatus.text = (m.Engaged ? MazeLabelGoal : MazeLabelStart) + (MazeStatusText != null ? "\n" + MazeStatusText() : "");
                ((RectTransform)mazeStatus.transform).anchoredPosition = new Vector2(84, -(ly + 12));
                ((RectTransform)mazeStatus.transform).sizeDelta = new Vector2(856, 70);
            }
            // 가이드 말풍선
            if (m.Bubble != null)
            {
                mazeBubble.text = m.Bubble; mazeBubble.enabled = true;
                float a = Mathf.Min(1, m.BubbleT * 2);
                Blend(512 - 430, oy + 14, 860, 52, new Color32(255, 224, 138, (byte)(255 * a))); Blend(512 - 428, oy + 16, 856, 48, new Color32(2, 10, 9, (byte)(235 * a)));
                mazeBubble.color = new Color(1f, 0.91f, 0.69f, a);
            }
            else mazeBubble.enabled = false;
            // 벽에 닿은 순간의 잡음
            if (m.Noise > 0)
            {
                float n = m.Noise * 2;
                for (int i = 0; i < 70 * n; i++)
                    Fill(Random.value * W, oy + Random.value * mh, 20 + Random.value * 160, 2 + Random.value * 5, Random.value < 0.5f ? new Color32(255, 255, 255, 128) : new Color32(0, 0, 0, 180));
            }
            mazeTimeout.enabled = m.Result == "timeout";
            if (m.Result == "timeout") { Blend(0, oy, W, mh, new Color32(0, 0, 0, 178)); mazeTimeout.text = MazeLabelTimeout; }
            mazeTex.SetPixels32(mazePx); mazeTex.Apply(false);
        }

        // ---------- CCTV 화면을 단말기에 띄운다 (추격 시작) ----------
        RawImage feedImg;
        public void ShowFeed(Texture tex)
        {
            var root = (RectTransform)hdrLeft.transform.parent;
            if (feedImg == null)
            {
                var rt = UIKit.Rect(root, "Feed", Vector2.zero, Vector2.one, new Vector2(64, 120), new Vector2(-64, -90));
                feedImg = rt.gameObject.AddComponent<RawImage>(); feedImg.raycastTarget = false;
                PropFactory.SetLayer(root.gameObject, Layers.Terminal);
            }
            feedImg.texture = tex; feedImg.transform.SetAsLastSibling(); feedImg.enabled = true;
        }
        public void HideFeed() { if (feedImg != null) feedImg.enabled = false; }

        // ---------- 가짜 블루스크린 (엔딩 3) ----------
        GameObject bsod;
        public void ShowBsod(IList<string> lines)
        {
            var root = (RectTransform)hdrLeft.transform.parent;
            if (bsod == null)
            {
                var rt = UIKit.Rect(root, "Bsod", Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
                bsod = rt.gameObject;
                UIKit.Panel(rt, new Color(0.03f, 0.2f, 0.62f));
                var t = UIKit.Label(UIKit.Rect(rt, "Text", Vector2.zero, Vector2.one, new Vector2(80, 80), new Vector2(-80, -80)), "", font, 34, Color.white, TextAnchor.MiddleLeft);
                t.lineSpacing = 1.4f;
                PropFactory.SetLayer(root.gameObject, Layers.Terminal);
            }
            bsod.GetComponentInChildren<Text>().text = ":(\n\n" + string.Join("\n", lines);
            bsod.transform.SetAsLastSibling();
            bsod.SetActive(true);
        }
        public void HideBsod() { if (bsod != null) bsod.SetActive(false); }

        // ---------- 명령 입력 (엔딩 1·5) ----------
        Text inputLine;
        string inputBuf;
        bool inputActive, inputDone;
        public bool InInput => inputActive;

        /// <summary>한 줄 입력을 받는다 (Enter). maxWait 초가 지나면 입력한 데까지로 끝낸다 (0 = 무제한)</summary>
        public IEnumerator ReadInput(string prompt, float maxWait, Action<string> done)
        {
            inputLine = NewLine();
            inputBuf = ""; inputActive = true; inputDone = false;
            float t = 0f;
            while (!inputDone && (maxWait <= 0f || t < maxWait))
            {
                t += Time.deltaTime;
                foreach (char c in Input.inputString)
                {
                    if (c == '\b') { if (inputBuf.Length > 0) inputBuf = inputBuf.Substring(0, inputBuf.Length - 1); }
                    else if (c == '\n' || c == '\r') { inputDone = true; break; }
                    else if (!char.IsControl(c) && inputBuf.Length < 40) { inputBuf += c; PlaySfx("sfx_key", 0.3f, 0.08f); }
                }
                string comp = Input.compositionString;
                inputLine.text = "<color=" + (Green ? "#4dff6a" : "#9fd8ff") + ">" + prompt + "</color>" + Escape(inputBuf + comp) + (Mathf.FloorToInt(Time.time * 3f) % 2 == 0 ? "_" : " ");
                Relayout(inputLine);
                yield return null;
            }
            inputActive = false;
            inputLine.text = "<color=" + (Green ? "#4dff6a" : "#9fd8ff") + ">" + prompt + "</color>" + Escape(inputBuf);
            Relayout(inputLine);
            done?.Invoke(inputBuf);
        }

        void UpdateExtras(float dt)
        {
            if (hiddenText != null && !string.IsNullOrEmpty(hiddenText.text))
            {
                if (!hiddenFound) hiddenReveal = Mathf.Max(0, hiddenReveal - dt * 0.05f);
                var c = hiddenText.color; c.a = Mathf.Clamp01(hiddenReveal) * 0.9f; hiddenText.color = c;
            }
        }
    }
}
