using System;
using System.Collections;
using System.Collections.Generic;
using NightEval.Story;
using UnityEngine;
using UnityEngine.UI;

namespace NightEval.UI
{
    /// <summary>타이틀, 인트로 카드, 일시정지, 설정, 확인 대화상자, 엔딩 화면.</summary>
    public sealed class Menus : MonoBehaviour
    {
        RectTransform root;
        Font font, bold;
        GameObject title, pause, settings, confirm, ending, intro;
        Text titleEndings, confirmText, confirmYes, confirmNo;
        Text introText, introSkip;
        Text endNumber, endTitle, endBody;
        GameObject endButtons;
        Button endRetry;
        Action confirmYesCb, confirmNoCb;
        Action settingsClose;
        Action<string> uiSound;
        bool introSkipRequested;

        public bool TitleOpen => title != null && title.activeSelf;
        public bool PauseOpen => pause != null && pause.activeSelf;
        public bool SettingsOpen => settings != null && settings.activeSelf;
        public bool ConfirmOpen => confirm != null && confirm.activeSelf;
        public bool EndingOpen => ending != null && ending.activeSelf;
        public bool AnyOpen => TitleOpen || PauseOpen || SettingsOpen || ConfirmOpen || EndingOpen || (intro != null && intro.activeSelf);

        public void Build(Transform parent, Action<string> uiSound)
        {
            this.uiSound = uiSound;
            font = Res.Font;
            bold = Res.Bold;
            var canvas = UIKit.OverlayCanvas(parent, "Menus", 50);
            root = (RectTransform)canvas.transform;
            UIKit.EnsureEventSystem(parent);
        }

        void Hover() { uiSound?.Invoke("sfx_ui_hover"); }

        Button MenuButton(RectTransform parent, string name, string label, Vector2 pos, int size, Action onClick, TextAnchor anchor = TextAnchor.MiddleLeft, float width = 520f)
        {
            var rt = UIKit.Fixed(parent, name, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), pos, new Vector2(width, size + 26));
            var b = UIKit.TextButton(rt, label, bold, size, () => { uiSound?.Invoke("sfx_ui_select"); onClick?.Invoke(); }, Hover);
            rt.GetComponentInChildren<Text>().alignment = anchor;
            return b;
        }

        // ---------- 타이틀 ----------

        Button titleContinue, titleChapters, titleChicken, titleLang;
        Action continueCb, chaptersCb, chickenCb, langCb;

        /// <summary>겁쟁이 모드·언어 버튼까지 (chicken/lang 콜백이 null 이면 숨김)</summary>
        public void ShowTitle(int found, int total, Action start, Action continueGame, Action chapters, Action toggleChicken, bool chickenOn, Action toggleLang, Action openSettings, Action quit)
        {
            chickenCb = toggleChicken; langCb = toggleLang;
            ShowTitle(found, total, start, continueGame, chapters, openSettings, quit);
            titleChicken.gameObject.SetActive(toggleChicken != null);
            titleLang.gameObject.SetActive(toggleLang != null);
            titleChicken.GetComponentInChildren<Text>().text = L.T("겁쟁이 모드: ", "Chicken Mode: ") + (chickenOn ? L.T("켜짐", "ON") : L.T("꺼짐", "OFF"));
            titleLang.GetComponentInChildren<Text>().text = "언어 · Language: " + (L.En ? "English" : "한국어");
        }

        public void ShowTitle(int found, int total, Action start, Action openSettings, Action quit) => ShowTitle(found, total, start, null, null, openSettings, quit);

