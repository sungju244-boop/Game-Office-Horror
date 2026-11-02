using System;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace NightEval.UI
{
    /// <summary>uGUI 요소를 코드로 만드는 도우미.</summary>
    public static class UIKit
    {
        public static readonly Color TextMain = new Color(0.86f, 0.92f, 0.96f);
        public static readonly Color TextDim = new Color(0.55f, 0.62f, 0.68f);
        public static readonly Color Accent = new Color(0.72f, 0.88f, 1f);

        public static RectTransform Rect(Transform parent, string name, Vector2 anchorMin, Vector2 anchorMax, Vector2 offsetMin, Vector2 offsetMax)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.layer = parent != null ? parent.gameObject.layer : 5;
            var rt = (RectTransform)go.transform;
            rt.SetParent(parent, false);
            rt.anchorMin = anchorMin;
            rt.anchorMax = anchorMax;
            rt.offsetMin = offsetMin;
            rt.offsetMax = offsetMax;
            return rt;
        }

        /// <summary>앵커 한 점 기준 고정 크기 사각형.</summary>
        public static RectTransform Fixed(Transform parent, string name, Vector2 anchor, Vector2 pivot, Vector2 pos, Vector2 size)
        {
            var rt = Rect(parent, name, anchor, anchor, Vector2.zero, Vector2.zero);
            rt.pivot = pivot;
            rt.sizeDelta = size;
            rt.anchoredPosition = pos;
            return rt;
        }

        public static RectTransform Stretch(Transform parent, string name)
        {
            return Rect(parent, name, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
        }

        public static Image Panel(RectTransform rt, Color color, bool raycast = false)
        {
            var img = rt.gameObject.AddComponent<Image>();
            img.color = color;
            img.raycastTarget = raycast;
            return img;
        }

        public static Text Label(RectTransform rt, string text, Font font, int size, Color color, TextAnchor anchor)
        {
            var t = rt.gameObject.AddComponent<Text>();
            t.font = font;
            t.fontSize = size;
            t.color = color;
            t.alignment = anchor;
            t.horizontalOverflow = HorizontalWrapMode.Wrap;
            t.verticalOverflow = VerticalWrapMode.Overflow;
            t.supportRichText = true;
            t.raycastTarget = false;
            t.lineSpacing = 1.15f;
            t.text = text;
            return t;
        }

        public static Canvas OverlayCanvas(Transform parent, string name, int sortOrder)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            go.layer = 5;
            var c = go.AddComponent<Canvas>();
            c.renderMode = RenderMode.ScreenSpaceOverlay;
            c.sortingOrder = sortOrder;
            var scaler = go.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);
            scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
            scaler.matchWidthOrHeight = 0.5f;
            go.AddComponent<GraphicRaycaster>();
            return c;
        }

        public static void EnsureEventSystem(Transform parent)
        {
            if (EventSystem.current != null) return;
            var go = new GameObject("EventSystem");
            go.transform.SetParent(parent, false);
            go.AddComponent<EventSystem>();
            go.AddComponent<StandaloneInputModule>();
        }

        /// <summary>글자 버튼. 마우스를 올리면 글자색이 밝아지고 앞에 ▶ 가 붙는다.</summary>
        public static Button TextButton(RectTransform rt, string label, Font font, int size, Action onClick, Action onHover = null)
        {
            var bg = Panel(rt, new Color(1f, 1f, 1f, 0.001f), true);
            var labelRt = Stretch(rt, "Label");
            var t = Label(labelRt, label, font, size, TextDim, TextAnchor.MiddleLeft);
            var b = rt.gameObject.AddComponent<Button>();
            b.targetGraphic = bg;
            b.transition = Selectable.Transition.None;
            var nav = b.navigation;
            nav.mode = Navigation.Mode.None;
            b.navigation = nav;
            b.onClick.AddListener(() => onClick?.Invoke());
            var fx = rt.gameObject.AddComponent<HoverLabel>();
            fx.Label = t;
            fx.Base = label;
            fx.OnHover = onHover;
            return b;
        }

        public static Slider Slider(RectTransform rt, float value, Action<float> onChange)
        {
            var bg = Rect(rt, "Background", new Vector2(0, 0.4f), new Vector2(1, 0.6f), Vector2.zero, Vector2.zero);
            Panel(bg, new Color(0.18f, 0.22f, 0.26f, 1f));
            var fillArea = Rect(rt, "FillArea", new Vector2(0, 0.4f), new Vector2(1, 0.6f), Vector2.zero, Vector2.zero);
            var fill = Rect(fillArea, "Fill", Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            Panel(fill, new Color(0.55f, 0.72f, 0.82f, 1f));
            var handleArea = Rect(rt, "HandleArea", Vector2.zero, Vector2.one, new Vector2(8, 0), new Vector2(-8, 0));
            var handle = Rect(handleArea, "Handle", new Vector2(0, 0), new Vector2(0, 1), new Vector2(-8, 0), new Vector2(8, 0));
            var himg = Panel(handle, new Color(0.9f, 0.95f, 1f, 1f), true);
            var s = rt.gameObject.AddComponent<Slider>();
            s.fillRect = fill;
            s.handleRect = handle;
            s.targetGraphic = himg;
            s.direction = UnityEngine.UI.Slider.Direction.LeftToRight;
            s.minValue = 0f;
            s.maxValue = 1f;
            s.value = value;
            var nav = s.navigation;
            nav.mode = Navigation.Mode.None;
            s.navigation = nav;
            s.onValueChanged.AddListener(v => onChange?.Invoke(v));
            return s;
        }
    }

    public sealed class HoverLabel : MonoBehaviour, IPointerEnterHandler, IPointerExitHandler
    {
        public Text Label;
        public string Base;
        public Action OnHover;

        public void OnPointerEnter(PointerEventData e)
        {
            if (Label == null) return;
            Label.text = "▶ " + Base;
            Label.color = UIKit.TextMain;
            OnHover?.Invoke();
        }

        public void OnPointerExit(PointerEventData e)
        {
            if (Label == null) return;
            Label.text = Base;
            Label.color = UIKit.TextDim;
        }

        void OnDisable()
        {
            if (Label == null) return;
            Label.text = Base;
            Label.color = UIKit.TextDim;
        }
    }
}
