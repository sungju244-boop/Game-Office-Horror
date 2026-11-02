// 작은 JSON 파서. UnityEngine에 의존하지 않으므로 dotnet 테스트에서도 그대로 쓴다.
// 지원: 객체, 배열, 문자열, 숫자, true/false/null, // 한 줄 주석, 끝의 쉼표.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace NightEval.Story
{
    public static class MiniJson
    {
        public static object Parse(string json)
        {
            if (json == null) throw new ArgumentNullException(nameof(json));
            var p = new Parser(json);
            p.SkipWs();
            object v = p.ParseValue();
            p.SkipWs();
            if (!p.End) throw p.Error("JSON 뒤에 불필요한 문자가 있습니다");
            return v;
        }

        sealed class Parser
        {
            readonly string s;
            int i;

            public Parser(string text)
            {
                s = text;
                i = (s.Length > 0 && s[0] == '﻿') ? 1 : 0;
            }

            public bool End => i >= s.Length;

            public FormatException Error(string msg)
            {
                int line = 1;
                for (int k = 0; k < i && k < s.Length; k++) if (s[k] == '\n') line++;
                return new FormatException("JSON 오류 (줄 " + line + "): " + msg);
            }

            public void SkipWs()
            {
                while (i < s.Length)
                {
                    char c = s[i];
                    if (c == ' ' || c == '\t' || c == '\n' || c == '\r') { i++; continue; }
                    if (c == '/' && i + 1 < s.Length && s[i + 1] == '/')
                    {
                        while (i < s.Length && s[i] != '\n') i++;
                        continue;
                    }
                    break;
                }
            }

            public object ParseValue()
            {
                if (End) throw Error("예상치 못한 끝");
                char c = s[i];
                switch (c)
                {
                    case '{': return ParseObject();
                    case '[': return ParseArray();
                    case '"': return ParseString();
                    case 't': Expect("true"); return true;
                    case 'f': Expect("false"); return false;
                    case 'n': Expect("null"); return null;
                }
                if (c == '-' || (c >= '0' && c <= '9')) return ParseNumber();
                throw Error("예상치 못한 문자 '" + c + "'");
            }

            void Expect(string word)
            {
                if (i + word.Length > s.Length || string.CompareOrdinal(s, i, word, 0, word.Length) != 0)
                    throw Error(word + " 이(가) 필요합니다");
                i += word.Length;
            }

            Dictionary<string, object> ParseObject()
            {
                var d = new Dictionary<string, object>();
                i++;
                SkipWs();
                if (!End && s[i] == '}') { i++; return d; }
                while (true)
                {
                    SkipWs();
                    if (End || s[i] != '"') throw Error("키 문자열이 필요합니다");
                    string key = ParseString();
                    SkipWs();
                    if (End || s[i] != ':') throw Error("':' 이(가) 필요합니다");
                    i++;
                    SkipWs();
                    d[key] = ParseValue();
                    SkipWs();
                    if (End) throw Error("객체가 닫히지 않았습니다");
                    if (s[i] == ',')
                    {
                        i++;
                        SkipWs();
                        if (!End && s[i] == '}') { i++; return d; }
                        continue;
                    }
                    if (s[i] == '}') { i++; return d; }
                    throw Error("',' 또는 '}' 이(가) 필요합니다");
                }
            }

            List<object> ParseArray()
            {
                var list = new List<object>();
                i++;
                SkipWs();
                if (!End && s[i] == ']') { i++; return list; }
                while (true)
                {
                    SkipWs();
                    list.Add(ParseValue());
                    SkipWs();
                    if (End) throw Error("배열이 닫히지 않았습니다");
                    if (s[i] == ',')
                    {
                        i++;
                        SkipWs();
                        if (!End && s[i] == ']') { i++; return list; }
                        continue;
                    }
                    if (s[i] == ']') { i++; return list; }
                    throw Error("',' 또는 ']' 이(가) 필요합니다");
                }
            }

            string ParseString()
            {
                i++;
                var sb = new StringBuilder();
                while (true)
                {
                    if (End) throw Error("문자열이 닫히지 않았습니다");
                    char c = s[i++];
                    if (c == '"') break;
                    if (c != '\\') { sb.Append(c); continue; }
                    if (End) throw Error("잘못된 이스케이프");
                    char e = s[i++];
                    switch (e)
                    {
                        case '"': sb.Append('"'); break;
                        case '\\': sb.Append('\\'); break;
                        case '/': sb.Append('/'); break;
                        case 'b': sb.Append('\b'); break;
                        case 'f': sb.Append('\f'); break;
                        case 'n': sb.Append('\n'); break;
                        case 'r': sb.Append('\r'); break;
                        case 't': sb.Append('\t'); break;
                        case 'u':
                            if (i + 4 > s.Length) throw Error("잘못된 \\u 이스케이프");
                            sb.Append((char)Convert.ToInt32(s.Substring(i, 4), 16));
                            i += 4;
                            break;
                        default: throw Error("잘못된 이스케이프 \\" + e);
                    }
                }
                return sb.ToString();
            }

            object ParseNumber()
            {
                int start = i;
                if (s[i] == '-') i++;
                while (i < s.Length && "0123456789+-.eE".IndexOf(s[i]) >= 0) i++;
                string token = s.Substring(start, i - start);
                if (!double.TryParse(token, NumberStyles.Float, CultureInfo.InvariantCulture, out double v))
                    throw Error("잘못된 숫자 " + token);
                return v;
            }
        }

        // ---- 읽기 도우미 ----

        public static string Str(Dictionary<string, object> d, string key, string def = null)
        {
            if (d != null && d.TryGetValue(key, out object v) && v != null)
            {
                if (v is string str) return str;
                if (v is double dbl) return dbl.ToString(CultureInfo.InvariantCulture);
                if (v is bool b) return b ? "true" : "false";
                return Convert.ToString(v, CultureInfo.InvariantCulture);
            }
            return def;
        }

        public static float Num(Dictionary<string, object> d, string key, float def = 0f)
        {
            if (d != null && d.TryGetValue(key, out object v) && v != null)
            {
                if (v is double dbl) return (float)dbl;
                if (v is bool b) return b ? 1f : 0f;
                if (v is string str && float.TryParse(str, NumberStyles.Float, CultureInfo.InvariantCulture, out float f)) return f;
            }
            return def;
        }

        public static bool Bool(Dictionary<string, object> d, string key, bool def = false)
        {
            if (d != null && d.TryGetValue(key, out object v) && v != null)
            {
                if (v is bool b) return b;
                if (v is double dbl) return Math.Abs(dbl) > 0.0001;
                if (v is string str) return str == "true" || str == "1" || str == "yes";
            }
            return def;
        }

        public static bool Has(Dictionary<string, object> d, string key)
        {
            return d != null && d.ContainsKey(key) && d[key] != null;
        }

        public static List<object> List(Dictionary<string, object> d, string key)
        {
            if (d != null && d.TryGetValue(key, out object v) && v is List<object> list) return list;
            return new List<object>();
        }

        public static Dictionary<string, object> Obj(Dictionary<string, object> d, string key)
        {
            if (d != null && d.TryGetValue(key, out object v) && v is Dictionary<string, object> o) return o;
            return null;
        }

        /// <summary>문자열 하나 또는 문자열 배열을 모두 리스트로 읽는다.</summary>
        public static List<string> StrList(Dictionary<string, object> d, string key)
        {
            var result = new List<string>();
            if (d == null || !d.TryGetValue(key, out object v) || v == null) return result;
            if (v is string single) { result.Add(single); return result; }
            if (v is List<object> list)
            {
                foreach (object o in list)
                {
                    if (o == null) continue;
                    result.Add(o is string s ? s : Convert.ToString(o, CultureInfo.InvariantCulture));
                }
            }
            return result;
        }

        public static float[] Floats(Dictionary<string, object> d, string key)
        {
            var list = List(d, key);
            var arr = new float[list.Count];
            for (int k = 0; k < list.Count; k++)
                arr[k] = list[k] is double dbl ? (float)dbl : 0f;
            return arr;
        }
    }
}
