using System.Collections;
using UnityEngine;

namespace NightEval.World
{
    /// <summary>경첩으로 도는 문. 잠금 상태와 카드 단말기 LED를 가진다.</summary>
    public sealed class Door : MonoBehaviour
    {
        public string Id = "";
        public float OpenYaw = -95f;
        public bool Locked;
        public Renderer Led;
        public Light LedLight;
        public Material LedRed, LedGreen;
        public float Amount { get; private set; }
        public bool Busy { get; private set; }

        Quaternion closedRot;
        Coroutine anim;

        public void Init(float openYaw, bool locked)
        {
            OpenYaw = openYaw;
            Locked = locked;
            closedRot = transform.localRotation;
            UpdateLed();
        }

        public void SetOpen(float amount, float time)
        {
            if (anim != null) StopCoroutine(anim);
            anim = StartCoroutine(Animate(Mathf.Clamp01(amount), Mathf.Max(0.01f, time)));
        }

        IEnumerator Animate(float target, float time)
        {
            Busy = true;
            float start = Amount;
            float t = 0f;
            while (t < 1f)
            {
                t += Time.deltaTime / time;
                float e = Mathf.SmoothStep(0f, 1f, Mathf.Clamp01(t));
                Amount = Mathf.Lerp(start, target, e);
                transform.localRotation = closedRot * Quaternion.Euler(0f, OpenYaw * Amount, 0f);
                yield return null;
            }
            Busy = false;
            anim = null;
        }

        public void SetLocked(bool locked)
        {
            Locked = locked;
            UpdateLed();
        }

        void UpdateLed()
        {
            if (Led != null && LedRed != null && LedGreen != null) Led.sharedMaterial = Locked ? LedRed : LedGreen;
            if (LedLight != null) LedLight.color = Locked ? new Color(1f, 0.15f, 0.1f) : new Color(0.2f, 1f, 0.4f);
        }
    }

    /// <summary>천장 형광등 한 개. 밝기 단계·깜빡임·발광 패널을 함께 조절한다.</summary>
    public sealed class CeilingLight : MonoBehaviour
    {
        public Light Light;
        public Renderer Panel;
        public float BaseIntensity = 0.9f;
        public float Level { get; private set; }
        public bool Flicker;
        public float Mood = 1f;       // 구하지 못한 사람이 생기면 어두워진다 (0.62)

        float target, from, t = 1f, duration;
        float flickerTimer, flickerMul = 1f;
        MaterialPropertyBlock mpb;
        static readonly int EmissionId = Shader.PropertyToID("_EmissionColor");
        static readonly Color PanelGlow = new Color(0.85f, 0.95f, 1.05f);

        public void Init(float level, bool flicker)
        {
            Level = target = from = level;
            Flicker = flicker;
            mpb = new MaterialPropertyBlock();
            Apply();
        }

        public void FadeTo(float level, float time)
        {
            from = Level;
            target = Mathf.Max(0f, level);
            duration = Mathf.Max(0.01f, time);
            t = 0f;
        }

        void Update()
        {
            if (t < 1f)
            {
                t += Time.deltaTime / duration;
                Level = Mathf.Lerp(from, target, Mathf.Clamp01(t));
            }
            if (Flicker && Level > 0.01f)
            {
                flickerTimer -= Time.deltaTime;
                if (flickerTimer <= 0f)
                {
                    bool off = Random.value < 0.35f;
                    flickerMul = off ? Random.Range(0f, 0.25f) : Random.Range(0.75f, 1.05f);
                    flickerTimer = off ? Random.Range(0.03f, 0.12f) : Random.Range(0.08f, 1.6f);
                }
            }
            else flickerMul = 1f;
            Apply();
        }

