using System.Collections.Generic;
using UnityEngine;

namespace NightEval.World
{
    public static class Layers
    {
        public const int Default = 0;
        public const int IgnoreRaycast = 2;
        public const int Avatar = 30;     // CCTV에만 보이는 플레이어 몸
        public const int Terminal = 31;   // 단말기 화면 UI (렌더텍스처 전용)

        public static int WorldMask => ~((1 << IgnoreRaycast) | (1 << Avatar) | (1 << Terminal));
    }

    public sealed class CrtParts
    {
        public GameObject Root;
        public Renderer Screen;
        public Transform ScreenTransform;
        public Renderer Led;
    }

    /// <summary>
    /// 코드로 만드는 로우폴리 소품. 물체의 "앞"(사람이 쓰는 쪽)은 로컬 -Z.
    /// 외부 모델이 Resources/Models/&lt;이름&gt; 에 있으면 그것을 우선 사용할 수 있도록 TryModel 을 둔다.
    /// </summary>
    public sealed class PropFactory
    {
        readonly BuildContext ctx;
        MatLib M => ctx.Mats;

        public PropFactory(BuildContext ctx) { this.ctx = ctx; }

        // ---------- 기본 도형 ----------

        public GameObject Node(Transform parent, string name, Vector3 localPos, float yaw = 0f)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            go.transform.localRotation = Quaternion.Euler(0f, yaw, 0f);
            return go;
        }

