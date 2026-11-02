// 사무실 표면용 단순 조명 셰이더 (Built-in 파이프라인 Surface Shader).
// 변형 수를 줄여 빌드 시간을 짧게 유지한다.
Shader "NightEval/Lit"
{
    Properties
    {
        _Color ("Color", Color) = (1,1,1,1)
        _MainTex ("Albedo", 2D) = "white" {}
        _EmissionColor ("Emission", Color) = (0,0,0,0)
        _EmissionMap ("Emission Map", 2D) = "white" {}
        _SpecColor ("Specular", Color) = (0.25,0.27,0.3,1)
        _Gloss ("Gloss", Range(0.01,1)) = 0.1
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" }
        LOD 200

        CGPROGRAM
        #pragma surface surf BlinnPhong fullforwardshadows nolightmap nodynlightmap nodirlightmap nometa noinstancing
        #pragma target 3.0

        sampler2D _MainTex;
        sampler2D _EmissionMap;
        fixed4 _Color;
        fixed4 _EmissionColor;
        half _Gloss;

        struct Input
        {
            float2 uv_MainTex;
        };

        void surf (Input IN, inout SurfaceOutput o)
        {
            fixed4 c = tex2D(_MainTex, IN.uv_MainTex) * _Color;
            o.Albedo = c.rgb;
            o.Emission = tex2D(_EmissionMap, IN.uv_MainTex).rgb * _EmissionColor.rgb;
            o.Specular = max(_Gloss, 0.03);
            o.Gloss = _Gloss;
            o.Alpha = 1;
        }
        ENDCG
    }
    FallBack "Legacy Shaders/Diffuse"
}
