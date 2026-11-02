using System.Collections.Generic;
using UnityEngine;

namespace NightEval.World
{
    /// <summary>
    /// 로우폴리 메시 생성기. 면마다 법선을 따로 두어 각진(플랫) 음영을 만든다.
    /// UV는 기본적으로 "미터 단위"라서 재질 하나로 크기가 다른 물체에도 텍스처 밀도가 같다.
    /// </summary>
    public sealed class MeshBuilder
    {
        readonly List<Vector3> v = new List<Vector3>();
        readonly List<Vector3> n = new List<Vector3>();
        readonly List<Vector2> uv = new List<Vector2>();
        readonly List<int> tri = new List<int>();

        /// <summary>사각형 면 추가. 꼭짓점 순서와 상관없이 normal 쪽에서 보이도록 감는 방향을 자동 보정한다.</summary>
        public void Quad(Vector3 a, Vector3 b, Vector3 c, Vector3 d, Vector3 normal, Vector2 ua, Vector2 ub, Vector2 uc, Vector2 ud)
        {
            int i = v.Count;
            v.Add(a); v.Add(b); v.Add(c); v.Add(d);
            n.Add(normal); n.Add(normal); n.Add(normal); n.Add(normal);
            uv.Add(ua); uv.Add(ub); uv.Add(uc); uv.Add(ud);
            bool flip = Vector3.Dot(Vector3.Cross(b - a, c - a), normal) < 0f;
            if (!flip) { tri.Add(i); tri.Add(i + 1); tri.Add(i + 2); tri.Add(i); tri.Add(i + 2); tri.Add(i + 3); }
            else { tri.Add(i); tri.Add(i + 2); tri.Add(i + 1); tri.Add(i); tri.Add(i + 3); tri.Add(i + 2); }
        }

        public void Triangle(Vector3 a, Vector3 b, Vector3 c, Vector3 normal, Vector2 ua, Vector2 ub, Vector2 uc)
        {
            int i = v.Count;
            v.Add(a); v.Add(b); v.Add(c);
            n.Add(normal); n.Add(normal); n.Add(normal);
            uv.Add(ua); uv.Add(ub); uv.Add(uc);
            bool flip = Vector3.Dot(Vector3.Cross(b - a, c - a), normal) < 0f;
            if (!flip) { tri.Add(i); tri.Add(i + 1); tri.Add(i + 2); }
            else { tri.Add(i); tri.Add(i + 2); tri.Add(i + 1); }
        }

        /// <summary>평면 사각형: 법선에서 UV 축을 골라 미터 단위 UV를 만든다.</summary>
        public void QuadAutoUV(Vector3 a, Vector3 b, Vector3 c, Vector3 d, Vector3 normal, float uvWorld)
        {
            Axes(normal, out Vector3 ax, out Vector3 ay);
            float s = uvWorld > 0f ? 1f / uvWorld : 1f;
            Quad(a, b, c, d, normal,
                new Vector2(Vector3.Dot(a, ax), Vector3.Dot(a, ay)) * s,
                new Vector2(Vector3.Dot(b, ax), Vector3.Dot(b, ay)) * s,
                new Vector2(Vector3.Dot(c, ax), Vector3.Dot(c, ay)) * s,
                new Vector2(Vector3.Dot(d, ax), Vector3.Dot(d, ay)) * s);
        }

        static void Axes(Vector3 normal, out Vector3 ax, out Vector3 ay)
        {
            Vector3 an = new Vector3(Mathf.Abs(normal.x), Mathf.Abs(normal.y), Mathf.Abs(normal.z));
            if (an.y >= an.x && an.y >= an.z) { ax = Vector3.right; ay = Vector3.forward; }
            // 면을 정면에서 바라본 사람의 "오른쪽"이 u+ 가 되도록 고른다 (글자가 뒤집히지 않게).
            else if (an.x >= an.z) { ax = Vector3.forward * Mathf.Sign(normal.x); ay = Vector3.up; }
            else { ax = Vector3.right * -Mathf.Sign(normal.z); ay = Vector3.up; }
        }

        public Mesh ToMesh(string name)
        {
            var m = new Mesh { name = name };
            if (v.Count > 65000) m.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;
            m.SetVertices(v);
            m.SetNormals(n);
            m.SetUVs(0, uv);
            m.SetTriangles(tri, 0);
            m.RecalculateBounds();
            return m;
        }
    }

