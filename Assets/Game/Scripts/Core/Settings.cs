using UnityEngine;

namespace NightEval
{
    /// <summary>플레이어 설정. PlayerPrefs에 저장되며 재시작해도 유지된다.</summary>
    public sealed class Settings
    {
        public float Brightness = 0.5f;      // 0~1
        public float MasterVolume = 0.8f;    // 0~1
        public float MusicVolume = 0.7f;     // 0~1
        public float MouseSensitivity = 0.45f; // 0~1
        public bool Chicken;                 // 겁쟁이 모드
        public bool English;                 // 언어: 영어

        public const int EndingCount = 6;

        public static Settings Load()
        {
            return new Settings
            {
                Brightness = PlayerPrefs.GetFloat("ne_brightness", 0.5f),
                MasterVolume = PlayerPrefs.GetFloat("ne_master", 0.8f),
                MusicVolume = PlayerPrefs.GetFloat("ne_music", 0.7f),
                MouseSensitivity = PlayerPrefs.GetFloat("ne_sens", 0.45f),
                Chicken = PlayerPrefs.GetInt("ne_chicken", 0) == 1,
                English = PlayerPrefs.GetInt("ne_lang_en", 0) == 1
            };
        }

        public void Save()
        {
            PlayerPrefs.SetFloat("ne_brightness", Brightness);
            PlayerPrefs.SetFloat("ne_master", MasterVolume);
            PlayerPrefs.SetFloat("ne_music", MusicVolume);
            PlayerPrefs.SetFloat("ne_sens", MouseSensitivity);
            PlayerPrefs.SetInt("ne_chicken", Chicken ? 1 : 0);
            PlayerPrefs.SetInt("ne_lang_en", English ? 1 : 0);
            PlayerPrefs.Save();
        }

        /// <summary>마우스 감도 슬라이더 → 실제 배율.</summary>
        public float LookMultiplier => Mathf.Lerp(0.5f, 4.5f, MouseSensitivity);

        public static bool HasEnding(int number) => PlayerPrefs.GetInt("ne_end_" + number, 0) == 1;

        public static void MarkEnding(int number)
        {
            if (number <= 0) return;
            PlayerPrefs.SetInt("ne_end_" + number, 1);
            PlayerPrefs.Save();
        }

        public static int EndingsFound()
        {
            int n = 0;
            for (int i = 1; i <= EndingCount; i++) if (HasEnding(i)) n++;
            return n;
        }
    }
}