        void Apply()
        {
            float k = Level * flickerMul * Mood;
            if (Light != null)
            {
                Light.intensity = BaseIntensity * k;
                Light.enabled = k > 0.005f;
            }
            if (Panel != null && mpb != null)
            {
                Panel.GetPropertyBlock(mpb);
                mpb.SetColor(EmissionId, PanelGlow * Mathf.Clamp01(k) * 1.1f);
                Panel.SetPropertyBlock(mpb);
            }
        }
    }

    /// <summary>모니터 화면 (꺼짐 / CRT 재질 켜짐).</summary>
    public sealed class MonitorScreen : MonoBehaviour
    {
        public Renderer Screen;
        public Material DeadMaterial;
        public Light Glow;
        Material live;
        Coroutine anim;
        static readonly int PowerId = Shader.PropertyToID("_Power");

        public bool IsOn { get; private set; }

        public void TurnOn(BuildContext ctx, Texture tex, Color tint, float brightness, float time)
        {
            if (live == null) live = ctx.Mats.NewCrt(tex, tint, brightness, 0f);
            else live.mainTexture = tex;
            Screen.sharedMaterial = live;
            IsOn = true;
            if (anim != null) StopCoroutine(anim);
            anim = StartCoroutine(Power(0f, 1f, time));
        }

        public void TurnOff(float time)
        {
            if (!IsOn) return;
            IsOn = false;
            if (anim != null) StopCoroutine(anim);
            anim = StartCoroutine(Power(1f, 0f, time, true));
        }

        IEnumerator Power(float a, float b, float time, bool toDead = false)
        {
            float t = 0f;
            while (t < 1f)
            {
                t += Time.deltaTime / Mathf.Max(0.01f, time);
                float p = Mathf.Lerp(a, b, Mathf.Clamp01(t));
                if (live != null) live.SetFloat(PowerId, p);
                if (Glow != null) { Glow.enabled = p > 0.02f; Glow.intensity = 0.35f * p; }
                yield return null;
            }
            if (toDead && DeadMaterial != null) Screen.sharedMaterial = DeadMaterial;
            anim = null;
        }
    }

    /// <summary>책상 서랍 (앞으로 미끄러져 열린다).</summary>
    public sealed class DrawerSlide : MonoBehaviour
    {
        Vector3 closed;
        public bool IsOpen { get; private set; }

        void Awake() { closed = transform.localPosition; }

        public void Open(float distance = 0.28f, float time = 0.7f)
        {
            if (IsOpen) return;
            IsOpen = true;
            StartCoroutine(Slide(closed + new Vector3(0, 0, -distance), time));
        }

        IEnumerator Slide(Vector3 to, float time)
        {
            Vector3 from = transform.localPosition;
            float t = 0f;
            while (t < 1f)
            {
                t += Time.deltaTime / time;
                transform.localPosition = Vector3.Lerp(from, to, Mathf.SmoothStep(0f, 1f, Mathf.Clamp01(t)));
                yield return null;
            }
        }
    }

    /// <summary>벽시계. 이야기 진행 시각(clock 변수)에 맞춰 바늘이 움직인다.</summary>
    public sealed class WallClock : MonoBehaviour
    {
        public Transform Hour, Minute;
        public System.Func<string> ClockSource;
        float drift;

        void Update()
        {
            drift += Time.deltaTime / 20f; // 실제 20초 = 게임 1분
            string s = ClockSource != null ? ClockSource() : "";
            int h = 0, m = 0;
            if (!string.IsNullOrEmpty(s) && s.Length >= 4)
            {
                var parts = s.Split(':');
                if (parts.Length == 2)
                {
                    int.TryParse(parts[0], out h);
                    int.TryParse(parts[1], out m);
                }
            }
            float minutes = h * 60 + m + drift;
            if (Minute != null) Minute.localRotation = Quaternion.Euler(0, 0, -(minutes % 60f) * 6f);
            if (Hour != null) Hour.localRotation = Quaternion.Euler(0, 0, -((minutes / 60f) % 12f) * 30f);
        }

        public void ResetDrift() { drift = 0f; }
    }
}
