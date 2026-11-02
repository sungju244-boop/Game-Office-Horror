using System.Collections.Generic;
using UnityEngine;

namespace NightEval.Director
{
    /// <summary>
    /// 환경음·음악·효과음. 모든 소리는 Resources/Audio 의 코드 합성 WAV (Tools/gen_audio.py 로 생성).
    /// 큰 소리·갑작스러운 비명은 쓰지 않는다.
    /// </summary>
    public sealed class AudioDirector : MonoBehaviour
    {
        sealed class Layer
        {
            public AudioSource Src;
            public float Target;
            public bool Music;
            public float Speed = 0.6f;
        }

        Settings settings;
        readonly Dictionary<string, Layer> layers = new Dictionary<string, Layer>();
        AudioSource steps, ui;
        string music = "none";
        int tension;
        bool humOn = true;
        readonly System.Random rng = new System.Random();

        public void Init(Settings s)
        {
            settings = s;
            AddLayer("title", "mus_title", true, true);
            AddLayer("drone", "mus_drone", true, true);
            AddLayer("tension", "mus_tension", true, true);
            AddLayer("chase", "mus_chase", true, true);
            AddLayer("ending", "mus_ending", true, false);
            AddLayer("hum", "amb_hum", false, true);
            AddLayer("room", "amb_room", false, true);
            layers["room"].Target = 0.35f;
            layers["hum"].Target = 0.22f;
            steps = gameObject.AddComponent<AudioSource>();
            steps.playOnAwake = false;
            steps.spatialBlend = 0f;
            ui = gameObject.AddComponent<AudioSource>();
            ui.playOnAwake = false;
            ui.spatialBlend = 0f;
            ui.ignoreListenerPause = true;
        }

        void AddLayer(string id, string clipName, bool isMusic, bool loop)
        {
            var src = gameObject.AddComponent<AudioSource>();
            src.clip = Res.Clip(clipName);
            src.loop = loop;
            src.playOnAwake = false;
            src.spatialBlend = 0f;
            src.volume = 0f;
            if (src.clip != null && loop) src.Play();
            layers[id] = new Layer { Src = src, Music = isMusic };
        }

        public void SetMusic(string mode)
        {
            music = mode;
            foreach (var kv in layers) if (kv.Value.Music) kv.Value.Target = 0f;
            switch (mode)
            {
                case "title":
                    layers["title"].Target = 0.55f;
                    break;
                case "game":
                    ApplyTension();
                    break;
                case "chase":
                    layers["chase"].Target = 0.62f;
                    layers["tension"].Target = 0.15f;
                    layers["chase"].Speed = 3f;
                    break;
                case "ending":
                    var e = layers["ending"];
                    e.Target = 0.6f;
                    e.Speed = 5f;
                    if (e.Src.clip != null) { e.Src.time = 0f; e.Src.Play(); }
                    layers["hum"].Target = 0f;
                    layers["room"].Target = 0.12f;
                    break;
            }
        }

        public void SetTension(int level)
        {
            tension = Mathf.Clamp(level, 0, 3);
            if (music == "game") ApplyTension();
        }

        void ApplyTension()
        {
            float[] drone = { 0.42f, 0.42f, 0.36f, 0.26f };
            float[] tens = { 0f, 0.16f, 0.36f, 0.55f };
            layers["drone"].Target = drone[tension];
            layers["tension"].Target = tens[tension];
            layers["drone"].Speed = layers["tension"].Speed = 0.25f;
        }

        public void SetHum(bool on, float time)
        {
            humOn = on;
            var h = layers["hum"];
            h.Target = on ? 0.22f : 0f;
            h.Speed = 0.22f / Mathf.Max(0.05f, time);
        }

        public void SilenceAll()
        {
            foreach (var kv in layers) { kv.Value.Target = 0f; kv.Value.Speed = 2f; }
        }

        void Update()
        {
            if (settings == null) return;
            float dt = Time.unscaledDeltaTime;
            foreach (var kv in layers)
            {
                var l = kv.Value;
                float target = l.Target * (l.Music ? settings.MusicVolume : 1f);
                l.Src.volume = Mathf.MoveTowards(l.Src.volume, target, l.Speed * dt);
            }
            AudioListener.volume = settings.MasterVolume;
        }

        // ---------- 효과음 ----------

        public AudioSource PlayAt(string clipName, Vector3 pos, float volume = 1f, float pitchJitter = 0.04f, float maxDistance = 18f)
        {
            var c = Res.Clip(clipName);
            if (c == null) return null;
            var go = new GameObject("Sfx_" + clipName);
            go.transform.SetParent(transform, false);
            go.transform.position = pos;
            var s = go.AddComponent<AudioSource>();
            s.clip = c;
            s.volume = volume;
            s.pitch = 1f + (float)(rng.NextDouble() * 2.0 - 1.0) * pitchJitter;
            s.spatialBlend = 1f;
            s.rolloffMode = AudioRolloffMode.Linear;
            s.minDistance = 1f;
            s.maxDistance = maxDistance;
            s.dopplerLevel = 0f;
            s.Play();
            Destroy(go, c.length / Mathf.Max(0.5f, s.pitch) + 0.2f);
            return s;
        }

        public void Play2D(string clipName, float volume = 1f, bool ignorePause = false)
        {
            var c = Res.Clip(clipName);
            if (c == null) return;
            (ignorePause ? ui : steps).PlayOneShot(c, volume);
        }

        public void Ui(string clipName, float volume = 0.4f)
        {
            Play2D(clipName, volume, true);
        }

        public AudioSource Loop3D(string clipName, Transform parent, float volume, float minDist, float maxDist)
        {
            var c = Res.Clip(clipName);
            if (c == null || parent == null) return null;
            var go = new GameObject("Loop_" + clipName);
            go.transform.SetParent(parent, false);
            var s = go.AddComponent<AudioSource>();
            s.clip = c;
            s.loop = true;
            s.volume = volume;
            s.spatialBlend = 1f;
            s.rolloffMode = AudioRolloffMode.Linear;
            s.minDistance = minDist;
            s.maxDistance = maxDist;
            s.dopplerLevel = 0f;
            s.time = (float)(rng.NextDouble() * c.length * 0.9);
            s.Play();
            return s;
        }

        public void Step(bool tile, bool sprint)
        {
            int n = rng.Next(1, 5);
            Play2D((tile ? "sfx_step_tile_" : "sfx_step_carpet_") + n, (tile ? 0.42f : 0.3f) * (sprint ? 1.3f : 1f));
        }
    }
}
