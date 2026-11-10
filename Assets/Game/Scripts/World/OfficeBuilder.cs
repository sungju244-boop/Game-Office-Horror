using System.Collections.Generic;
using NightEval.Story;
using UnityEngine;

namespace NightEval.World
{
    /// <summary>office_layout.json 을 읽어 사무실 전체를 만든다.</summary>
    public static class OfficeBuilder
    {
        const float WallThick = 0.15f;

        public static WorldRegistry Build(Transform parent, BuildContext ctx, string layoutJson)
        {
            var reg = new WorldRegistry();
            var root = new GameObject("World");
            root.transform.SetParent(parent, false);
            reg.Root = root.transform;
            var pf = new PropFactory(ctx);
            var L = MiniJson.Parse(layoutJson) as Dictionary<string, object>;
            if (L == null) throw new System.FormatException("office_layout.json 형식 오류");

            ReadPoints(L, reg, root.transform, pf);
            var structure = pf.Node(root.transform, "Structure", Vector3.zero).transform;
            foreach (object o in MiniJson.List(L, "floors")) BuildFloor(o as Dictionary<string, object>, structure, pf, reg);
            foreach (object o in MiniJson.List(L, "walls")) BuildWall(o as Dictionary<string, object>, structure, pf, reg);
            var doors = pf.Node(root.transform, "Doors", Vector3.zero).transform;
            foreach (object o in MiniJson.List(L, "doors")) BuildDoor(o as Dictionary<string, object>, doors, pf, reg, ctx);
            var lights = pf.Node(root.transform, "Lights", Vector3.zero).transform;
            foreach (object o in MiniJson.List(L, "lights")) BuildLight(o as Dictionary<string, object>, lights, pf, reg);
            var props = pf.Node(root.transform, "Props", Vector3.zero).transform;
            foreach (object o in MiniJson.List(L, "props")) BuildProp(o as Dictionary<string, object>, props, pf, reg, ctx);
            var cables = pf.Node(root.transform, "Cables", Vector3.zero).transform;
            foreach (object o in MiniJson.List(L, "holes")) BuildHole(o as List<object>, cables, pf, ctx);
            foreach (object o in MiniJson.List(L, "cables")) BuildCable(o as Dictionary<string, object>, cables, pf);
            BuildOutside(MiniJson.Obj(L, "backdrop"), root.transform, pf, ctx);
            Batch(new[] { structure, props, lights, cables });

            reg.Avatar = pf.Avatar(root.transform);
            reg.Avatar.SeatPoint = reg.ChairSeat;
            return reg;
        }

        /// <summary>움직이지 않는 메시를 묶어 그리기 호출 수를 줄인다 (문·서랍·CCTV·시계 바늘 제외).</summary>
        static void Batch(Transform[] roots)
        {
            try
            {
                foreach (var root in roots)
                {
                    var list = new List<GameObject>();
                    foreach (var r in root.GetComponentsInChildren<MeshRenderer>())
                    {
                        if (r.GetComponentInParent<DrawerSlide>() != null) continue;
                        if (r.GetComponentInParent<Door>() != null) continue;
                        if (r.GetComponentInParent<CctvCamera>() != null) continue;
                        if (r.GetComponentInParent<WallClock>() != null) continue;
                        list.Add(r.gameObject);
                    }
                    if (list.Count > 1) StaticBatchingUtility.Combine(list.ToArray(), root.gameObject);
                }
            }
            catch (System.Exception e)
            {
                Debug.LogWarning("[야간 평가실] 정적 배칭 생략: " + e.Message);
            }
        }

        static Vector3 XZ(float[] a, float y = 0f) => a.Length >= 2 ? new Vector3(a[0], y, a[1]) : Vector3.zero;
        static Vector3 XYZ(float[] a) => a.Length >= 3 ? new Vector3(a[0], a[1], a[2]) : Vector3.zero;

        static void ReadPoints(Dictionary<string, object> L, WorldRegistry reg, Transform root, PropFactory pf)
        {
            var spawn = MiniJson.Obj(L, "spawn");
            reg.SpawnPos = XZ(MiniJson.Floats(spawn, "pos"));
            reg.SpawnYaw = MiniJson.Num(spawn, "yaw");
            var stand = MiniJson.Obj(L, "deskStand");
            reg.DeskStandPos = XZ(MiniJson.Floats(stand, "pos"));
            reg.DeskStandYaw = MiniJson.Num(stand, "yaw");
            var tc = MiniJson.Obj(L, "titleCam");
            reg.TitleCamPos = XYZ(MiniJson.Floats(tc, "pos"));
            reg.TitleCamLook = XYZ(MiniJson.Floats(tc, "look"));
            reg.SupSpawn = XZ(MiniJson.Floats(L, "supSpawn"));
            reg.ExitPoint = XZ(MiniJson.Floats(L, "exitPoint"));
            reg.VoidPoint = XZ(MiniJson.Floats(L, "voidPoint"));
            reg.Fog = MiniJson.Num(L, "fog", 0.062f);
            reg.AddAnchor("SupSpawn", pf.Node(root, "SupSpawn", reg.SupSpawn).transform);
            reg.AddAnchor("ExitPoint", pf.Node(root, "ExitPoint", reg.ExitPoint).transform);
            reg.AddAnchor("VoidPoint", pf.Node(root, "VoidPoint", reg.VoidPoint).transform);
            reg.AddAnchor("FrontHall", pf.Node(root, "FrontHall", new Vector3(-1.5f, 1.2f, -6.6f)).transform);
            reg.AddAnchor("Corridor", pf.Node(root, "Corridor", new Vector3(5f, 1.2f, 9f)).transform);
            reg.AddAnchor("CeilingMid", pf.Node(root, "CeilingMid", new Vector3(0.5f, 2.4f, 0.5f)).transform);
        }

