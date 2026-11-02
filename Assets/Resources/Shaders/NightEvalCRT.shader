// CRT 모니터 화면. 곡률·주사선·노이즈·지지직(_Glitch)·전원 꺼짐(_Power).
// 곡률 함수는 TerminalSeat.CrtCurve(C#)와 같아야 마우스 클릭 위치가 맞는다.
Shader "NightEval/CRT"
{
    Properties
    {
        _MainTex ("Screen", 2D) = "black" {}
        _Tint ("Tint", Color) = (0.78,0.9,1,1)
        _Brightness ("Brightness", Float) = 1.35
        _Glitch ("Glitch", Range(0,1)) = 0
        _Power ("Power", Range(0,1)) = 1
        _Curve ("Curvature", Float) = 0.06
        _Noise ("Noise", Range(0,1)) = 0.05
        _Lines ("Scanlines", Float) = 384
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" }
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fog
            #include "UnityCG.cginc"

            sampler2D _MainTex;
            float4 _Tint;
            float _Brightness, _Glitch, _Power, _Curve, _Noise, _Lines;

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                UNITY_FOG_COORDS(1)
            };

            v2f vert (appdata_base v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = v.texcoord.xy;
                UNITY_TRANSFER_FOG(o, o.pos);
                return o;
            }

            float hash (float2 p)
            {
                return frac(sin(dot(p, float2(12.9898, 78.233))) * 43758.5453);
            }

            float2 crtCurve (float2 uv)
            {
                float2 c = uv * 2.0 - 1.0;
                c *= 1.0 + _Curve * dot(c, c);
                return c * 0.5 + 0.5;
            }

            fixed4 frag (v2f i) : SV_Target
            {
                float t = _Time.y;
                float2 uv = crtCurve(i.uv);

                // 전원: 세로로 접히며 꺼진다
                float p = saturate(_Power);
                float squeeze = lerp(0.004, 1.0, saturate(p * 1.25));
                uv.y = (uv.y - 0.5) / squeeze + 0.5;

                // 지지직: 가로 띠가 밀리고 화면이 살짝 흔들림
                float g = saturate(_Glitch);
                float band = floor(uv.y * 28.0);
                float tick = floor(t * 14.0);
                float r = hash(float2(band, tick));
                float shift = (r > 1.0 - g * 0.7) ? (hash(float2(band + 3.1, tick)) - 0.5) * 0.16 * g : 0.0;
                uv.x += shift + sin(t * 37.0 + uv.y * 9.0) * 0.004 * g;
                uv.y += (hash(float2(tick, 7.7)) - 0.5) * 0.02 * g * step(0.82, hash(float2(tick, 1.3)));

                float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);

                float ca = 0.0012 + g * 0.012;
                float3 col;
                col.r = tex2D(_MainTex, uv + float2(ca, 0)).r;
                col.g = tex2D(_MainTex, uv).g;
                col.b = tex2D(_MainTex, uv - float2(ca, 0)).b;

                // 주사선 + 느린 롤링 밴드
                float scan = 0.80 + 0.20 * sin(uv.y * _Lines * 3.14159);
                float roll = 0.94 + 0.06 * sin((uv.y + t * 0.07) * 6.2831);
                col *= scan * roll;

                // 노이즈
                float n = hash(floor(uv * float2(512.0, 384.0)) + frac(t * 3.7) * 91.0);
                col += (n - 0.5) * (_Noise + g * 0.35);

                // 깜빡임과 가장자리 어둡게
                col *= 0.965 + 0.035 * sin(t * 59.0);
                float2 d = i.uv - 0.5;
                float vig = saturate(1.0 - dot(d, d) * 1.7);

                col = max(col, 0.0) * _Tint.rgb * _Brightness * vig * inside;
                // 꺼진 화면도 형광체가 아주 약하게 남아 있다
                col += float3(0.008, 0.012, 0.016) * inside;
                // 전원 접힘 순간의 밝은 선
                col += float3(0.6, 0.8, 1.0) * (1.0 - smoothstep(0.0, 0.02, abs(i.uv.y - 0.5))) * saturate(1.0 - p) * step(0.02, p);
                col *= saturate(p * 4.0) * 0.98 + 0.02;

                UNITY_APPLY_FOG(i.fogCoord, col);
                return fixed4(col, 1.0);
            }
            ENDCG
        }
    }
    FallBack "Unlit/Texture"
}