    public static class MeshKit
    {
        /// <summary>중심 기준 상자. uvWorld&gt;0: 미터 단위 UV, uvWorld&lt;=0: 면마다 0~1 (fit).</summary>
        public static Mesh Box(Vector3 size, float uvWorld = 1f)
        {
            var b = new MeshBuilder();
            Vector3 h = size * 0.5f;
            Vector3[] c =
            {
                new Vector3(-h.x, -h.y, -h.z), new Vector3(h.x, -h.y, -h.z), new Vector3(h.x, h.y, -h.z), new Vector3(-h.x, h.y, -h.z),
                new Vector3(-h.x, -h.y, h.z), new Vector3(h.x, -h.y, h.z), new Vector3(h.x, h.y, h.z), new Vector3(-h.x, h.y, h.z)
            };
            if (uvWorld > 0f)
            {
                b.QuadAutoUV(c[0], c[1], c[2], c[3], Vector3.back, uvWorld);
                b.QuadAutoUV(c[5], c[4], c[7], c[6], Vector3.forward, uvWorld);
                b.QuadAutoUV(c[4], c[0], c[3], c[7], Vector3.left, uvWorld);
                b.QuadAutoUV(c[1], c[5], c[6], c[2], Vector3.right, uvWorld);
                b.QuadAutoUV(c[3], c[2], c[6], c[7], Vector3.up, uvWorld);
                b.QuadAutoUV(c[4], c[5], c[1], c[0], Vector3.down, uvWorld);
            }
            else
            {
                Vector2 u0 = new Vector2(0, 0), u1 = new Vector2(1, 0), u2 = new Vector2(1, 1), u3 = new Vector2(0, 1);
                // 앞(-z): 바라보는 사람 기준 왼쪽→오른쪽 = -x→+x
                b.Quad(c[0], c[1], c[2], c[3], Vector3.back, u0, u1, u2, u3);
                // 뒤(+z): 바라보는 사람 기준 왼쪽→오른쪽 = +x→-x
                b.Quad(c[5], c[4], c[7], c[6], Vector3.forward, u0, u1, u2, u3);
                b.Quad(c[4], c[0], c[3], c[7], Vector3.left, u0, u1, u2, u3);
                b.Quad(c[1], c[5], c[6], c[2], Vector3.right, u0, u1, u2, u3);
                b.Quad(c[3], c[2], c[6], c[7], Vector3.up, u0, u1, u2, u3);
                b.Quad(c[4], c[5], c[1], c[0], Vector3.down, u0, u1, u2, u3);
            }
            return b.ToMesh("Box");
        }

        /// <summary>-Z 방향을 바라보는 사각형(유니티 기본 Quad와 같은 방향). UV는 0~1, 보는 사람 기준 왼쪽이 u=0.</summary>
        public static Mesh Quad(Vector2 size)
        {
            var b = new MeshBuilder();
            float x = size.x * 0.5f, y = size.y * 0.5f;
            b.Quad(new Vector3(-x, -y, 0), new Vector3(x, -y, 0), new Vector3(x, y, 0), new Vector3(-x, y, 0), Vector3.back,
                new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1));
            return b.ToMesh("Quad");
        }

        /// <summary>앞면(-z, 크기 front)에서 뒷면(+z, 크기 back)으로 좁아지는 사다리꼴 상자 (CRT 뒤통수).</summary>
        public static Mesh Frustum(Vector2 front, Vector2 back, float depth, float backDrop, float uvWorld = 0.5f)
        {
            var b = new MeshBuilder();
            float z0 = -depth * 0.5f, z1 = depth * 0.5f;
            Vector3 f0 = new Vector3(-front.x / 2, -front.y / 2, z0), f1 = new Vector3(front.x / 2, -front.y / 2, z0);
            Vector3 f2 = new Vector3(front.x / 2, front.y / 2, z0), f3 = new Vector3(-front.x / 2, front.y / 2, z0);
            Vector3 k0 = new Vector3(-back.x / 2, -back.y / 2 - backDrop, z1), k1 = new Vector3(back.x / 2, -back.y / 2 - backDrop, z1);
            Vector3 k2 = new Vector3(back.x / 2, back.y / 2 - backDrop, z1), k3 = new Vector3(-back.x / 2, back.y / 2 - backDrop, z1);
            AddFace(b, f0, f1, f2, f3, Vector3.back, uvWorld);
            AddFace(b, k1, k0, k3, k2, Vector3.forward, uvWorld);
            AddFace(b, k0, f0, f3, k3, Vector3.left, uvWorld);
            AddFace(b, f1, k1, k2, f2, Vector3.right, uvWorld);
            AddFace(b, f3, f2, k2, k3, Vector3.up, uvWorld);
            AddFace(b, k0, k1, f1, f0, Vector3.down, uvWorld);
            return b.ToMesh("Frustum");
        }

        static void AddFace(MeshBuilder b, Vector3 a, Vector3 c1, Vector3 c2, Vector3 d, Vector3 hint, float uvWorld)
        {
            Vector3 nrm = Vector3.Cross(c1 - a, c2 - a).normalized;
            if (nrm.sqrMagnitude < 0.5f) nrm = hint;
            if (Vector3.Dot(nrm, hint) < 0f) nrm = -nrm;
            b.QuadAutoUV(a, c1, c2, d, nrm, uvWorld);
        }