        // ---------- 바닥·천장 ----------

        static void BuildFloor(Dictionary<string, object> d, Transform parent, PropFactory pf, WorldRegistry reg)
        {
            if (d == null) return;
            if (MiniJson.Bool(d, "void")) // 맵 밖의 공허 (엔딩 4): 정전 뒤 직원용 문 너머에 나타난다 (처음엔 숨김)
            {
                var vmin = MiniJson.Floats(d, "min"); var vmax = MiniJson.Floats(d, "max");
                var vc = new Vector3((vmin[0] + vmax[0]) / 2f, 0f, (vmin[1] + vmax[1]) / 2f);
                reg.AddAnchor("Room_" + MiniJson.Str(d, "id", "void"), pf.Node(parent, "Room_void", vc + Vector3.up * 1.2f).transform);
                var vf = pf.Box(parent, "VoidFloor", new Vector3(vmax[0] - vmin[0], 0.1f, vmax[1] - vmin[1]), vc + Vector3.down * 0.05f, "void_floor", default, 4f, true);
                vf.GetComponent<Renderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                vf.SetActive(false);
                reg.VoidFloor = vf;
                return;
            }
            var min = MiniJson.Floats(d, "min");
            var max = MiniJson.Floats(d, "max");
            float h = MiniJson.Num(d, "ceiling", 2.6f);
            float w = max[0] - min[0], dep = max[1] - min[1];
            var c = new Vector3((min[0] + max[0]) * 0.5f, 0, (min[1] + max[1]) * 0.5f);
            string id = MiniJson.Str(d, "id", "floor");
            reg.AddAnchor("Room_" + id, pf.Node(parent, "Room_" + id, c + Vector3.up * 1.2f).transform);
            var floor = pf.Box(parent, "Floor_" + id, new Vector3(w, 0.1f, dep), c + Vector3.down * 0.05f, MiniJson.Str(d, "mat", "carpet"), default, 1f, true);
            floor.GetComponent<Renderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            // 천장은 벽 위를 덮도록 조금 넓고 두껍게 (달빛이 틈으로 새지 않게)
            pf.Box(parent, "Ceiling_" + id, new Vector3(w + 0.4f, 0.12f, dep + 0.4f), c + Vector3.up * (h + 0.06f), MiniJson.Str(d, "ceilMat", "ceiling"), default, 1f, true);
        }

        // ---------- 벽 ----------

        static void BuildWall(Dictionary<string, object> d, Transform parent, PropFactory pf, WorldRegistry reg)
        {
            if (d == null) return;
            Vector3 a = XZ(MiniJson.Floats(d, "a"));
            Vector3 b = XZ(MiniJson.Floats(d, "b"));
            float h = MiniJson.Num(d, "h", 2.6f);
            string mat = MiniJson.Str(d, "mat", "wall");
            Vector3 dir = (b - a);
            float len = dir.magnitude;
            dir /= len;
            bool alongX = Mathf.Abs(dir.x) > Mathf.Abs(dir.z);

            var openings = new List<float[]>();
            foreach (object oo in MiniJson.List(d, "openings"))
            {
                if (!(oo is Dictionary<string, object> od)) continue;
                openings.Add(new[] { MiniJson.Num(od, "c"), MiniJson.Num(od, "w"), MiniJson.Num(od, "y0"), MiniJson.Num(od, "y1") });
                string win = MiniJson.Str(od, "window", null);
                if (MiniJson.Bool(od, "glass")) BuildGlass(a + dir * MiniJson.Num(od, "c"), MiniJson.Num(od, "w"), MiniJson.Num(od, "y0"), MiniJson.Num(od, "y1"), alongX, parent, pf);
                if (win != null) BuildWindow(win, a + dir * MiniJson.Num(od, "c"), MiniJson.Num(od, "w"), MiniJson.Num(od, "y0"), MiniJson.Num(od, "y1"), alongX, parent, pf, reg);
            }
            openings.Sort((p, q) => p[0].CompareTo(q[0]));

            float s = 0f;
            foreach (var o in openings)
            {
                float o0 = o[0] - o[1] / 2f, o1 = o[0] + o[1] / 2f;
                if (o0 > s + 0.001f) Piece(a, dir, alongX, s, o0, 0f, h, mat, parent, pf, true);
                if (o[3] < h - 0.001f) Piece(a, dir, alongX, o0, o1, o[3], h, mat, parent, pf, false);
                if (o[2] > 0.001f) Piece(a, dir, alongX, o0, o1, 0f, o[2], mat, parent, pf, true);
                s = o1;
            }
            if (len > s + 0.001f) Piece(a, dir, alongX, s, len, 0f, h, mat, parent, pf, true);
        }