        /// <summary>continueGame / chapters 가 null 이면 그 버튼을 숨긴다 (저장이 없을 때).</summary>
        public void ShowTitle(int found, int total, Action start, Action continueGame, Action chapters, Action openSettings, Action quit)
        {
            continueCb = continueGame; chaptersCb = chapters;
            if (title == null)
            {
                var rt = UIKit.Stretch(root, "Title");
                title = rt.gameObject;
                var shade = UIKit.Rect(rt, "Shade", Vector2.zero, new Vector2(0.62f, 1f), Vector2.zero, Vector2.zero);
                UIKit.Panel(shade, new Color(0f, 0.005f, 0.01f, 0.86f));
                var panel = UIKit.Fixed(rt, "Panel", new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(150f, 0f), new Vector2(800f, 700f));
                UIKit.Label(UIKit.Fixed(panel, "Name", new Vector2(0, 1), new Vector2(0, 1), new Vector2(0, -40), new Vector2(800, 120)), "야간 평가실", bold, 96, new Color(0.88f, 0.94f, 1f), TextAnchor.UpperLeft);
                UIKit.Label(UIKit.Fixed(panel, "Sub", new Vector2(0, 1), new Vector2(0, 1), new Vector2(4, -170), new Vector2(800, 40)), L.T("시냅스 야간 QA 평가자 117 · 근무 첫날", "Synapse Night QA · Evaluator 117 · First shift"), font, 26, UIKit.TextDim, TextAnchor.UpperLeft);
                var buttons = UIKit.Fixed(panel, "Buttons", new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(0, -60), new Vector2(620, 480));
                MenuButton(buttons, "Start", L.T("근무 시작", "Start shift"), new Vector2(0, 195), 40, () => start?.Invoke());
                titleContinue = MenuButton(buttons, "Continue", L.T("이어하기", "Continue"), new Vector2(0, 130), 40, () => continueCb?.Invoke());
                titleChapters = MenuButton(buttons, "Chapters", L.T("장 선택", "Chapter select"), new Vector2(0, 65), 40, () => chaptersCb?.Invoke());
                titleChicken = MenuButton(buttons, "Chicken", "", new Vector2(0, 0), 34, () => chickenCb?.Invoke(), TextAnchor.MiddleLeft, 620);
                titleLang = MenuButton(buttons, "Lang", "", new Vector2(0, -60), 34, () => langCb?.Invoke(), TextAnchor.MiddleLeft, 620);
                MenuButton(buttons, "Settings", L.T("설정", "Settings"), new Vector2(0, -125), 40, () => openSettings?.Invoke());
                MenuButton(buttons, "Quit", L.T("종료", "Quit"), new Vector2(0, -190), 40, () => quit?.Invoke());
                titleEndings = UIKit.Label(UIKit.Fixed(panel, "Endings", new Vector2(0, 0), new Vector2(0, 0), new Vector2(4, 40), new Vector2(800, 40)), "", font, 24, UIKit.TextDim, TextAnchor.LowerLeft);
                UIKit.Label(UIKit.Fixed(rt, "Note", new Vector2(1, 0), new Vector2(1, 0), new Vector2(-40, 30), new Vector2(900, 40)), L.T("헤드폰 권장 · 깜짝 연출이 있습니다", "Headphones recommended · Contains jump scares"), font, 22, UIKit.TextDim, TextAnchor.LowerRight);
            }
            titleEndings.text = L.T("엔딩 ", "Endings ") + found + " / " + total;
            titleContinue.gameObject.SetActive(continueGame != null);
            titleChicken.gameObject.SetActive(chickenCb != null);
            titleLang.gameObject.SetActive(langCb != null);
            titleChapters.gameObject.SetActive(chapters != null);
            title.SetActive(true);
        }

        public void HideTitle() { if (title != null) title.SetActive(false); }

        // ---------- 장 선택 (도달한 장만) ----------
        GameObject chapterPanel;
        public bool ChaptersOpen => chapterPanel != null && chapterPanel.activeSelf;