        /// <summary>Y축 원기둥 (중심 기준).</summary>
        public static Mesh Cylinder(float radius, float height, int sides = 10, bool caps = true, float uvWorld = 0.5f)
        {
            var b = new MeshBuilder();
            float y0 = -height / 2f, y1 = height / 2f;
            float s = uvWorld > 0 ? 1f / uvWorld : 1f;
            for (int k = 0; k < sides; k++)
            {
                float a0 = k * Mathf.PI * 2f / sides, a1 = (k + 1) * Mathf.PI * 2f / sides;
                Vector3 p0 = new Vector3(Mathf.Cos(a0) * radius, 0, Mathf.Sin(a0) * radius);
                Vector3 p1 = new Vector3(Mathf.Cos(a1) * radius, 0, Mathf.Sin(a1) * radius);
                Vector3 mid = ((p0 + p1) * 0.5f).normalized;
                float u0 = k * (2f * Mathf.PI * radius / sides) * s, u1 = (k + 1) * (2f * Mathf.PI * radius / sides) * s;
                b.Quad(p0 + Vector3.up * y0, p1 + Vector3.up * y0, p1 + Vector3.up * y1, p0 + Vector3.up * y1, mid,
                    new Vector2(u0, y0 * s), new Vector2(u1, y0 * s), new Vector2(u1, y1 * s), new Vector2(u0, y1 * s));
                if (caps)
                {
                    b.Triangle(Vector3.up * y1, p0 + Vector3.up * y1, p1 + Vector3.up * y1, Vector3.up,
                        new Vector2(0.5f, 0.5f), new Vector2(p0.x * s, p0.z * s), new Vector2(p1.x * s, p1.z * s));
                    b.Triangle(Vector3.up * y0, p1 + Vector3.up * y0, p0 + Vector3.up * y0, Vector3.down,
                        new Vector2(0.5f, 0.5f), new Vector2(p1.x * s, p1.z * s), new Vector2(p0.x * s, p0.z * s));
                }
            }
            return b.ToMesh("Cylinder");
        }

        /// <summary>점들을 잇는 관(케이블). 월드/로컬 좌표 그대로 쓴다.</summary>
        public static Mesh Tube(IList<Vector3> pts, float radius, int sides = 5)
        {
            var b = new MeshBuilder();
            if (pts.Count < 2) return b.ToMesh("Tube");
            var rings = new List<Vector3[]>();
            Vector3 prevUp = Vector3.up;
            for (int i = 0; i < pts.Count; i++)
            {
                Vector3 dir = i < pts.Count - 1 ? pts[i + 1] - pts[i] : pts[i] - pts[i - 1];
                if (i > 0 && i < pts.Count - 1) dir = pts[i + 1] - pts[i - 1];
                dir = dir.sqrMagnitude > 1e-8f ? dir.normalized : Vector3.forward;
                Vector3 side = Vector3.Cross(dir, prevUp);
                if (side.sqrMagnitude < 1e-6f) side = Vector3.Cross(dir, Vector3.right);
                side.Normalize();
                Vector3 up = Vector3.Cross(side, dir).normalized;
                prevUp = up;
                var ring = new Vector3[sides];
                for (int k = 0; k < sides; k++)
                {
                    float a = k * Mathf.PI * 2f / sides;
                    ring[k] = pts[i] + (side * Mathf.Cos(a) + up * Mathf.Sin(a)) * radius;
                }
                rings.Add(ring);
            }
            for (int i = 0; i < rings.Count - 1; i++)
            {
                for (int k = 0; k < sides; k++)
                {
                    int k1 = (k + 1) % sides;
                    Vector3 a = rings[i][k], bb = rings[i][k1], c = rings[i + 1][k1], d = rings[i + 1][k];
                    Vector3 center = (pts[i] + pts[i + 1]) * 0.5f;
                    Vector3 nrm = ((a + bb + c + d) * 0.25f - center).normalized;
                    b.Quad(a, bb, c, d, nrm, Vector2.zero, Vector2.right, Vector2.one, Vector2.up);
                }
            }
            return b.ToMesh("Tube");
        }

        /// <summary>두 점 사이로 늘어진 케이블 점들 (포물선 근사).</summary>
        public static List<Vector3> Sag(Vector3 a, Vector3 b, float sag, int segments = 14)
        {
            var list = new List<Vector3>(segments + 1);
            for (int i = 0; i <= segments; i++)
            {
                float t = i / (float)segments;
                Vector3 p = Vector3.Lerp(a, b, t);
                p.y -= sag * 4f * t * (1f - t);
                list.Add(p);
            }
            return list;
        }
    }
}