        static void Piece(Vector3 a, Vector3 dir, bool alongX, float s0, float s1, float y0, float y1, string mat, Transform parent, PropFactory pf, bool baseboard)
        {
            float l = s1 - s0;
            Vector3 c = a + dir * ((s0 + s1) * 0.5f);
            c.y = (y0 + y1) * 0.5f;
            Vector3 size = alongX ? new Vector3(l, y1 - y0, WallThick) : new Vector3(WallThick, y1 - y0, l);
            pf.Box(parent, "Wall", size, c, mat, default, 1f, true);
            if (baseboard && y0 < 0.01f)
            {
                Vector3 bs = alongX ? new Vector3(l, 0.08f, WallThick + 0.025f) : new Vector3(WallThick + 0.025f, 0.08f, l);
                pf.Box(parent, "Baseboard", bs, new Vector3(c.x, 0.04f, c.z), "baseboard");
            }
        }

        /// <summary>회의실 유리벽: 금속 틀 + 지나갈 수 없는 투명한 막 (유리 재질은 2단계)</summary>
        static void BuildGlass(Vector3 center, float w, float y0, float y1, bool alongX, Transform parent, PropFactory pf)
        {
            float h = y1 - y0;
            var g = pf.Node(parent, "Glass", new Vector3(center.x, (y0 + y1) * 0.5f, center.z), alongX ? 0f : 90f).transform;
            pf.Box(g, "Top", new Vector3(w, 0.05f, 0.08f), new Vector3(0, h / 2f, 0), "metal_dark");
            pf.Box(g, "Bottom", new Vector3(w, 0.05f, 0.08f), new Vector3(0, -h / 2f, 0), "metal_dark");
            int n = Mathf.Max(1, Mathf.RoundToInt(w / 1.2f));
            for (int i = 0; i <= n; i++) pf.Box(g, "Mullion", new Vector3(0.04f, h, 0.06f), new Vector3(-w / 2f + w * i / n, 0, 0), "metal_dark");
            var block = pf.Node(g, "Block", Vector3.zero);
            block.AddComponent<BoxCollider>().size = new Vector3(w, h, 0.06f);
            block.layer = Layers.IgnoreRaycast;
        }

        static void BuildWindow(string id, Vector3 center, float w, float y0, float y1, bool alongX, Transform parent, PropFactory pf, WorldRegistry reg)
        {
            float h = y1 - y0;
            float yaw = alongX ? 0f : 90f;
            var win = pf.Node(parent, id, new Vector3(center.x, (y0 + y1) * 0.5f, center.z), yaw);
            var t = win.transform;
            // 창틀
            pf.Box(t, "FrameTop", new Vector3(w, 0.05f, 0.17f), new Vector3(0, h / 2f, 0), "metal_dark");
            pf.Box(t, "FrameBottom", new Vector3(w + 0.1f, 0.05f, 0.24f), new Vector3(0, -h / 2f, 0.02f), "metal_dark");
            pf.Box(t, "FrameL", new Vector3(0.05f, h, 0.17f), new Vector3(-w / 2f, 0, 0), "metal_dark");
            pf.Box(t, "FrameR", new Vector3(0.05f, h, 0.17f), new Vector3(w / 2f, 0, 0), "metal_dark");
            pf.Box(t, "Mullion", new Vector3(0.03f, h, 0.05f), new Vector3(0, 0, 0), "metal_dark");
            // 실내 쪽 블라인드 (방 안쪽 = 로컬 +z 또는 -z 는 벽 위치에 따라 다르므로 양쪽 대칭 배치 대신 중심에서 약간 안쪽)
            float inward = alongX ? (center.z > 0 ? -0.12f : 0.12f) : (center.x > 0 ? 0.12f : -0.12f);
            pf.Blinds(t, new Vector3(0, 0.02f, alongX ? inward : -inward), w - 0.06f, h - 0.08f, 0f);
            // 조사용 투명 판 (트리거)
            var probe = pf.Node(t, "Probe", Vector3.zero);
            var bc = probe.AddComponent<BoxCollider>();
            bc.isTrigger = true;
            bc.size = new Vector3(w, h, 0.3f);
            var it = win.AddComponent<Interactable>();
            reg.AddInteractable(id, it);
            // 창문 너머로 막는 보이지 않는 벽 (창턱을 넘지 못하게)
            var block = pf.Node(t, "Block", Vector3.zero);
            var bb = block.AddComponent<BoxCollider>();
            bb.size = new Vector3(w, h, 0.1f);
            block.layer = Layers.IgnoreRaycast;
        }

        // ---------- 문 ----------