        public GameObject Mesh(Transform parent, string name, Mesh mesh, Material mat, Vector3 lp, Vector3 euler, bool shadows = true)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = lp;
            go.transform.localRotation = Quaternion.Euler(euler);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = mat;
            r.shadowCastingMode = shadows ? UnityEngine.Rendering.ShadowCastingMode.On : UnityEngine.Rendering.ShadowCastingMode.Off;
            return go;
        }

        public GameObject Box(Transform parent, string name, Vector3 size, Vector3 lp, string mat, Vector3 euler = default, float uvWorld = 1f, bool collider = false)
        {
            var go = Mesh(parent, name, ctx.BoxMesh(size, uvWorld), M.Get(mat), lp, euler);
            if (collider) go.AddComponent<BoxCollider>().size = size;
            return go;
        }

        public GameObject Quad(Transform parent, string name, Vector2 size, Vector3 lp, Vector3 euler, Material mat, bool collider = false)
        {
            var go = Mesh(parent, name, ctx.QuadMesh(size), mat, lp, euler, false);
            if (collider)
            {
                var bc = go.AddComponent<BoxCollider>();
                bc.size = new Vector3(size.x, size.y, 0.02f);
            }
            return go;
        }

        public GameObject Cyl(Transform parent, string name, float r, float h, Vector3 lp, string mat, Vector3 euler = default, int sides = 10)
        {
            return Mesh(parent, name, ctx.CylMesh(r, h, sides), M.Get(mat), lp, euler);
        }

        public GameObject Cable(Transform parent, IList<Vector3> pts, float radius = 0.011f)
        {
            var mesh = ctx.Own(MeshKit.Tube(pts, radius, 5));
            return Mesh(parent, "Cable", mesh, M.Get("cable"), Vector3.zero, Vector3.zero);
        }

        public static BoxCollider AddCollider(GameObject go, Vector3 center, Vector3 size)
        {
            var bc = go.AddComponent<BoxCollider>();
            bc.center = center;
            bc.size = size;
            return bc;
        }

        /// <summary>Resources/Models/&lt;name&gt; 프리팹이 있으면 그것을 배치한다 (나중에 실제 에셋으로 교체할 때).</summary>
        public GameObject TryModel(Transform parent, string name, Vector3 lp, float yaw)
        {
            var prefab = Resources.Load<GameObject>("Models/" + name);
            if (prefab == null) return null;
            var go = Object.Instantiate(prefab, parent);
            go.transform.localPosition = lp;
            go.transform.localRotation = Quaternion.Euler(0, yaw, 0);
            return go;
        }

        // ---------- 책상 ----------

        public GameObject Desk(Transform parent, string id, Vector3 pos, float rot, bool partition, bool pedestal, out DrawerSlide drawer)
        {
            drawer = null;
            var root = Node(parent, string.IsNullOrEmpty(id) ? "Desk" : id, pos, rot);
            var t = root.transform;
            Box(t, "Top", new Vector3(1.4f, 0.03f, 0.7f), new Vector3(0, 0.735f, 0), "desk_top");
            Box(t, "Edge", new Vector3(1.4f, 0.032f, 0.012f), new Vector3(0, 0.735f, -0.354f), "metal_dark");
            Box(t, "LegL", new Vector3(0.03f, 0.72f, 0.66f), new Vector3(-0.675f, 0.36f, 0), "metal_dark");
            Box(t, "LegR", new Vector3(0.03f, 0.72f, 0.66f), new Vector3(0.675f, 0.36f, 0), "metal_dark");
            Box(t, "Modesty", new Vector3(1.32f, 0.38f, 0.02f), new Vector3(0, 0.5f, 0.31f), "metal_dark");
            if (pedestal)
            {
                Box(t, "Pedestal", new Vector3(0.42f, 0.6f, 0.6f), new Vector3(0.42f, 0.33f, 0.0f), "metal");
                for (int k = 1; k < 3; k++)
                {
                    float y = 0.12f + (2 - k) * 0.2f;
                    Box(t, "DrawerFront" + k, new Vector3(0.4f, 0.18f, 0.015f), new Vector3(0.42f, y, -0.307f), "metal");
                    Box(t, "Handle" + k, new Vector3(0.13f, 0.018f, 0.02f), new Vector3(0.42f, y + 0.05f, -0.322f), "metal_dark");
                }
                var top = Node(t, "TopDrawer", new Vector3(0.42f, 0.53f, 0f));
                Box(top.transform, "Front", new Vector3(0.4f, 0.16f, 0.015f), new Vector3(0, 0, -0.307f), "metal");
                Box(top.transform, "Handle", new Vector3(0.13f, 0.018f, 0.02f), new Vector3(0, 0.04f, -0.322f), "metal_dark");
                Box(top.transform, "Bottom", new Vector3(0.36f, 0.01f, 0.52f), new Vector3(0, -0.06f, -0.04f), "metal_dark");
                Box(top.transform, "SideL", new Vector3(0.01f, 0.1f, 0.52f), new Vector3(-0.18f, -0.02f, -0.04f), "metal_dark");
                Box(top.transform, "SideR", new Vector3(0.01f, 0.1f, 0.52f), new Vector3(0.18f, -0.02f, -0.04f), "metal_dark");
                drawer = top.AddComponent<DrawerSlide>();
            }
            // 책상 몸체 충돌은 상판 높이까지만 (위에 놓인 모니터를 조준할 수 있도록)
            AddCollider(root, new Vector3(0, 0.375f, 0f), new Vector3(1.4f, 0.75f, 0.72f));
            if (partition)
            {
                Box(t, "Partition", new Vector3(1.42f, 1.25f, 0.05f), new Vector3(0, 0.625f, 0.42f), "fabric", default, 0.6f);
                Box(t, "PartitionCap", new Vector3(1.44f, 0.025f, 0.065f), new Vector3(0, 1.262f, 0.42f), "metal");
                AddCollider(root, new Vector3(0, 0.635f, 0.42f), new Vector3(1.42f, 1.27f, 0.06f));
            }
            return root;
        }

        // ---------- CRT 모니터 ----------

        public CrtParts Crt(Transform parent, string name, Vector3 lp, float yaw, float scale = 1f)
        {
            var root = Node(parent, name, lp, yaw);
            root.transform.localScale = Vector3.one * scale;
            var t = root.transform;
            var parts = new CrtParts { Root = root };
            if (TryModel(t, "CrtMonitor", Vector3.zero, 0f) == null)
            {
                Cyl(t, "Base", 0.13f, 0.02f, new Vector3(0, 0.01f, 0.06f), "plastic", default, 12);
                Box(t, "Neck", new Vector3(0.14f, 0.06f, 0.12f), new Vector3(0, 0.05f, 0.06f), "plastic");
                Box(t, "Bezel", new Vector3(0.46f, 0.40f, 0.07f), new Vector3(0, 0.28f, 0), "plastic", default, 0.5f);
                var shell = ctx.Cached("crtshell", () => MeshKit.Frustum(new Vector2(0.42f, 0.36f), new Vector2(0.25f, 0.22f), 0.36f, 0.03f, 0.5f));
                Mesh(t, "Shell", shell, M.Get("plastic"), new Vector3(0, 0.28f, 0.215f), Vector3.zero);
                Box(t, "Vent", new Vector3(0.2f, 0.004f, 0.12f), new Vector3(0, 0.428f, 0.2f), "plastic_dark");
                Quad(t, "Inset", new Vector2(0.395f, 0.315f), new Vector3(0, 0.285f, -0.0355f), Vector3.zero, M.Get("black"));
                Box(t, "Button", new Vector3(0.03f, 0.015f, 0.01f), new Vector3(0.15f, 0.1f, -0.036f), "plastic_dark");
            }
            var scr = Quad(t, "Screen", new Vector2(0.36f, 0.27f), new Vector3(0, 0.285f, -0.037f), Vector3.zero, M.Get("screen_dead"));
            parts.Screen = scr.GetComponent<Renderer>();
            parts.ScreenTransform = scr.transform;
            var led = Box(t, "Led", new Vector3(0.012f, 0.006f, 0.004f), new Vector3(0.19f, 0.1f, -0.037f), "led_amber");
            parts.Led = led.GetComponent<Renderer>();
            AddCollider(root, new Vector3(0, 0.27f, 0.16f), new Vector3(0.46f, 0.46f, 0.42f));
            return parts;
        }

        public GameObject Keyboard(Transform parent, Vector3 lp, float yaw)
        {
            var root = Node(parent, "Keyboard", lp, yaw);
            Box(root.transform, "Body", new Vector3(0.44f, 0.025f, 0.15f), new Vector3(0, 0.0125f, 0), "plastic");
            Quad(root.transform, "Keys", new Vector2(0.42f, 0.13f), new Vector3(0, 0.0255f, 0), new Vector3(90, 0, 0), M.Get("keyboard_top"));
            Box(root.transform, "Mouse", new Vector3(0.06f, 0.03f, 0.1f), new Vector3(0.33f, 0.015f, 0.01f), "plastic");
            var pts = new List<Vector3> { new Vector3(0, 0.012f, 0.075f), new Vector3(0.02f, 0.008f, 0.16f), new Vector3(0.1f, 0.006f, 0.3f), new Vector3(0.15f, 0.006f, 0.42f) };
            Cable(root.transform, pts, 0.004f);
            var mpts = new List<Vector3> { new Vector3(0.33f, 0.012f, 0.06f), new Vector3(0.32f, 0.006f, 0.16f), new Vector3(0.22f, 0.006f, 0.32f), new Vector3(0.17f, 0.006f, 0.42f) };
            Cable(root.transform, mpts, 0.003f);
            return root;
        }

        public GameObject Tower(Transform parent, Vector3 lp, float yaw)
        {
            var root = Node(parent, "Tower", lp, yaw);
            Box(root.transform, "Case", new Vector3(0.19f, 0.42f, 0.45f), new Vector3(0, 0.21f, 0), "plastic", default, 0.5f);
            Quad(root.transform, "Front", new Vector2(0.18f, 0.4f), new Vector3(0, 0.21f, -0.2265f), Vector3.zero, M.Get("tower_front"));
            return root;
        }

        // ---------- 의자 (앉는 사람이 +Z를 본다) ----------

        public GameObject Chair(Transform parent, Vector3 lp, float yaw)
        {
            var root = Node(parent, "Chair", lp, yaw);
            var t = root.transform;
            if (TryModel(t, "OfficeChair", Vector3.zero, 0f) == null)
            {
                for (int k = 0; k < 5; k++)
                {
                    var arm = Node(t, "Star" + k, new Vector3(0, 0.07f, 0), k * 72f);
                    Box(arm.transform, "Leg", new Vector3(0.05f, 0.03f, 0.3f), new Vector3(0, 0, 0.15f), "metal_dark");
                    Box(arm.transform, "Caster", new Vector3(0.04f, 0.05f, 0.05f), new Vector3(0, -0.04f, 0.29f), "plastic_dark");
                }
                Cyl(t, "Column", 0.025f, 0.34f, new Vector3(0, 0.25f, 0), "metal_dark", default, 8);
                Box(t, "Seat", new Vector3(0.48f, 0.08f, 0.46f), new Vector3(0, 0.46f, 0), "fabric_chair", default, 0.6f);
                Box(t, "BackPost", new Vector3(0.05f, 0.32f, 0.04f), new Vector3(0, 0.6f, -0.25f), "metal_dark");
                Box(t, "Back", new Vector3(0.44f, 0.5f, 0.06f), new Vector3(0, 0.84f, -0.25f), "fabric_chair", new Vector3(-8f, 0, 0), 0.6f);
                for (int s = -1; s <= 1; s += 2)
                {
                    Box(t, "ArmPost", new Vector3(0.03f, 0.2f, 0.03f), new Vector3(0.26f * s, 0.57f, -0.04f), "metal_dark");
                    Box(t, "Arm", new Vector3(0.05f, 0.03f, 0.26f), new Vector3(0.26f * s, 0.67f, 0.0f), "plastic_dark");
                }
            }
            AddCollider(root, new Vector3(0, 0.5f, 0), new Vector3(0.5f, 1.0f, 0.5f));
            return root;
        }

        // ---------- 기타 가구 ----------

        public GameObject Cabinet(Transform parent, string id, Vector3 pos, float rot)
        {
            var root = Node(parent, string.IsNullOrEmpty(id) ? "Cabinet" : id, pos, rot);
            var t = root.transform;
            Box(t, "Body", new Vector3(0.46f, 1.32f, 0.62f), new Vector3(0, 0.66f, 0), "metal");
            for (int k = 0; k < 4; k++)
            {
                float y = 0.18f + k * 0.32f;
                Box(t, "Front" + k, new Vector3(0.42f, 0.29f, 0.012f), new Vector3(0, y, -0.315f), "metal");
                Box(t, "Handle" + k, new Vector3(0.14f, 0.02f, 0.025f), new Vector3(0, y + 0.07f, -0.33f), "metal_dark");
                Quad(t, "Label" + k, new Vector2(0.08f, 0.035f), new Vector3(0, y + 0.115f, -0.3225f), Vector3.zero, M.Get("paper"));
            }
            AddCollider(root, new Vector3(0, 0.66f, 0), new Vector3(0.46f, 1.32f, 0.62f));
            return root;
        }

        public GameObject Cooler(Transform parent, string id, Vector3 pos, float rot)
        {
            var root = Node(parent, string.IsNullOrEmpty(id) ? "Cooler" : id, pos, rot);
            var t = root.transform;
            Box(t, "Body", new Vector3(0.32f, 0.95f, 0.32f), new Vector3(0, 0.475f, 0), "paper");
            Box(t, "Tray", new Vector3(0.2f, 0.03f, 0.08f), new Vector3(0, 0.62f, -0.18f), "plastic_dark");
            Box(t, "TapB", new Vector3(0.03f, 0.04f, 0.04f), new Vector3(0.05f, 0.75f, -0.17f), "led_red");
            Box(t, "TapC", new Vector3(0.03f, 0.04f, 0.04f), new Vector3(-0.05f, 0.75f, -0.17f), "plastic_dark");
            Cyl(t, "Bottle", 0.13f, 0.4f, new Vector3(0, 1.16f, 0), "water", default, 12);
            Cyl(t, "Neck", 0.05f, 0.06f, new Vector3(0, 0.97f, 0), "water", default, 10);
            AddCollider(root, new Vector3(0, 0.7f, 0), new Vector3(0.34f, 1.4f, 0.34f));
            return root;
        }

        public GameObject Boxes(Transform parent, Vector3 pos, float rot)
        {
            var root = Node(parent, "Boxes", pos, rot);
            var t = root.transform;
            Box(t, "B1", new Vector3(0.55f, 0.38f, 0.42f), new Vector3(0, 0.19f, 0), "cardboard", default, 0.6f);
            Box(t, "B2", new Vector3(0.45f, 0.32f, 0.36f), new Vector3(0.03f, 0.54f, 0.02f), "cardboard", new Vector3(0, 12f, 0), 0.6f);
            Box(t, "B3", new Vector3(0.4f, 0.28f, 0.34f), new Vector3(0.05f, 0.14f, -0.42f), "cardboard", new Vector3(0, -8f, 0), 0.6f);
            AddCollider(root, new Vector3(0.02f, 0.35f, -0.18f), new Vector3(0.6f, 0.7f, 0.82f));
            return root;
        }

        public GameObject DeskBoxes(Transform parent, Vector3 lp)
        {
            var root = Node(parent, "DeskBoxes", lp, 7f);
            Box(root.transform, "B1", new Vector3(0.42f, 0.3f, 0.34f), new Vector3(-0.2f, 0.15f, 0), "cardboard", default, 0.6f);
            Box(root.transform, "B2", new Vector3(0.36f, 0.24f, 0.3f), new Vector3(0.25f, 0.12f, 0.02f), "cardboard", new Vector3(0, -15f, 0), 0.6f);
            return root;
        }

        public GameObject Papers(Transform parent, Vector3 lp, float yaw)
        {
            var root = Node(parent, "Papers", lp, yaw);
            for (int k = 0; k < 3; k++)
                Box(root.transform, "Sheet" + k, new Vector3(0.21f, 0.004f, 0.297f), new Vector3(k * 0.015f, 0.002f + k * 0.004f, k * 0.01f), "paper", new Vector3(0, k * 6f - 4f, 0));
            return root;
        }

        public GameObject Mug(Transform parent, Vector3 lp)
        {
            var root = Node(parent, "Mug", lp);
            Cyl(root.transform, "Cup", 0.04f, 0.095f, new Vector3(0, 0.0475f, 0), "paper", default, 10);
            Box(root.transform, "Handle", new Vector3(0.012f, 0.05f, 0.03f), new Vector3(0.048f, 0.05f, 0), "paper");
            Cyl(root.transform, "Coffee", 0.036f, 0.004f, new Vector3(0, 0.085f, 0), "black", default, 10);
            return root;
        }

        public GameObject Phone(Transform parent, Vector3 lp, float yaw)
        {
            var root = Node(parent, "Phone", lp, yaw);
            Box(root.transform, "Base", new Vector3(0.2f, 0.06f, 0.2f), new Vector3(0, 0.03f, 0), "plastic_dark", new Vector3(-8f, 0, 0));
            Box(root.transform, "Handset", new Vector3(0.22f, 0.045f, 0.06f), new Vector3(0, 0.08f, 0.04f), "plastic_dark");
            Box(root.transform, "Keys", new Vector3(0.09f, 0.005f, 0.09f), new Vector3(0, 0.065f, -0.05f), "plastic");
            AddCollider(root, new Vector3(0, 0.05f, 0), new Vector3(0.24f, 0.12f, 0.24f));
            return root;
        }

        public GameObject WallPanel(Transform parent, string id, Vector3 pos, float rot)
        {
            var root = Node(parent, id, pos, rot);
            Box(root.transform, "Box", new Vector3(0.42f, 0.6f, 0.1f), new Vector3(0, 0, 0.0f), "metal");
            Quad(root.transform, "Face", new Vector2(0.38f, 0.56f), new Vector3(0, 0, -0.0505f), Vector3.zero, M.Get("panel"));
            Box(root.transform, "Led", new Vector3(0.02f, 0.02f, 0.01f), new Vector3(0.15f, 0.25f, -0.055f), "led_amber");
            AddCollider(root, Vector3.zero, new Vector3(0.44f, 0.62f, 0.14f));
            return root;
        }

        public GameObject Decal(Transform parent, string id, string mat, Vector2 size, Vector3 pos, float rot, bool collider)
        {
            var root = Node(parent, id, pos, rot);
            Quad(root.transform, "Face", size, Vector3.zero, Vector3.zero, M.Get(mat));
            if (collider) AddCollider(root, Vector3.zero, new Vector3(size.x, size.y, 0.06f));
            return root;
        }

        public WallClock Clock(Transform parent, string id, Vector3 pos, float rot)
        {
            var root = Node(parent, id, pos, rot);
            var t = root.transform;
            Cyl(t, "Rim", 0.18f, 0.04f, new Vector3(0, 0, 0.0f), "plastic_dark", new Vector3(90, 0, 0), 16);
            Quad(t, "Face", new Vector2(0.32f, 0.32f), new Vector3(0, 0, -0.021f), Vector3.zero, M.Get("clock_face"));
            var hourPivot = Node(t, "Hour", new Vector3(0, 0, -0.024f));
            Box(hourPivot.transform, "Hand", new Vector3(0.012f, 0.085f, 0.003f), new Vector3(0, 0.035f, 0), "black");
            var minPivot = Node(t, "Minute", new Vector3(0, 0, -0.027f));
            Box(minPivot.transform, "Hand", new Vector3(0.008f, 0.13f, 0.003f), new Vector3(0, 0.055f, 0), "black");
            AddCollider(root, Vector3.zero, new Vector3(0.36f, 0.36f, 0.06f));
            var clock = root.AddComponent<WallClock>();
            clock.Hour = hourPivot.transform;
            clock.Minute = minPivot.transform;
            return clock;
        }

        public GameObject ExitSign(Transform parent, Vector3 pos, float rot, out Light light)
        {
            var root = Node(parent, "ExitSign", pos, rot);
            Box(root.transform, "Case", new Vector3(0.42f, 0.17f, 0.06f), Vector3.zero, "metal");
            Quad(root.transform, "Face", new Vector2(0.38f, 0.14f), new Vector3(0, 0, -0.031f), Vector3.zero, M.Get("exit_sign"));
            var lgo = Node(root.transform, "Glow", new Vector3(0, -0.15f, -0.25f));
            light = lgo.AddComponent<Light>();
            light.type = LightType.Point;
            light.color = new Color(0.35f, 1f, 0.5f);
            light.range = 3.2f;
            light.intensity = 0.55f;
            light.shadows = LightShadows.None;
            return root;
        }

        public GameObject Elevator(Transform parent, Vector3 pos, float rot)
        {
            var root = Node(parent, "Elevator", pos, rot);
            Quad(root.transform, "Doors", new Vector2(1.2f, 2.1f), new Vector3(0, 1.05f, 0), new Vector3(0, 180f, 0), M.Get("elevator"));
            Box(root.transform, "Button", new Vector3(0.06f, 0.1f, 0.02f), new Vector3(0.85f, 1.15f, 0.02f), "led_amber");
            return root;
        }

        public GameObject Blinds(Transform parent, Vector3 center, float width, float height, float yaw)
        {
            var root = Node(parent, "Blinds", center, yaw);
            int count = Mathf.RoundToInt(height / 0.055f);
            for (int k = 0; k < count; k++)
            {
                float y = -height / 2f + (k + 0.5f) * (height / count);
                // 일부 살은 비뚤어져 있다
                float tilt = (k % 7 == 3) ? 62f : 38f;
                Box(root.transform, "Slat", new Vector3(width, 0.004f, 0.05f), new Vector3(0, y, 0), "paper", new Vector3(tilt, 0, 0));
            }
            Box(root.transform, "Rail", new Vector3(width + 0.04f, 0.04f, 0.06f), new Vector3(0, height / 2f + 0.02f, 0), "metal");
            return root;
        }

        public CctvCamera Cctv(Transform parent, string id, Vector3 pos)
        {
            var root = Node(parent, id, pos);
            var t = root.transform;
            Box(t, "Mount", new Vector3(0.14f, 0.04f, 0.14f), new Vector3(0, -0.02f, 0), "plastic");
            var head = Node(t, "Head", new Vector3(0, -0.09f, 0));
            Box(head.transform, "Body", new Vector3(0.11f, 0.1f, 0.18f), new Vector3(0, 0, 0.02f), "plastic");
            Box(head.transform, "Lens", new Vector3(0.06f, 0.06f, 0.04f), new Vector3(0, 0, 0.12f), "black");
            var led = Box(head.transform, "Led", new Vector3(0.015f, 0.015f, 0.01f), new Vector3(0.04f, 0.035f, 0.115f), "black");
            var cam = root.AddComponent<CctvCamera>();
            cam.Head = head.transform;
            cam.Led = led.GetComponent<Renderer>();
            cam.LedOn = M.Get("led_red");
            cam.LedOff = M.Get("black");
            return cam;
        }

        // ---------- 플레이어 몸 (CCTV 전용) ----------

        public PlayerAvatar Avatar(Transform parent)
        {
            var root = Node(parent, "PlayerAvatar", Vector3.zero);
            var standing = Node(root.transform, "Standing", Vector3.zero);
            var s = standing.transform;
            Box(s, "LegL", new Vector3(0.15f, 0.82f, 0.18f), new Vector3(-0.11f, 0.41f, 0), "cloth");
            Box(s, "LegR", new Vector3(0.15f, 0.82f, 0.18f), new Vector3(0.11f, 0.41f, 0), "cloth");
            Box(s, "Torso", new Vector3(0.42f, 0.62f, 0.24f), new Vector3(0, 1.13f, 0), "cloth");
            Box(s, "ArmL", new Vector3(0.1f, 0.6f, 0.12f), new Vector3(-0.27f, 1.12f, 0), "cloth");
            Box(s, "ArmR", new Vector3(0.1f, 0.6f, 0.12f), new Vector3(0.27f, 1.12f, 0), "cloth");
            Box(s, "Head", new Vector3(0.2f, 0.24f, 0.22f), new Vector3(0, 1.58f, 0), "skin");
            Box(s, "Hair", new Vector3(0.21f, 0.08f, 0.23f), new Vector3(0, 1.69f, -0.01f), "black");

            var seated = Node(root.transform, "Seated", Vector3.zero);
            var q = seated.transform;
            Box(q, "Torso", new Vector3(0.42f, 0.6f, 0.24f), new Vector3(0, 0.83f, -0.05f), "cloth", new Vector3(6f, 0, 0));
            Box(q, "ThighL", new Vector3(0.15f, 0.14f, 0.45f), new Vector3(-0.11f, 0.55f, 0.15f), "cloth");
            Box(q, "ThighR", new Vector3(0.15f, 0.14f, 0.45f), new Vector3(0.11f, 0.55f, 0.15f), "cloth");
            Box(q, "ShinL", new Vector3(0.14f, 0.48f, 0.15f), new Vector3(-0.11f, 0.26f, 0.36f), "cloth");
            Box(q, "ShinR", new Vector3(0.14f, 0.48f, 0.15f), new Vector3(0.11f, 0.26f, 0.36f), "cloth");
            Box(q, "ArmL", new Vector3(0.1f, 0.12f, 0.42f), new Vector3(-0.24f, 0.95f, 0.18f), "cloth");
            Box(q, "ArmR", new Vector3(0.1f, 0.12f, 0.42f), new Vector3(0.24f, 0.95f, 0.18f), "cloth");
            Box(q, "Head", new Vector3(0.2f, 0.24f, 0.22f), new Vector3(0, 1.27f, 0.0f), "skin");
            Box(q, "Hair", new Vector3(0.21f, 0.08f, 0.23f), new Vector3(0, 1.38f, -0.01f), "black");
            seated.SetActive(false);

            SetLayer(root, Layers.Avatar);
            foreach (var r in root.GetComponentsInChildren<Renderer>(true))
                r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            var av = root.AddComponent<PlayerAvatar>();
            av.Standing = standing;
            av.Seated = seated;
            return av;
        }

        // ---------- 추격자 임시 외형: 빙글빙글 도는 회색 고양이 ----------

        public GameObject Cat(Transform parent, Vector3 pos)
        {
            var root = Node(parent, "Chaser_Cat", pos);
            var visual = Node(root.transform, "Visual", Vector3.zero);
            visual.transform.localScale = Vector3.one * 1.7f;
            var v = visual.transform;
            Box(v, "Body", new Vector3(0.26f, 0.22f, 0.44f), new Vector3(0, 0.24f, 0), "cat_fur", default, 0f);
            Box(v, "Chest", new Vector3(0.18f, 0.16f, 0.06f), new Vector3(0, 0.22f, 0.21f), "cat_white");
            Box(v, "Head", new Vector3(0.24f, 0.2f, 0.2f), new Vector3(0, 0.38f, 0.26f), "cat_fur", default, 0f);
            Box(v, "Muzzle", new Vector3(0.11f, 0.06f, 0.04f), new Vector3(0, 0.33f, 0.37f), "cat_white");
            Box(v, "Nose", new Vector3(0.03f, 0.02f, 0.012f), new Vector3(0, 0.355f, 0.393f), "cat_pink");
            Box(v, "EyeL", new Vector3(0.04f, 0.045f, 0.01f), new Vector3(-0.055f, 0.405f, 0.362f), "cat_eye");
            Box(v, "EyeR", new Vector3(0.04f, 0.045f, 0.01f), new Vector3(0.055f, 0.405f, 0.362f), "cat_eye");
            for (int s = -1; s <= 1; s += 2)
            {
                Box(v, "Ear", new Vector3(0.07f, 0.07f, 0.03f), new Vector3(0.075f * s, 0.49f, 0.25f), "cat_fur", new Vector3(0, 0, 45f), 0f);
                Box(v, "EarIn", new Vector3(0.04f, 0.04f, 0.01f), new Vector3(0.075f * s, 0.485f, 0.268f), "cat_pink", new Vector3(0, 0, 45f));
                Box(v, "LegF", new Vector3(0.07f, 0.15f, 0.07f), new Vector3(0.08f * s, 0.075f, 0.15f), "cat_white");
                Box(v, "LegB", new Vector3(0.07f, 0.15f, 0.07f), new Vector3(0.08f * s, 0.075f, -0.15f), "cat_white");
                Box(v, "Whisker", new Vector3(0.12f, 0.004f, 0.004f), new Vector3(0.1f * s, 0.335f, 0.38f), "cat_white", new Vector3(0, 0, 8f * s));
            }
            var tail = new List<Vector3>();
            for (int k = 0; k <= 8; k++)
            {
                float a = k / 8f;
                tail.Add(new Vector3(0.04f * Mathf.Sin(a * 3f), 0.28f + a * 0.32f, -0.22f - a * 0.12f + a * a * 0.1f));
            }
            Mesh(v, "Tail", ctx.Own(MeshKit.Tube(tail, 0.03f, 6)), M.Get("cat_fur"), Vector3.zero, Vector3.zero);
            SetLayer(root, Layers.IgnoreRaycast);
            return root;
        }

        public static void SetLayer(GameObject go, int layer)
        {
            go.layer = layer;
            foreach (Transform c in go.transform) SetLayer(c.gameObject, layer);
        }
    }
}
