// 화면 문구 언어 (브라우저판 web/js/i18n.js 의 t(ko, en) 과 같은 역할). 이야기 문장은 lang_en.json 사전으로 바꾼다.
namespace NightEval
{
    public static class L
    {
        /// <summary>true = English</summary>
        public static bool En;
        public static string T(string ko, string en) => En ? en : ko;
    }
}