        static void BuildDoor(Dictionary<string, object> d, Transform parent, PropFactory pf, WorldRegistry reg, BuildContext ctx)
        {
            if (d == null) return;
            string id = MiniJson.Str(d, "id", "Door");
            Vector3 hinge = XZ(MiniJson.Floats(d, "hinge"));
            float w = MiniJson.Num(d, "width", 1f);
            string dir = MiniJson.Str(d, "dir", "x");
            float yaw = dir == "x" ? 0f : dir == "-x" ? 180f : dir == "z" ? -90f : 90f;
            Vector3 along = Quaternion.Euler(0, yaw, 0) * Vector3.right;
            Vector3 across = Quaternion.Euler(0, yaw, 0) * Vector3.forward;

            // 문틀 (고정)
            var frame = pf.Node(parent, id + "_Frame", hinge, yaw).transform;
            pf.Box(frame, "JambA", new Vector3(0.05f, 2.12f, 0.19f), new Vector3(-0.025f, 1.06f, 0), "metal_dark");
            pf.Box(frame, "JambB", new Vector3(0.05f, 2.12f, 0.19f), new Vector3(w + 0.025f, 1.06f, 0), "metal_dark");
            pf.Box(frame, "Head", new Vector3(w + 0.1f, 0.06f, 0.19f), new Vector3(w / 2f, 2.13f, 0), "metal_dark");

            var pivot = pf.Node(parent, id, hinge, yaw);
            var leaf = pf.Box(pivot.transform, "Leaf", new Vector3(w - 0.02f, 2.06f, 0.045f), new Vector3(w / 2f, 1.03f, 0), MiniJson.Str(d, "mat", "door"), default, 0f, true);
            for (int s = -1; s <= 1; s += 2)
            {
                pf.Box(pivot.transform, "Handle", new Vector3(0.13f, 0.02f, 0.025f), new Vector3(w - 0.14f, 1.0f, 0.045f * s), "metal");
                pf.Box(pivot.transform, "Rose", new Vector3(0.05f, 0.05f, 0.012f), new Vector3(w - 0.09f, 1.0f, 0.03f * s), "metal");
            }
            if (MiniJson.Bool(d, "pushbar"))
                pf.Box(pivot.transform, "PushBar", new Vector3(w * 0.7f, 0.05f, 0.05f), new Vector3(w / 2f, 1.0f, -0.06f), "metal");

            var door = pivot.AddComponent<Door>();
            door.Id = id;
            var it = pivot.AddComponent<Interactable>();
            reg.AddInteractable(id, it);
            reg.Doors[id] = door;

            if (MiniJson.Bool(d, "reader"))
            {
                // 실내 쪽 벽의 카드 단말기 (래치 쪽 옆)
                Vector3 pos = hinge + along * (w + 0.22f) + across * 0.09f + Vector3.up * 1.2f;
                var reader = pf.Node(parent, id + "_Reader", pos, yaw + 180f).transform;
                pf.Box(reader, "Body", new Vector3(0.08f, 0.13f, 0.03f), Vector3.zero, "plastic_dark");
                var led = pf.Box(reader, "Led", new Vector3(0.03f, 0.012f, 0.006f), new Vector3(0, 0.045f, -0.017f), "led_green");
                var lgo = pf.Node(reader, "LedLight", new Vector3(0, 0.05f, -0.08f));
                var l = lgo.AddComponent<Light>();
                l.type = LightType.Point;
                l.range = 0.9f;
                l.intensity = 0.5f;
                l.shadows = LightShadows.None;
                door.Led = led.GetComponent<Renderer>();
                door.LedLight = l;
                door.LedRed = ctx.Mats.Get("led_red");
                door.LedGreen = ctx.Mats.Get("led_green");
            }
            door.Init(MiniJson.Num(d, "openYaw", -95f), MiniJson.Bool(d, "locked"));

            // 소리·확인용 위치는 문 가운데
            var center = pf.Node(parent, id + "_Center", hinge + along * (w / 2f) + Vector3.up * 1.2f);
            reg.AddAnchor(id, center.transform);
        }

        // ---------- 조명 ----------

        static void BuildLight(Dictionary<string, object> d, Transform parent, PropFactory pf, WorldRegistry reg)
        {
            if (d == null) return;
            string id = MiniJson.Str(d, "id", "Light");
            float h = MiniJson.Num(d, "ceiling", 2.6f);
            Vector3 p = XZ(MiniJson.Floats(d, "pos"), MiniJson.Has(d, "y") ? MiniJson.Num(d, "y") : h);
            bool dead = MiniJson.Bool(d, "dead");
            var root = pf.Node(parent, id, p).transform;
            pf.Box(root, "Frame", new Vector3(1.22f, 0.05f, 0.62f), new Vector3(0, -0.025f, 0), "metal");
            var panel = pf.Box(root, "Diffuser", new Vector3(1.16f, 0.012f, 0.56f), new Vector3(0, -0.056f, 0), "panel_on");
            panel.GetComponent<Renderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            var lgo = pf.Node(root, "Light", new Vector3(0, -0.35f, 0));
            var light = lgo.AddComponent<Light>();
            light.type = LightType.Point;
            var col = MiniJson.Floats(d, "color");
            light.color = col.Length >= 3 ? new Color(col[0], col[1], col[2]) : new Color(0.8f, 0.9f, 1.0f);
            light.range = MiniJson.Has(d, "range") ? MiniJson.Num(d, "range") : (h < 2.55f ? 5f : 6.5f);
            light.shadows = LightShadows.None;
            var cl = root.gameObject.AddComponent<CeilingLight>();
            cl.Light = light;
            cl.Panel = panel.GetComponent<Renderer>();
            cl.BaseIntensity = MiniJson.Num(d, "base", 0.85f);
            cl.Init(dead ? 0f : MiniJson.Num(d, "level", 1f), !dead && MiniJson.Bool(d, "flicker"));
            reg.AddLight(MiniJson.Str(d, "group", "ceiling"), cl);
            reg.AddAnchor(id, root);
        }

        // ---------- 소품 ----------

