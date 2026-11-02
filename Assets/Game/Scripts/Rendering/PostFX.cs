using UnityEngine;

namespace NightEval.Rendering
{
    /// <summary>
    /// 화면 후처리 (Built-in 파이프라인 OnRenderImage). 밝기 설정, 차가운 색조, 비네팅, 그레인, 순간 잡음.
    /// 셰이더를 쓸 수 없으면 그대로 통과시킨다.
    /// </summary>
    [RequireComponent(typeof(Camera))]
    public sealed class PostFX : MonoBehaviour
    {
        public float Brightness = 0.5f; // 설정 0~1
        public float Tension;           // 0~3
        public float Fade;              // 0~1 (검은 화면)
        float flash;
        Material mat;

        static readonly int GammaId = Shader.PropertyToID("_Gamma");
        static readonly int ExposureId = Shader.PropertyToID("_Exposure");
        static readonly int VignetteId = Shader.PropertyToID("_Vignette");
        static readonly int GrainId = Shader.PropertyToID("_Grain");
        static readonly int ChromaId = Shader.PropertyToID("_Chroma");
        static readonly int FlashId = Shader.PropertyToID("_Flash");
        static readonly int DesatId = Shader.PropertyToID("_Desat");
        static readonly int TintId = Shader.PropertyToID("_Tint");
        static readonly int FadeId = Shader.PropertyToID("_Fade");

        void Awake()
        {
            var sh = Shader.Find("Hidden/NightEval/PostFX");
            if (sh != null && sh.isSupported) mat = new Material(sh) { hideFlags = HideFlags.DontSave };
            else Res.Warn("postfx", "후처리 셰이더를 쓸 수 없어 생략합니다.");
        }

        public void Flash(float amount)
        {
            flash = Mathf.Max(flash, Mathf.Clamp01(amount));
        }

        void Update()
        {
            flash = Mathf.MoveTowards(flash, 0f, Time.unscaledDeltaTime * 3f);
        }

        void OnRenderImage(RenderTexture src, RenderTexture dst)
        {
            if (mat == null)
            {
                Graphics.Blit(src, dst);
                return;
            }
            float b = Mathf.Clamp01(Brightness);
            mat.SetFloat(ExposureId, Mathf.Lerp(0.8f, 2.0f, b));
            mat.SetFloat(GammaId, Mathf.Lerp(1.2f, 0.72f, b));
            mat.SetFloat(VignetteId, 0.55f + Tension * 0.08f);
            mat.SetFloat(GrainId, 0.035f + Tension * 0.012f);
            mat.SetFloat(ChromaId, 0.012f + Tension * 0.006f);
            mat.SetFloat(DesatId, 0.25f + Tension * 0.06f);
            mat.SetColor(TintId, new Color(0.9f, 0.97f, 1.08f));
            mat.SetFloat(FlashId, flash);
            mat.SetFloat(FadeId, Mathf.Clamp01(Fade));
            Graphics.Blit(src, dst, mat);
        }

        void OnDestroy()
        {
            if (mat != null) Destroy(mat);
        }
    }
}
