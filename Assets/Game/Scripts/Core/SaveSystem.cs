// 자동 저장 (브라우저판 web/js/shared.js 의 saves 와 같은 규칙):
//   장 시작마다 → 장 선택용 + 이어하기 / 로그 선택 직전마다 → "직전 선택부터" + 이어하기.
// PlayerPrefs 에 "노드|키=값;키=값" 문자열로 둔다 (값 안의 ; = | 는 바꿔 적는다).
using System.Collections.Generic;
using System.Text;
using NightEval.Story;
using UnityEngine;

namespace NightEval
{
    public sealed class SaveSnap
    {
        public string Node = "";
        public string Chapter = "";
        public StoryVars Vars = new StoryVars();
    }

    public static class SaveSystem
    {
        const string Prefix = "ne2_";

        public static SaveSnap Last() => Get(Prefix + "save_last");
        public static SaveSnap Choice() => Get(Prefix + "save_choice");
        public static SaveSnap Chapter(string id) => Get(Prefix + "save_ch_" + id);

        public static List<string> Reached()
        {
            string s = PlayerPrefs.GetString(Prefix + "chapters_reached", "");
            return s.Length == 0 ? new List<string>() : new List<string>(s.Split(','));
        }

        /// <summary>kind: "chapter" 또는 "choice"</summary>
        public static void Put(string kind, string node, StoryVars vars, string chapter)
        {
            string data = Encode(node, chapter, vars);
            if (kind == "chapter" && !string.IsNullOrEmpty(chapter))
            {
                PlayerPrefs.SetString(Prefix + "save_ch_" + chapter, data);
                var r = Reached();
                if (!r.Contains(chapter)) { r.Add(chapter); PlayerPrefs.SetString(Prefix + "chapters_reached", string.Join(",", r)); }
            }
            if (kind == "choice") PlayerPrefs.SetString(Prefix + "save_choice", data);
            PlayerPrefs.SetString(Prefix + "save_last", data);
            PlayerPrefs.Save();
        }

        static string Esc(string s) => (s ?? "").Replace("%", "%25").Replace(";", "%3B").Replace("=", "%3D").Replace("|", "%7C");
        static string Unesc(string s) => (s ?? "").Replace("%7C", "|").Replace("%3D", "=").Replace("%3B", ";").Replace("%25", "%");

        static string Encode(string node, string chapter, StoryVars vars)
        {
            var sb = new StringBuilder();
            sb.Append(Esc(node)).Append('|').Append(Esc(chapter)).Append('|');
            bool first = true;
            foreach (var kv in vars.All)
            {
                if (!first) sb.Append(';');
                first = false;
                sb.Append(Esc(kv.Key)).Append('=').Append(Esc(kv.Value));
            }
            return sb.ToString();
        }

        static SaveSnap Get(string key)
        {
            string s = PlayerPrefs.GetString(key, "");
            if (s.Length == 0) return null;
            var parts = s.Split('|');
            if (parts.Length < 3) return null;
            var snap = new SaveSnap { Node = Unesc(parts[0]), Chapter = Unesc(parts[1]) };
            foreach (string kv in parts[2].Split(';'))
            {
                int eq = kv.IndexOf('=');
                if (eq > 0) snap.Vars.Set(Unesc(kv.Substring(0, eq)), Unesc(kv.Substring(eq + 1)));
            }
            return snap.Node.Length > 0 ? snap : null;
        }
    }
}