        static void BuildProp(Dictionary<string, object> d, Transform parent, PropFactory pf, WorldRegistry reg, BuildContext ctx)
        {
            if (d == null) return;
            string type = MiniJson.Str(d, "type", "");
            string id = MiniJson.Str(d, "id", "");
            float rot = MiniJson.Num(d, "rot", 0f);
            Vector3 pos = XZ(MiniJson.Floats(d, "pos"), MiniJson.Num(d, "y", 0f));

            switch (type)
            {
                case "desk": BuildDesk(d, id, pos, rot, parent, pf, reg, ctx); break;
                case "supervisor":
                {
                    var desk = pf.Desk(parent, id, pos, rot, false, false, out _);
                    var crt = pf.Crt(desk.transform, "CctvMonitor", new Vector3(-0.1f, 0.75f, 0.0f), 0f, 0.85f);
                    var ms = crt.Root.AddComponent<MonitorScreen>();
                    ms.Screen = crt.Screen;
                    ms.DeadMaterial = ctx.Mats.Get("screen_dead");
                    reg.CctvMonitor = ms;
                    reg.AddInteractable("CctvMonitor", crt.Root.AddComponent<Interactable>());
                    var phone = pf.Phone(desk.transform, new Vector3(0.42f, 0.75f, -0.12f), -10f);
                    reg.AddInteractable("Phone", phone.AddComponent<Interactable>());
                    pf.Papers(desk.transform, new Vector3(-0.5f, 0.75f, -0.1f), 12f);
                    reg.AddInteractable(id, desk.AddComponent<Interactable>());
                    break;
                }
                case "cabinet":
                {
                    var c = pf.Cabinet(parent, id, pos, rot);
                    if (id.Length > 0) reg.AddInteractable(id, c.AddComponent<Interactable>());
                    break;
                }
                case "cooler":
                    reg.AddInteractable(id, pf.Cooler(parent, id, pos, rot).AddComponent<Interactable>());
                    break;
                case "boxes":
                    pf.Boxes(parent, pos, rot);
                    break;
                case "panel":
                    reg.AddInteractable(id, pf.WallPanel(parent, id, pos, rot).AddComponent<Interactable>());
                    break;
                case "clock":
                {
                    var clock = pf.Clock(parent, id, pos, rot);
                    reg.Clock = clock;
                    reg.AddInteractable(id, clock.gameObject.AddComponent<Interactable>());
                    break;
                }
                case "notice":
                    reg.AddInteractable(id, pf.Decal(parent, id, "notice", new Vector2(0.4f, 0.6f), pos, rot, true).AddComponent<Interactable>());
                    break;
                case "calendar":
                    reg.AddInteractable(id, pf.Decal(parent, id, "calendar", new Vector2(0.3f, 0.45f), pos, rot, true).AddComponent<Interactable>());
                    break;
                case "sign":
                {
                    var size = MiniJson.Floats(d, "size");
                    pf.Decal(parent, "Sign", MiniJson.Str(d, "tex", "sign_room"), new Vector2(size[0], size[1]), pos, rot, false);
                    break;
                }
                case "exitsign":
                    pf.ExitSign(parent, pos, rot, out _);
                    break;
                case "elevator":
                    pf.Elevator(parent, pos, rot);
                    break;
                case "cctv":
                {
                    var cam = pf.Cctv(parent, id, pos);
                    if (reg.Cctv == null) reg.Cctv = cam;
                    reg.Cctvs[id] = cam;
                    reg.AddAnchor(id, cam.transform);
                    var look = MiniJson.Floats(d, "look");
                    if (cam.Head != null && look.Length >= 3) cam.Head.rotation = Quaternion.LookRotation(XYZ(look) - cam.Head.position);
                    break;
                }
                case "decal":
                {
                    var size = MiniJson.Floats(d, "size");
                    bool hit = MiniJson.Bool(d, "hit");
                    var dg = pf.Decal(parent, id.Length > 0 ? id : "Decal", MiniJson.Str(d, "tex", "notice"), size.Length >= 2 ? new Vector2(size[0], size[1]) : new Vector2(0.4f, 0.3f), pos, rot, hit);
                    if (hit && id.Length > 0) reg.AddInteractable(id, dg.AddComponent<Interactable>());
                    break;
                }
                case "printer":
                {
                    var pr = pf.Node(parent, id.Length > 0 ? id : "Printer", pos, rot).transform;
                    pf.Box(pr, "Stand", new Vector3(0.6f, 0.72f, 0.5f), new Vector3(0, 0.36f, 0), "metal_dark", default, 1f, true);
                    pf.Box(pr, "Body", new Vector3(0.52f, 0.34f, 0.44f), new Vector3(0, 0.89f, 0), "plastic", default, 1f, true);
                    pf.Box(pr, "Tray", new Vector3(0.3f, 0.02f, 0.24f), new Vector3(0, 0.8f, -0.3f), "plastic_dark");
                    pf.Box(pr, "Led", new Vector3(0.02f, 0.02f, 0.01f), new Vector3(0.2f, 1.0f, -0.225f), "led_green");
                    reg.AddInteractable(id.Length > 0 ? id : "Printer", pr.gameObject.AddComponent<Interactable>());
                    break;
                }
                case "table":
                {
                    var size = MiniJson.Floats(d, "size");
                    float tw = size.Length >= 2 ? size[0] : 2.4f, td = size.Length >= 2 ? size[1] : 1.0f;
                    var tb = pf.Node(parent, id.Length > 0 ? id : "Table", pos, rot).transform;
                    pf.Box(tb, "Top", new Vector3(tw, 0.05f, td), new Vector3(0, 0.74f, 0), "desk_top", default, 1f, true);
                    foreach (var sx in new[] { -1f, 1f }) foreach (var sz in new[] { -1f, 1f })
                            pf.Box(tb, "Leg", new Vector3(0.06f, 0.72f, 0.06f), new Vector3(sx * (tw / 2f - 0.1f), 0.36f, sz * (td / 2f - 0.1f)), "metal_dark");
                    int chairs = (int)MiniJson.Num(d, "chairs", 0f);
                    int per = Mathf.Max(1, (chairs + 1) / 2);
                    for (int k = 0; k < chairs; k++)
                    {
                        int side = k % 2 == 0 ? -1 : 1, idx = k / 2;
                        pf.Chair(tb, new Vector3(-tw / 2f + tw * (idx + 0.5f) / per, 0, side * (td / 2f + 0.35f)), side < 0 ? 0f : 180f);
                    }
                    if (id.Length > 0) reg.AddInteractable(id, tb.gameObject.AddComponent<Interactable>());
                    break;
                }
                case "projector":
                {
                    var pj = pf.Node(parent, id.Length > 0 ? id : "Projector", pos, rot).transform;
                    pf.Box(pj, "Body", new Vector3(0.3f, 0.1f, 0.24f), new Vector3(0, 0.05f, 0), "plastic");
                    pf.Box(pj, "Lens", new Vector3(0.06f, 0.06f, 0.03f), new Vector3(0, 0.05f, -0.13f), "black");
                    var probe = pf.Node(pj, "Probe", new Vector3(0, 0.05f, 0));
                    var pbc = probe.AddComponent<BoxCollider>(); pbc.isTrigger = true; pbc.size = new Vector3(0.4f, 0.25f, 0.34f);
                    reg.AddInteractable(id.Length > 0 ? id : "Projector", pj.gameObject.AddComponent<Interactable>());
                    var scr = MiniJson.Obj(d, "screen");
                    if (scr != null)
                    {
                        var ss = MiniJson.Floats(scr, "size");
                        var sp = XZ(MiniJson.Floats(scr, "pos"), MiniJson.Num(scr, "y", 1.45f));
                        var screenGo = pf.Decal(parent, "ProjectorScreen", "paper", ss.Length >= 2 ? new Vector2(ss[0], ss[1]) : new Vector2(2f, 1.2f), sp, MiniJson.Num(scr, "rot", 0f), false);
                        // 빛: 화면을 비추는 약한 스포트라이트 (켜짐/꺼짐)
                        var beam = pf.Node(pj, "Beam", new Vector3(0, 0.05f, -0.15f));
                        beam.transform.rotation = Quaternion.LookRotation(screenGo.transform.position - beam.transform.position);
                        var bl = beam.AddComponent<Light>();
                        bl.type = LightType.Spot; bl.spotAngle = 32f; bl.range = 6f; bl.intensity = 1.6f; bl.color = new Color(0.75f, 0.85f, 1f); bl.shadows = LightShadows.None;
                        beam.SetActive(false);
                        reg.ProjectorBeam = beam;
                    }
                    break;
                }
                case "rack":
                {
                    var rk = pf.Node(parent, id.Length > 0 ? id : "Rack", pos, rot).transform;
                    pf.Box(rk, "Body", new Vector3(0.6f, 2.0f, 1.0f), new Vector3(0, 1.0f, 0), "plastic_dark", default, 1f, true);
                    pf.Decal(rk, "Front", "rack_front", new Vector2(0.56f, 1.9f), new Vector3(0, 1.0f, -0.501f), 0f, false);
                    break;
                }
                default:
                    Res.Warn("prop:" + type, "알 수 없는 소품 종류: " + type);
                    break;
            }
        }

