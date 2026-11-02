// 화면 후처리: 밝기(감마/노출), 차가운 색조, 비네팅, 필름 그레인, 색수차, 순간 잡음.
Shader "Hidden/NightEval/PostFX"
{
    Properties
    {
        _MainTex ("Source", 2D) = "white" {}
    }
    SubShader
    {
        ZTest Always Cull Off ZWrite Off
        Pass
        {
            CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment frag
            #include "UnityCG.cginc"

            sampler2D _MainTex;
            float _Gamma, _Exposure, _Vignette, _Grain, _Chroma, _Flash, _Desat, _Fade;
            float4 _Tint;

            float hash (float2 p)
            {
                return frac(sin(dot(p, float2(12.9898, 78.233))) * 43758.5453);
            }

            fixed4 frag (v2f_img i) : SV_Target
            {
                float2 uv = i.uv;
                float2 d = uv - 0.5;
                float ca = _Chroma * dot(d, d);
                float3 c;
                c.r = tex2D(_MainTex, uv - d * ca).r;
                c.g = tex2D(_MainTex, uv).g;
                c.b = tex2D(_MainTex, uv + d * ca).b;

                c *= _Exposure;
                c = pow(max(c, 0.0), _Gamma);
                float l = dot(c, float3(0.299, 0.587, 0.114));
                c = lerp(c, l.xxx, _Desat) * _Tint.rgb;
                c *= lerp(1.0, saturate(1.0 - dot(d, d) * 2.0), _Vignette);

                float n = hash(uv * _ScreenParams.xy + frac(_Time.y * 7.13) * 61.7) - 0.5;
                c += n * _Grain;

                float band = step(0.7, hash(float2(floor(uv.y * 40.0), floor(_Time.y * 20.0))));
                c = lerp(c, float3(0.55, 0.68, 0.75) * (0.4 + n), _Flash * band);
                c *= (1.0 - _Fade);
                return fixed4(max(c, 0.0), 1.0);
            }
            ENDCG
        }
    }
    FallBack Off
}
