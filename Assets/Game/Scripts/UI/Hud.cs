using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace NightEval.UI
{
    /// <summary>
    /// 최소한의 화면 표시: 조준점, 상호작용 안내, 혼잣말(조사 결과), 목표 힌트 한 줄, 소리 자막, 암전.
    /// </summary>
    public sealed class Hud : MonoBehaviour
    {
        Image dot, ring, fade;
        Text prompt, monologue, objective, caption, help;
        readonly Queue<string> monoQueue = new Queue<string>();
        Coroutine monoRoutine, captionRoutine, helpRoutine;
        float objectiveAge;
        bool crosshair = true;

        public void Build(Transform parent)
        {
            var canvas = UIKit.OverlayCanvas(parent, "HUD", 10);
            var root = (RectTransform)canvas.transform;
            var font = Res.Font;

            dot = UIKit.Panel(UIKit.Fixed(root, "Dot", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(6, 6)), new Color(0.85f, 0.92f, 1f, 0.75f));
            ring = UIKit.Panel(UIKit.Fixed(root, "Ring", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(14, 14)), new Color(0.85f, 0.92f, 1f, 0.35f));
            ring.enabled = false;

            prompt = UIKit.Label(UIKit.Fixed(root, "Prompt", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 1f), new Vector2(0, -34), new Vector2(900, 50)), "", font, 30, new Color(0.9f, 0.95f, 1f), TextAnchor.UpperCenter);
            AddShadow(prompt);

            monologue = UIKit.Label(UIKit.Fixed(root, "Monologue", new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0, 150), new Vector2(1500, 120)), "", font, 34, Color.white, TextAnchor.LowerCenter);
            AddShadow(monologue);

            objective = UIKit.Label(UIKit.Fixed(root, "Objective", new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0, 70), new Vector2(1500, 60)), "", font, 26, new Color(0.7f, 0.82f, 0.9f), TextAnchor.LowerCenter);
            AddShadow(objective);

            caption = UIKit.Label(UIKit.Fixed(root, "Caption", new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0, -60), new Vector2(1400, 50)), "", font, 24, new Color(0.62f, 0.7f, 0.76f), TextAnchor.UpperCenter);
            AddShadow(caption);

            help = UIKit.Label(UIKit.Fixed(root, "Help", new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(40, -40), new Vector2(1200, 50)), "", font, 24, new Color(0.62f, 0.7f, 0.76f), TextAnchor.UpperLeft);
            AddShadow(help);

            var fadeCanvas = UIKit.OverlayCanvas(parent, "Fade", 40);
            fade = UIKit.Panel(UIKit.Stretch((RectTransform)fadeCanvas.transform, "Black"), Color.black);
            fade.color = new Color(0, 0, 0, 0);
        }

        static void AddShadow(Text t)
        {
            var sh = t.gameObject.AddComponent<Shadow>();
            sh.effectColor = new Color(0, 0, 0, 0.85f);
            sh.effectDistance = new Vector2(2, -2);
        }

        public void SetPrompt(string text)
        {
            prompt.text = string.IsNullOrEmpty(text) ? "" : "[E]  " + text;
            ring.enabled = !string.IsNullOrEmpty(text) && crosshair;
        }

        public void SetCrosshair(bool on)
        {
            crosshair = on;
            dot.enabled = on;
            if (!on) { ring.enabled = false; prompt.text = ""; }
        }

        public void SetObjective(string text)
        {
            objective.text = string.IsNullOrEmpty(text) ? "" : text;
            objectiveAge = 0f;
        }

        public void Monologue(List<string> lines)
        {
            foreach (var l in lines) if (!string.IsNullOrEmpty(l)) monoQueue.Enqueue(l);
            if (monoRoutine == null) monoRoutine = StartCoroutine(MonoLoop());
        }

        IEnumerator MonoLoop()
        {
            while (monoQueue.Count > 0)
            {
                string line = monoQueue.Dequeue();
                monologue.text = line;
                float t = 2.4f + line.Length * 0.06f;
                float a = 0f;
                while (a < t)
                {
                    a += Time.unscaledDeltaTime;
                    float alpha = Mathf.Clamp01(a / 0.25f) * Mathf.Clamp01((t - a) / 0.4f);
                    monologue.color = new Color(1f, 1f, 1f, alpha);
                    // 클릭이나 E로 넘길 수 있다
                    if (a > 0.4f && (Input.GetKeyDown(KeyCode.E) || Input.GetMouseButtonDown(0)) && monoQueue.Count > 0) break;
                    yield return null;
                }
                monologue.text = "";
            }
            monoRoutine = null;
        }

        /// <summary>소리 자막 (청각 단서를 놓쳐도 알 수 있게).</summary>
        public void Caption(string text)
        {
            if (captionRoutine != null) StopCoroutine(captionRoutine);
            captionRoutine = StartCoroutine(TimedText(caption, "(" + text + ")", 3.5f));
        }

        public void Help(string text, float time)
        {
            if (helpRoutine != null) StopCoroutine(helpRoutine);
            helpRoutine = StartCoroutine(TimedText(help, text, time));
        }

        IEnumerator TimedText(Text t, string text, float time)
        {
            t.text = text;
            Color baseCol = t.color;
            float a = 0f;
            while (a < time)
            {
                a += Time.unscaledDeltaTime;
                baseCol.a = Mathf.Clamp01(a / 0.3f) * Mathf.Clamp01((time - a) / 0.6f);
                t.color = baseCol;
                yield return null;
            }
            t.text = "";
        }

        public void SetFade(float a)
        {
            fade.color = new Color(0, 0, 0, Mathf.Clamp01(a));
            fade.raycastTarget = a > 0.95f;
        }

        public float FadeAlpha => fade.color.a;

        public IEnumerator Fade(float to, float time)
        {
            float from = fade.color.a;
            float t = 0f;
            while (t < 1f)
            {
                t += Time.unscaledDeltaTime / Mathf.Max(0.01f, time);
                SetFade(Mathf.Lerp(from, to, Mathf.Clamp01(t)));
                yield return null;
            }
            SetFade(to);
        }

        void Update()
        {
            // 목표 힌트는 처음엔 또렷하다가 점점 흐려진다 (화면을 가리지 않게)
            if (objective.text.Length > 0)
            {
                objectiveAge += Time.unscaledDeltaTime;
                float a = objectiveAge < 6f ? 1f : Mathf.Lerp(1f, 0.55f, (objectiveAge - 6f) / 3f);
                var c = objective.color;
                c.a = a;
                objective.color = c;
            }
        }
    }
}