        static readonly HashSet<string> GlowDesks = new HashSet<string> { "D12", "D22", "D13", "Desk116" };

        static void BuildDesk(Dictionary<string, object> d, string id, Vector3 pos, float rot, Transform parent, PropFactory pf, WorldRegistry reg, BuildContext ctx)
        {
            bool partition = MiniJson.Bool(d, "partition");
            bool pedestal = MiniJson.Bool(d, "pedestal");
            var desk = pf.Desk(parent, id, pos, rot, partition, pedestal, out var drawer);
            var t = desk.transform;
            string crtMode = MiniJson.Str(d, "crt", "dead");
            CrtParts crt = null;
            if (crtMode != "none")
            {
                crt = pf.Crt(t, "CRT", new Vector3(-0.05f, 0.75f, -0.02f), 0f);
                pf.Keyboard(t, new Vector3(-0.05f, 0.75f, -0.25f), 0f);
            }
            if (crtMode == "live" && crt != null)
            {
                reg.LiveScreen = crt.ScreenTransform;
                reg.LiveScreenRenderer = crt.Screen;
                var mc = crt.ScreenTransform.gameObject.AddComponent<MeshCollider>();
                mc.sharedMesh = crt.ScreenTransform.GetComponent<MeshFilter>().sharedMesh;
                reg.LiveScreenCollider = mc;
                crt.Led.sharedMaterial = ctx.Mats.Get("led_green");
                var comp = crt.Root.AddComponent<Interactable>();
                reg.Computer = comp;
                reg.AddInteractable("Computer", comp);
                // CRT의 창백한 푸른빛이 책상과 주변을 비춘다
                Vector3 normal = crt.ScreenTransform.TransformDirection(Vector3.back);
                var spotGo = new GameObject("CrtLight");
                spotGo.transform.SetParent(crt.Root.transform, false);
                spotGo.transform.position = crt.ScreenTransform.position + normal * 0.06f;
                spotGo.transform.rotation = Quaternion.LookRotation(normal + Vector3.down * 0.25f, Vector3.up);
                var spot = spotGo.AddComponent<Light>();
                spot.type = LightType.Spot;
                spot.spotAngle = 125f;
                spot.range = 4.2f;
                spot.intensity = 1.5f;
                spot.color = new Color(0.55f, 0.72f, 1f);
                spot.shadows = LightShadows.Soft;
                spot.shadowStrength = 0.85f;
                reg.CrtLight = spot;
                var glowGo = new GameObject("CrtGlow");
                glowGo.transform.SetParent(crt.Root.transform, false);
                glowGo.transform.position = crt.ScreenTransform.position + normal * 0.35f;
                var glow = glowGo.AddComponent<Light>();
                glow.type = LightType.Point;
                glow.range = 1.6f;
                glow.intensity = 0.55f;
                glow.color = new Color(0.5f, 0.68f, 1f);
                glow.shadows = LightShadows.None;
                reg.CrtGlow = glow;
            }
            else if (crtMode == "dead" && crt != null)
            {
                var ms = crt.Root.AddComponent<MonitorScreen>();
                ms.Screen = crt.Screen;
                ms.DeadMaterial = ctx.Mats.Get("screen_dead");
                if (GlowDesks.Contains(id) || MiniJson.Bool(d, "glow"))
                {
                    var g = new GameObject("Glow");
                    g.transform.SetParent(crt.Root.transform, false);
                    g.transform.localPosition = new Vector3(0, 0.28f, -0.5f);
                    var gl = g.AddComponent<Light>();
                    gl.type = LightType.Point;
                    gl.range = 1.8f;
                    gl.intensity = 0f;
                    gl.color = new Color(0.5f, 0.7f, 1f);
                    gl.shadows = LightShadows.None;
                    gl.enabled = false;
                    ms.Glow = gl;
                }
                reg.DeadMonitors.Add(ms);
                reg.Monitors[id] = ms;
                reg.AddInteractable("crt_" + id, crt.Root.AddComponent<Interactable>());
            }

            if (MiniJson.Bool(d, "chair"))
            {
                var off = MiniJson.Floats(d, "chairOffset");
                Vector3 cp = off.Length >= 2 ? new Vector3(off[0], 0, off[1]) : new Vector3(0, 0, -0.62f);
                var chairGo = pf.Chair(t, cp, MiniJson.Num(d, "chairRot", 0f));
                if (MiniJson.Bool(d, "chairDynamic") && id.Length > 0) reg.Chairs[id] = chairGo.transform;
                if (crtMode == "live")
                {
                    var seat = pf.Node(t, "SeatPoint", cp, 0f);
                    reg.ChairSeat = seat.transform;
                }
            }
            if (MiniJson.Bool(d, "pc")) pf.Tower(t, new Vector3(-0.45f, 0f, 0.02f), 0f);

            foreach (string item in MiniJson.StrList(d, "items"))
            {
                switch (item)
                {
                    case "badge117":
                    {
                        var b = pf.Decal(t, "Badge117", "badge117", new Vector2(0.06f, 0.09f), new Vector3(0.42f, 0.7515f, -0.22f), 0f, false);
                        b.transform.localRotation = Quaternion.Euler(90f, 14f, 0f);
                        var bc = b.AddComponent<BoxCollider>();
                        bc.size = new Vector3(0.12f, 0.15f, 0.06f);
                        reg.AddInteractable("Badge117", b.AddComponent<Interactable>());
                        break;
                    }
                    case "sticky":
                        if (crt != null)
                        {
                            var s = pf.Decal(crt.Root.transform, "Sticky", "sticky", new Vector2(0.075f, 0.075f), new Vector3(0.17f, 0.43f, -0.0365f), 0f, false);
                            s.transform.localRotation = Quaternion.Euler(0, 0, -6f);
                            reg.AddAnchor("Sticky", s.transform);
                        }
                        break;
                    case "mug": pf.Mug(t, new Vector3(-0.52f, 0.75f, -0.18f)); break;
                    case "powerstrip":
                    {
                        // 책상 왼쪽 다리 옆 바닥의 멀티탭 (엔딩 4: 두 번 뽑으면 공허)
                        var ps = pf.Node(t, "PowerStrip", new Vector3(-0.86f, 0f, -0.18f), 8f).transform;
                        pf.Box(ps, "Body", new Vector3(0.07f, 0.04f, 0.32f), new Vector3(0, 0.02f, 0), "plastic");
                        for (int k = 0; k < 4; k++) pf.Box(ps, "Socket", new Vector3(0.035f, 0.012f, 0.035f), new Vector3(0, 0.045f, -0.11f + k * 0.075f), "plastic_dark");
                        pf.Box(ps, "Led", new Vector3(0.012f, 0.01f, 0.012f), new Vector3(0.024f, 0.045f, 0.14f), "led_red");
                        var pbc = ps.gameObject.AddComponent<BoxCollider>(); pbc.isTrigger = true; pbc.center = new Vector3(0, 0.05f, 0); pbc.size = new Vector3(0.25f, 0.2f, 0.45f);
                        reg.AddInteractable("PowerStrip", ps.gameObject.AddComponent<Interactable>());
                        break;
                    }
                    case "note116":
                    {
                        var n = pf.Decal(t, "Note116", "note116", new Vector2(0.15f, 0.21f), new Vector3(0.38f, 0.7515f, -0.12f), 0f, false);
                        n.transform.localRotation = Quaternion.Euler(90f, -8f, 0f);
                        var nbc = n.AddComponent<BoxCollider>(); nbc.size = new Vector3(0.2f, 0.26f, 0.06f);
                        reg.AddInteractable("Note116", n.AddComponent<Interactable>());
                        break;
                    }
                    case "papers": pf.Papers(t, new Vector3(0.5f, 0.75f, 0.05f), -8f); break;
                    case "boxes": pf.DeskBoxes(t, new Vector3(0f, 0.75f, 0.05f)); break;
                }
            }

            string drawerId = MiniJson.Str(d, "drawer", null);
            if (drawerId != null && drawer != null)
            {
                reg.Drawers[drawerId] = drawer;
                var badge = pf.Decal(drawer.transform, "Badge116", "badge116", new Vector2(0.06f, 0.09f), new Vector3(0.02f, -0.052f, -0.12f), 0f, false);
                badge.transform.localRotation = Quaternion.Euler(90f, -20f, 0f);
            }
            if (id.Length > 0 && crtMode != "live") reg.AddInteractable(id, desk.AddComponent<Interactable>());
            reg.AddAnchor(id, t);
        }