        public void ShowChapters(List<string> labels, List<Action> picks, Action back)
        {
            if (chapterPanel != null) Destroy(chapterPanel);
            var rt = UIKit.Stretch(root, "Chapters");
            chapterPanel = rt.gameObject;
            UIKit.Panel(rt, new Color(0f, 0.005f, 0.01f, 0.94f), true);
            UIKit.Label(UIKit.Fixed(rt, "Head", new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -80), new Vector2(1000, 70)), L.T("장 선택", "Chapter select"), bold, 56, new Color(0.88f, 0.94f, 1f), TextAnchor.MiddleCenter);
            var list = UIKit.Fixed(rt, "List", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0, 20), new Vector2(800, 620));
            for (int i = 0; i < labels.Count; i++)
            {
                var pick = picks[i];
                MenuButton(list, "Ch" + i, labels[i], new Vector2(0, 270 - i * 62), 32, () => { HideChapters(); pick?.Invoke(); }, TextAnchor.MiddleCenter, 800);
            }
            MenuButton(rt, "Back", L.T("돌아가기", "Back"), new Vector2(0, -400), 32, () => { HideChapters(); back?.Invoke(); }, TextAnchor.MiddleCenter, 400);
        }

        public void HideChapters() { if (chapterPanel != null) chapterPanel.SetActive(false); }

        // ---------- 일시정지 ----------

        public void ShowPause(Action resume, Action openSettings, Action restart, Action toTitle, Action quit)
        {
            if (pause == null)
            {
                var rt = UIKit.Stretch(root, "Pause");
                pause = rt.gameObject;
                UIKit.Panel(rt, new Color(0, 0.004f, 0.008f, 0.82f), true);
                UIKit.Label(UIKit.Fixed(rt, "Head", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0, 250), new Vector2(800, 80)), L.T("일시정지", "Paused"), bold, 56, UIKit.TextMain, TextAnchor.MiddleCenter);
                MenuButton(rt, "Resume", L.T("계속하기", "Resume"), new Vector2(0, 120), 40, () => resume?.Invoke(), TextAnchor.MiddleCenter);
                MenuButton(rt, "Settings", L.T("설정", "Settings"), new Vector2(0, 40), 40, () => openSettings?.Invoke(), TextAnchor.MiddleCenter);
                MenuButton(rt, "Restart", L.T("처음부터 다시", "Restart"), new Vector2(0, -40), 40, () => restart?.Invoke(), TextAnchor.MiddleCenter);
                MenuButton(rt, "Title", L.T("타이틀로", "To title"), new Vector2(0, -120), 40, () => toTitle?.Invoke(), TextAnchor.MiddleCenter);
                MenuButton(rt, "Quit", L.T("게임 종료", "Quit game"), new Vector2(0, -200), 40, () => quit?.Invoke(), TextAnchor.MiddleCenter);
                UIKit.Label(UIKit.Fixed(rt, "Keys", new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 50), new Vector2(1600, 40)), L.T("WASD 이동 · Shift 달리기 · 마우스 시점 · E 상호작용 · 단말기: 클릭/Space 넘기기, 휠 스크롤, ESC 일어나기", "WASD move · Shift run · Mouse look · E interact · Terminal: click/Space to advance, wheel to scroll, ESC to stand"), font, 22, UIKit.TextDim, TextAnchor.MiddleCenter);
            }
            pause.SetActive(true);
        }

        public void HidePause() { if (pause != null) pause.SetActive(false); }

        // ---------- 설정 ----------

        public void ShowSettings(Settings s, Action onChanged, Action onClose)
        {
            settingsClose = onClose;
            if (settings != null) Destroy(settings);
            var rt = UIKit.Stretch(root, "Settings");
            settings = rt.gameObject;
            UIKit.Panel(rt, new Color(0, 0.004f, 0.008f, 0.94f), true);
            UIKit.Label(UIKit.Fixed(rt, "Head", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0, 300), new Vector2(800, 80)), L.T("설정", "Settings"), bold, 56, UIKit.TextMain, TextAnchor.MiddleCenter);
            Row(rt, L.T("밝기", "Brightness"), s.Brightness, 170, v => { s.Brightness = v; onChanged?.Invoke(); }, L.T("어두워도 길과 글자가 보일 만큼 맞춰 주세요", "Adjust until paths and text are visible in the dark"));
            Row(rt, L.T("전체 음량", "Master volume"), s.MasterVolume, 60, v => { s.MasterVolume = v; onChanged?.Invoke(); }, null);
            Row(rt, L.T("배경음", "Music"), s.MusicVolume, -50, v => { s.MusicVolume = v; onChanged?.Invoke(); }, null);
            Row(rt, L.T("마우스 감도", "Mouse sensitivity"), s.MouseSensitivity, -160, v => { s.MouseSensitivity = v; onChanged?.Invoke(); }, null);
            MenuButton(rt, "Close", L.T("닫기", "Close"), new Vector2(0, -290), 40, CloseSettings, TextAnchor.MiddleCenter);
            settings.SetActive(true);
        }

        void Row(RectTransform parent, string label, float value, float y, Action<float> onChange, string note)
        {
            UIKit.Label(UIKit.Fixed(parent, label, new Vector2(0.5f, 0.5f), new Vector2(1f, 0.5f), new Vector2(-60, y), new Vector2(400, 50)), label, font, 32, UIKit.TextMain, TextAnchor.MiddleRight);
            var srt = UIKit.Fixed(parent, label + "Slider", new Vector2(0.5f, 0.5f), new Vector2(0f, 0.5f), new Vector2(0, y), new Vector2(560, 40));
            var valueText = UIKit.Label(UIKit.Fixed(parent, label + "Value", new Vector2(0.5f, 0.5f), new Vector2(0f, 0.5f), new Vector2(590, y), new Vector2(120, 50)), Mathf.RoundToInt(value * 100) + "%", font, 28, UIKit.TextDim, TextAnchor.MiddleLeft);
            UIKit.Slider(srt, value, v => { valueText.text = Mathf.RoundToInt(v * 100) + "%"; onChange(v); });
            if (note != null)
                UIKit.Label(UIKit.Fixed(parent, label + "Note", new Vector2(0.5f, 0.5f), new Vector2(0f, 0.5f), new Vector2(0, y - 42), new Vector2(900, 34)), note, font, 22, UIKit.TextDim, TextAnchor.MiddleLeft);
        }

        public void CloseSettings()
        {
            if (settings != null) settings.SetActive(false);
            var cb = settingsClose;
            settingsClose = null;
            cb?.Invoke();
        }

        // ---------- 확인 (퇴근 등) ----------

        public void ShowConfirm(string question, string yes, string no, Action onYes, Action onNo)
        {
            confirmYesCb = onYes;
            confirmNoCb = onNo;
            if (confirm == null)
            {
                var rt = UIKit.Stretch(root, "Confirm");
                confirm = rt.gameObject;
                UIKit.Panel(rt, new Color(0, 0, 0, 0.75f), true);
                confirmText = UIKit.Label(UIKit.Fixed(rt, "Question", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0, 140), new Vector2(1400, 160)), "", bold, 48, UIKit.TextMain, TextAnchor.MiddleCenter);
                var yesB = BigBox(rt, "Yes", new Vector2(-300, -60), () => { var cb = confirmYesCb; HideConfirm(); cb?.Invoke(); });
                var noB = BigBox(rt, "No", new Vector2(300, -60), () => { var cb = confirmNoCb; HideConfirm(); cb?.Invoke(); });
                confirmYes = yesB;
                confirmNo = noB;
            }
            confirmText.text = question;
            confirmYes.text = yes;
            confirmNo.text = no;
            confirm.SetActive(true);
        }

        Text BigBox(RectTransform parent, string name, Vector2 pos, Action onClick)
        {
            var rt = UIKit.Fixed(parent, name, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), pos, new Vector2(500, 160));
            var border = UIKit.Panel(rt, new Color(0.62f, 0.8f, 0.92f, 1f), true);
            var inner = UIKit.Rect(rt, "Inner", Vector2.zero, Vector2.one, new Vector2(5, 5), new Vector2(-5, -5));
            var fill = UIKit.Panel(inner, new Color(0.02f, 0.045f, 0.06f, 1f));
            var label = UIKit.Label(UIKit.Stretch(inner, "Label"), "", bold, 48, new Color(0.78f, 0.9f, 1f), TextAnchor.MiddleCenter);
            var b = rt.gameObject.AddComponent<Button>();
            b.targetGraphic = border;
            var colors = b.colors;
            colors.highlightedColor = new Color(1f, 1f, 1f);
            b.colors = colors;
            b.onClick.AddListener(() => { uiSound?.Invoke("sfx_ui_select"); onClick(); });
            var hover = rt.gameObject.AddComponent<BoxHover>();
            hover.Fill = fill;
            hover.Label = label;
            hover.OnHover = Hover;
            return label;
        }

        public void HideConfirm() { if (confirm != null) confirm.SetActive(false); }

        // ---------- 인트로 카드 ----------

        public IEnumerator PlayIntro(List<string> lines)
        {
            if (intro == null)
            {
                var rt = UIKit.Stretch(root, "Intro");
                intro = rt.gameObject;
                UIKit.Panel(rt, Color.black, true);
                introText = UIKit.Label(UIKit.Fixed(rt, "Text", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0, 30), new Vector2(1300, 700)), "", font, 36, new Color(0.82f, 0.88f, 0.92f), TextAnchor.MiddleLeft);
                introText.lineSpacing = 1.5f;
                introSkip = UIKit.Label(UIKit.Fixed(rt, "Skip", new Vector2(1, 0), new Vector2(1, 0), new Vector2(-50, 40), new Vector2(600, 40)), L.T("클릭: 넘기기", "Click: advance"), font, 22, UIKit.TextDim, TextAnchor.LowerRight);
            }
            intro.SetActive(true);
            introText.text = "";
            introSkipRequested = false;
            var sb = new System.Text.StringBuilder();
            foreach (string line in lines)
            {
                for (int i = 0; i <= line.Length; i++)
                {
                    if (SkipPressed()) { introSkipRequested = true; break; }
                    introText.text = sb + line.Substring(0, i);
                    if (i < line.Length && !char.IsWhiteSpace(line[i]) && i % 2 == 0) uiSound?.Invoke("sfx_blip");
                    yield return new WaitForSecondsRealtime(0.04f);
                }
                if (introSkipRequested) break;
                sb.Append(line).Append('\n');
                introText.text = sb.ToString();
                float wait = string.IsNullOrEmpty(line) ? 0.3f : 0.9f;
                while (wait > 0f) { wait -= Time.unscaledDeltaTime; if (SkipPressed()) { wait = 0f; } yield return null; }
            }
            if (!introSkipRequested)
            {
                float hold = 2.5f;
                while (hold > 0f) { hold -= Time.unscaledDeltaTime; if (SkipPressed()) break; yield return null; }
            }
        }

        public void HideIntro() { if (intro != null) intro.SetActive(false); }

        static bool SkipPressed()
        {
            return Input.GetMouseButtonDown(0) || Input.GetKeyDown(KeyCode.Space) || Input.GetKeyDown(KeyCode.Return);
        }

        // ---------- 엔딩 (검은 화면 + ENDING n + 주인공의 결말) ----------

        public IEnumerator PlayEnding(StoryEnding e, List<string> lines, Action toTitle, Action retry) => PlayEnding(e, lines, toTitle, retry, null, null);

        /// <summary>엔딩 화면. 버튼: 직전 선택부터 / 장 선택 / 처음부터 (+ 추격 직전부터 다시)</summary>
        public IEnumerator PlayEnding(StoryEnding e, List<string> lines, Action toTitle, Action retry, Action fromChoice, Action chapters)
        {
            if (ending == null)
            {
                var rt = UIKit.Stretch(root, "Ending");
                ending = rt.gameObject;
                UIKit.Panel(rt, Color.black, true);
                endNumber = UIKit.Label(UIKit.Fixed(rt, "Number", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0, 330), new Vector2(1200, 50)), "", font, 30, new Color(0.55f, 0.6f, 0.65f), TextAnchor.MiddleCenter);
                endTitle = UIKit.Label(UIKit.Fixed(rt, "Title", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0, 250), new Vector2(1400, 100)), "", bold, 72, Color.white, TextAnchor.MiddleCenter);
                endBody = UIKit.Label(UIKit.Fixed(rt, "Body", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0, -10), new Vector2(1400, 380)), "", font, 34, new Color(0.85f, 0.88f, 0.9f), TextAnchor.UpperCenter);
                endBody.lineSpacing = 1.55f;
                var buttons = UIKit.Fixed(rt, "Buttons", new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0, 120), new Vector2(1200, 140));
                endButtons = buttons.gameObject;
                endFromChoice = MenuButton(buttons, "FromChoice", L.T("직전 선택부터", "From last choice"), new Vector2(-400, 30), 34, () => fromChoiceCb?.Invoke(), TextAnchor.MiddleCenter, 380);
                endChapters = MenuButton(buttons, "Chapters", L.T("장 선택", "Chapter select"), new Vector2(0, 30), 34, () => chaptersEndCb?.Invoke(), TextAnchor.MiddleCenter, 380);
                MenuButton(buttons, "ToTitle", L.T("처음부터", "Restart from the beginning"), new Vector2(400, 30), 34, () => toTitleCb?.Invoke(), TextAnchor.MiddleCenter, 380);
                endRetry = MenuButton(buttons, "Retry", L.T("추격 직전부터 다시", "Retry from before the chase"), new Vector2(0, -40), 30, () => retryCb?.Invoke(), TextAnchor.MiddleCenter, 600);
            }
            toTitleCb = toTitle;
            retryCb = retry;
            fromChoiceCb = fromChoice;
            chaptersEndCb = chapters;
            ending.SetActive(true);
            endButtons.SetActive(false);
            endNumber.text = "";
            endTitle.text = "";
            endBody.text = "";
            var cg = ending.GetComponent<CanvasGroup>();
            if (cg == null) cg = ending.AddComponent<CanvasGroup>();
            cg.alpha = 0f;
            float t = 0f;
            while (t < 1f) { t += Time.unscaledDeltaTime / 1.5f; cg.alpha = Mathf.Clamp01(t); yield return null; }
            yield return new WaitForSecondsRealtime(0.8f);

            endNumber.text = "ENDING " + e.Number + (e.Bad ? "  ·  BAD END" : "");
            yield return FadeText(endNumber, 0.8f);
            endTitle.text = e.Title;
            yield return FadeText(endTitle, 1.0f);
            yield return new WaitForSecondsRealtime(0.8f);

            var sb = new System.Text.StringBuilder();
            foreach (string line in lines)
            {
                sb.Append(line).Append('\n');
                endBody.text = sb.ToString();
                float wait = 1.6f + line.Length * 0.035f;
                while (wait > 0f)
                {
                    wait -= Time.unscaledDeltaTime;
                    if (SkipPressed() && wait > 0.3f) wait = 0.3f;
                    yield return null;
                }
            }
            yield return new WaitForSecondsRealtime(0.6f);
            endRetry.gameObject.SetActive(retry != null);
            endFromChoice.gameObject.SetActive(fromChoice != null);
            endChapters.gameObject.SetActive(chapters != null);
            endButtons.SetActive(true);
        }

        Action toTitleCb, retryCb, fromChoiceCb, chaptersEndCb;
        Button endFromChoice, endChapters;

        static IEnumerator FadeText(Text t, float time)
        {
            Color c = t.color;
            float a = 0f;
            while (a < 1f)
            {
                a += Time.unscaledDeltaTime / time;
                c.a = Mathf.Clamp01(a);
                t.color = c;
                yield return null;
            }
        }

        public void HideEnding() { if (ending != null) ending.SetActive(false); }
    }

    /// <summary>큰 선택 상자의 호버 반전 (단말기 선택지와 같은 모양).</summary>
    public sealed class BoxHover : MonoBehaviour, UnityEngine.EventSystems.IPointerEnterHandler, UnityEngine.EventSystems.IPointerExitHandler
    {
        public Image Fill;
        public Text Label;
        public Action OnHover;

        public void OnPointerEnter(UnityEngine.EventSystems.PointerEventData e)
        {
            Fill.color = new Color(0.78f, 0.92f, 1f, 1f);
            Label.color = new Color(0.02f, 0.04f, 0.06f);
            OnHover?.Invoke();
        }

        public void OnPointerExit(UnityEngine.EventSystems.PointerEventData e)
        {
            Fill.color = new Color(0.02f, 0.045f, 0.06f, 1f);
            Label.color = new Color(0.78f, 0.9f, 1f);
        }

        void OnDisable()
        {
            if (Fill != null) OnPointerExit(null);
        }
    }
}
