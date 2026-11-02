// 컴파일 검사 전용 최소 스텁 (com.unity.ugui 의 공개 API 시그니처만 흉내 냄). 게임에는 포함되지 않는다.
// 시그니처는 github.com/Unity-Technologies/uGUI (com.unity.ugui) 소스에서 확인.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Events;

namespace UnityEngine.EventSystems
{
    public abstract class UIBehaviour : MonoBehaviour { public virtual bool IsActive() => isActiveAndEnabled; }
    public class BaseEventData { }
    public class PointerEventData : BaseEventData { }
    public interface IEventSystemHandler { }
    public interface IPointerEnterHandler : IEventSystemHandler { void OnPointerEnter(PointerEventData eventData); }
    public interface IPointerExitHandler : IEventSystemHandler { void OnPointerExit(PointerEventData eventData); }
    public class EventSystem : UIBehaviour { public static EventSystem current { get; set; } }
    public abstract class BaseInputModule : UIBehaviour { }
    public abstract class PointerInputModule : BaseInputModule { }
    public class StandaloneInputModule : PointerInputModule { }
    public abstract class BaseRaycaster : UIBehaviour { }
}

namespace UnityEngine.UI
{
    using UnityEngine.EventSystems;

    public interface IMeshModifier { void ModifyMesh(VertexHelper verts); }

    public class VertexHelper : IDisposable
    {
        public void Clear() { }
        public void GetUIVertexStream(List<UIVertex> stream) { }
        public void AddUIVertexTriangleStream(List<UIVertex> verts) { }
        public void Dispose() { }
    }

    public abstract class Graphic : UIBehaviour
    {
        public virtual Color color { get; set; }
        public virtual bool raycastTarget { get; set; }
        public RectTransform rectTransform => null;
        public virtual void SetVerticesDirty() { }
        public virtual void SetAllDirty() { }
    }

    public abstract class MaskableGraphic : Graphic { }

    public class Image : MaskableGraphic { public Sprite sprite { get; set; } }

    public class RawImage : MaskableGraphic { public Texture texture { get; set; } }

    public class Text : MaskableGraphic
    {
        public TextGenerator cachedTextGeneratorForLayout => null;
        public Font font { get; set; }
        public virtual string text { get; set; }
        public bool supportRichText { get; set; }
        public bool resizeTextForBestFit { get; set; }
        public int resizeTextMinSize { get; set; }
        public int resizeTextMaxSize { get; set; }
        public TextAnchor alignment { get; set; }
        public HorizontalWrapMode horizontalOverflow { get; set; }
        public VerticalWrapMode verticalOverflow { get; set; }
        public float lineSpacing { get; set; }
        public FontStyle fontStyle { get; set; }
        public int fontSize { get; set; }
        public float pixelsPerUnit => 1f;
        public virtual float preferredHeight => 0f;
        public TextGenerationSettings GetGenerationSettings(Vector2 extents) => default;
    }

    public abstract class BaseMeshEffect : UIBehaviour, IMeshModifier
    {
        protected Graphic graphic => null;
        public abstract void ModifyMesh(VertexHelper vh);
    }

    public class Shadow : BaseMeshEffect
    {
        public Color effectColor { get; set; }
        public Vector2 effectDistance { get; set; }
        public override void ModifyMesh(VertexHelper vh) { }
    }

    public class CanvasScaler : UIBehaviour
    {
        public enum ScaleMode { ConstantPixelSize, ScaleWithScreenSize, ConstantPhysicalSize }
        public enum ScreenMatchMode { MatchWidthOrHeight = 0, Expand = 1, Shrink = 2 }
        public ScaleMode uiScaleMode { get; set; }
        public float scaleFactor { get; set; }
        public Vector2 referenceResolution { get; set; }
        public ScreenMatchMode screenMatchMode { get; set; }
        public float matchWidthOrHeight { get; set; }
    }

    public class GraphicRaycaster : BaseRaycaster { }
    public class RectMask2D : UIBehaviour { }

    public struct ColorBlock
    {
        public Color normalColor { get; set; }
        public Color highlightedColor { get; set; }
        public Color pressedColor { get; set; }
    }

    public struct Navigation
    {
        public enum Mode { None = 0, Horizontal = 1, Vertical = 2, Automatic = 3, Explicit = 4 }
        public Mode mode { get; set; }
    }

    public class Selectable : UIBehaviour
    {
        public enum Transition { None, ColorTint, SpriteSwap, Animation }
        public Navigation navigation { get; set; }
        public Transition transition { get; set; }
        public ColorBlock colors { get; set; }
        public Graphic targetGraphic { get; set; }
        public bool interactable { get; set; }
    }

    public class Button : Selectable
    {
        public class ButtonClickedEvent : UnityEvent { }
        public ButtonClickedEvent onClick { get; set; } = new ButtonClickedEvent();
    }

    public class Slider : Selectable
    {
        public enum Direction { LeftToRight, RightToLeft, BottomToTop, TopToBottom }
        public class SliderEvent : UnityEvent<float> { }
        public RectTransform fillRect { get; set; }
        public RectTransform handleRect { get; set; }
        public Direction direction { get; set; }
        public float minValue { get; set; }
        public float maxValue { get; set; }
        public virtual float value { get; set; }
        public SliderEvent onValueChanged { get; set; } = new SliderEvent();
    }
}