        // ---------- 천장 구멍·케이블 ----------

        static void BuildHole(List<object> p, Transform parent, PropFactory pf, BuildContext ctx)
        {
            if (p == null || p.Count < 2) return;
            float x = (float)(double)p[0], z = (float)(double)p[1];
            pf.Quad(parent, "CeilingHole", new Vector2(0.6f, 0.6f), new Vector3(x, 2.596f, z), new Vector3(-90f, 0, 0), ctx.Mats.Get("hole"));
        }

        static void BuildCable(Dictionary<string, object> d, Transform parent, PropFactory pf)
        {
            if (d == null) return;
            if (MiniJson.Has(d, "hang"))
            {
                Vector3 top = XZ(MiniJson.Floats(d, "hang"), 2.6f);
                float len = MiniJson.Num(d, "len", 0.8f);
                var pts = new List<Vector3>();
                int n = 10;
                float seed = top.x * 3.1f + top.z * 1.7f;
                for (int i = 0; i <= n; i++)
                {
                    float t = i / (float)n;
                    pts.Add(top + new Vector3(Mathf.Sin(seed + t * 2.5f) * 0.05f * t, -len * t, Mathf.Cos(seed * 0.7f + t * 2f) * 0.04f * t));
                }
                // 끝이 살짝 말려 있다
                Vector3 last = pts[pts.Count - 1];
                pts.Add(last + new Vector3(0.04f, 0.03f, 0.02f));
                pf.Cable(parent, pts, 0.012f);
            }
            else if (MiniJson.Has(d, "a"))
            {
                pf.Cable(parent, MeshKit.Sag(XYZ(MiniJson.Floats(d, "a")), XYZ(MiniJson.Floats(d, "b")), MiniJson.Num(d, "sag", 0.3f), 16), 0.011f);
            }
            else if (MiniJson.Has(d, "floor"))
            {
                var pts = new List<Vector3>();
                foreach (object po in MiniJson.List(d, "floor"))
                {
                    if (po is List<object> xy && xy.Count >= 2)
                        pts.Add(new Vector3((float)(double)xy[0], 0.012f, (float)(double)xy[1]));
                }
                var smooth = new List<Vector3>();
                for (int i = 0; i < pts.Count - 1; i++)
                    for (int k = 0; k < 6; k++)
                        smooth.Add(Vector3.Lerp(pts[i], pts[i + 1], k / 6f) + new Vector3(0, 0, Mathf.Sin(i * 2f + k) * 0.01f));
                if (pts.Count > 0) smooth.Add(pts[pts.Count - 1]);
                pf.Cable(parent, smooth, 0.009f);
            }
        }

        // ---------- 바깥 ----------

        static void BuildOutside(Dictionary<string, object> d, Transform parent, PropFactory pf, BuildContext ctx)
        {
            float x = MiniJson.Num(d, "x", 12f), w = MiniJson.Num(d, "width", 30f), h = MiniJson.Num(d, "height", 12f), y = MiniJson.Num(d, "y", 0.5f);
            // 창밖의 건너편 건물 (방 쪽 = -x 를 바라보도록)
            pf.Quad(parent, "NightBackdrop", new Vector2(w, h), new Vector3(x, y + h * 0.25f, 0f), new Vector3(0, 90f, 0), ctx.Mats.Get("window_night"));

            var moon = new GameObject("Moonlight");
            moon.transform.SetParent(parent, false);
            moon.transform.rotation = Quaternion.LookRotation(new Vector3(-1f, -0.6f, 0.25f).normalized, Vector3.up);
            var l = moon.AddComponent<Light>();
            l.type = LightType.Directional;
            l.color = new Color(0.46f, 0.56f, 0.82f);
            l.intensity = 0.32f;
            l.shadows = LightShadows.Soft;
            l.shadowStrength = 0.95f;
            l.shadowBias = 0.03f;
        }
    }
}
