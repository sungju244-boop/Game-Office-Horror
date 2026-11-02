// 이야기 진행 상태(플래그·카운터·라벨). 모든 값은 문자열로 저장하고 필요할 때 숫자로 읽는다.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace NightEval.Story
{
    public sealed class StoryVars
    {
        readonly Dictionary<string, string> values = new Dictionary<string, string>();

        public IEnumerable<KeyValuePair<string, string>> All => values;

        public string Get(string key)
        {
            return key != null && values.TryGetValue(key, out string v) ? v : "";
        }

        public float GetNum(string key)
        {
            return float.TryParse(Get(key), NumberStyles.Float, CultureInfo.InvariantCulture, out float f) ? f : 0f;
        }

        /// <summary>빈 문자열, "0", "false"가 아니면 참.</summary>
        public bool Truthy(string key)
        {
            string v = Get(key);
            return v.Length > 0 && v != "0" && v != "false";
        }

        public void Set(string key, string value)
        {
            if (string.IsNullOrEmpty(key)) return;
            values[key] = value ?? "";
        }

        public void SetNum(string key, float value)
        {
            Set(key, value.ToString(CultureInfo.InvariantCulture));
        }

        public void Add(string key, float delta)
        {
            SetNum(key, GetNum(key) + delta);
        }

        public void Remove(string key)
        {
            if (key != null) values.Remove(key);
        }

        public void Clear()
        {
            values.Clear();
        }

        public StoryVars Clone()
        {
            var c = new StoryVars();
            foreach (var kv in values) c.values[kv.Key] = kv.Value;
            return c;
        }

        /// <summary>
        /// 연산 문자열 적용.
        ///   "key=value"  값 지정
        ///   "key+2" / "key-1"  숫자 더하기/빼기
        ///   "!key"  삭제
        ///   "key"   "1"로 지정
        /// </summary>
        public void Apply(string op)
        {
            if (string.IsNullOrWhiteSpace(op)) return;
            op = op.Trim();
            if (op[0] == '!') { Remove(op.Substring(1).Trim()); return; }

            int eq = op.IndexOf('=');
            if (eq > 0)
            {
                Set(op.Substring(0, eq).Trim(), op.Substring(eq + 1).Trim());
                return;
            }

            int plus = op.IndexOf('+');
            if (plus > 0 && TryNum(op.Substring(plus + 1), out float addVal))
            {
                Add(op.Substring(0, plus).Trim(), addVal);
                return;
            }

            int minus = op.LastIndexOf('-');
            if (minus > 0 && TryNum(op.Substring(minus + 1), out float subVal))
            {
                Add(op.Substring(0, minus).Trim(), -subVal);
                return;
            }

            Set(op, "1");
        }

        static bool TryNum(string s, out float f)
        {
            return float.TryParse(s.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out f);
        }

        /// <summary>문장 안의 {key} 를 현재 값으로 바꾼다. 값이 없으면 "—".</summary>
        public string Format(string text)
        {
            if (string.IsNullOrEmpty(text) || text.IndexOf('{') < 0) return text ?? "";
            var sb = new StringBuilder(text.Length + 16);
            int i = 0;
            while (i < text.Length)
            {
                char c = text[i];
                if (c == '{')
                {
                    int end = text.IndexOf('}', i + 1);
                    if (end > i + 1)
                    {
                        string key = text.Substring(i + 1, end - i - 1);
                        string v = Get(key);
                        sb.Append(v.Length > 0 ? v : "—");
                        i = end + 1;
                        continue;
                    }
                }
                sb.Append(c);
                i++;
            }
            return sb.ToString();
        }

        /// <summary>문장 안의 {key} 목록 (검증용).</summary>
        public static List<string> Tokens(string text)
        {
            var list = new List<string>();
            if (string.IsNullOrEmpty(text)) return list;
            int i = 0;
            while (true)
            {
                int start = text.IndexOf('{', i);
                if (start < 0) break;
                int end = text.IndexOf('}', start + 1);
                if (end < 0) break;
                list.Add(text.Substring(start + 1, end - start - 1));
                i = end + 1;
            }
            return list;
        }

        public override string ToString()
        {
            var sb = new StringBuilder();
            foreach (var kv in values) sb.Append(kv.Key).Append('=').Append(kv.Value).Append("; ");
            return sb.ToString();
        }
    }

    /// <summary>
    /// 조건식: "a & b | c" (| 가 & 보다 약함)
    ///   key, !key, key=v, key!=v, key>=n, key<=n, key>n, key<n
    /// </summary>
    public static class Condition
    {
        static readonly string[] Ops = { ">=", "<=", "!=", ">", "<", "=" };

        public static bool Eval(string expr, StoryVars vars)
        {
            if (string.IsNullOrWhiteSpace(expr)) return true;
            foreach (string orPart in expr.Split('|'))
            {
                bool all = true;
                foreach (string term in orPart.Split('&'))
                {
                    if (!Term(term.Trim(), vars)) { all = false; break; }
                }
                if (all) return true;
            }
            return false;
        }

        static bool Term(string t, StoryVars vars)
        {
            if (t.Length == 0) return true;
            foreach (string op in Ops)
            {
                int idx = t.IndexOf(op, StringComparison.Ordinal);
                if (idx <= 0) continue;
                string key = t.Substring(0, idx).Trim();
                string val = t.Substring(idx + op.Length).Trim();
                string cur = vars.Get(key);
                bool valIsNum = float.TryParse(val, NumberStyles.Float, CultureInfo.InvariantCulture, out float fv);
                bool curIsNum = cur.Length == 0 || float.TryParse(cur, NumberStyles.Float, CultureInfo.InvariantCulture, out _);
                float cv = vars.GetNum(key);
                switch (op)
                {
                    case ">=": return cv >= fv;
                    case "<=": return cv <= fv;
                    case ">": return cv > fv;
                    case "<": return cv < fv;
                    case "=": return (valIsNum && curIsNum) ? Math.Abs(cv - fv) < 0.0001f : cur == val;
                    case "!=": return (valIsNum && curIsNum) ? Math.Abs(cv - fv) >= 0.0001f : cur != val;
                }
            }
            if (t[0] == '!') return !vars.Truthy(t.Substring(1).Trim());
            return vars.Truthy(t);
        }

        /// <summary>조건식에 등장하는 변수 이름 (검증용).</summary>
        public static List<string> Keys(string expr)
        {
            var keys = new List<string>();
            if (string.IsNullOrWhiteSpace(expr)) return keys;
            foreach (string orPart in expr.Split('|'))
            {
                foreach (string raw in orPart.Split('&'))
                {
                    string t = raw.Trim().TrimStart('!');
                    if (t.Length == 0) continue;
                    int cut = t.Length;
                    foreach (string op in Ops)
                    {
                        int idx = t.IndexOf(op, StringComparison.Ordinal);
                        if (idx > 0 && idx < cut) cut = idx;
                    }
                    keys.Add(t.Substring(0, cut).Trim());
                }
            }
            return keys;
        }
    }
}
