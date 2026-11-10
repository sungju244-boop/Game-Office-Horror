using System.Collections.Generic;
using UnityEngine;

namespace NightEval.World
{
    /// <summary>
    /// 만들어진 공간에서 이야기 이벤트가 이름으로 찾을 대상들 (문, 조명 묶음, 확인 지점, 소리 위치 등).
    /// </summary>
    /// <summary>추격 중 가까이 가면 쓰러지는 캐비닛 (0 = 서 있음, 1 = 넘어지는 중, 2 = 쓰러짐)</summary>
    public sealed class FallCabinet : MonoBehaviour
    {
        public Vector3 Center;
        public float Yaw;
        public int State;
        public float T;
    }

    public sealed class WorldRegistry
    {
        public Transform Root;
        public readonly Dictionary<string, Transform> Anchors = new Dictionary<string, Transform>();
        public readonly Dictionary<string, Door> Doors = new Dictionary<string, Door>();
        public readonly Dictionary<string, Interactable> Interactables = new Dictionary<string, Interactable>();
        public readonly Dictionary<string, List<CeilingLight>> LightGroups = new Dictionary<string, List<CeilingLight>>();
        public readonly Dictionary<string, DrawerSlide> Drawers = new Dictionary<string, DrawerSlide>();
        public readonly List<MonitorScreen> DeadMonitors = new List<MonitorScreen>();
        public readonly Dictionary<string, MonitorScreen> Monitors = new Dictionary<string, MonitorScreen>();
        public readonly Dictionary<string, Transform> Chairs = new Dictionary<string, Transform>();

        public Vector3 SpawnPos;
        public float SpawnYaw;
        public Vector3 DeskStandPos;
        public float DeskStandYaw;
        public Vector3 TitleCamPos;
        public Vector3 TitleCamLook;

        // 플레이어 자리
        public Interactable Computer;
        public Transform LiveScreen;
        public MeshCollider LiveScreenCollider;
        public Renderer LiveScreenRenderer;
        public Light CrtLight;
        public Light CrtGlow;
        public Transform ChairSeat;

        public MonitorScreen CctvMonitor;
        public GameObject ProjectorBeam;
        public GameObject VoidFloor;
        public readonly List<FallCabinet> FallCabs = new List<FallCabinet>();          // 엔딩 4 공허 바닥      // 회의실 프로젝터 빛 (켜짐/꺼짐)
        public float Fog = 0.062f;            // 배치 데이터의 기본 안개
        public Vector3 SupSpawn, ExitPoint, VoidPoint;
        public CctvCamera Cctv;
        public readonly Dictionary<string, CctvCamera> Cctvs = new Dictionary<string, CctvCamera>();
        public WallClock Clock;
        public PlayerAvatar Avatar;

        public void AddAnchor(string id, Transform t)
        {
            if (!string.IsNullOrEmpty(id) && t != null) Anchors[id] = t;
        }

        public void AddInteractable(string id, Interactable it)
        {
            if (string.IsNullOrEmpty(id) || it == null) return;
            it.Id = id;
            Interactables[id] = it;
            AddAnchor(id, it.transform);
        }

        public void AddLight(string group, CeilingLight light)
        {
            if (!LightGroups.TryGetValue(group, out var list)) LightGroups[group] = list = new List<CeilingLight>();
            list.Add(light);
        }

        public Transform Anchor(string id)
        {
            if (string.IsNullOrEmpty(id)) return null;
            return Anchors.TryGetValue(id, out var t) ? t : null;
        }

        /// <summary>"crt_*" 처럼 끝에 * 를 붙이면 접두어가 같은 것 전부.</summary>
        public List<Interactable> FindInteractables(string pattern)
        {
            var list = new List<Interactable>();
            if (string.IsNullOrEmpty(pattern)) return list;
            if (pattern.EndsWith("*"))
            {
                string prefix = pattern.Substring(0, pattern.Length - 1);
                foreach (var kv in Interactables) if (kv.Key.StartsWith(prefix)) list.Add(kv.Value);
            }
            else if (Interactables.TryGetValue(pattern, out var it)) list.Add(it);
            return list;
        }

        public IEnumerable<CeilingLight> Lights(string group)
        {
            if (group == "all")
            {
                foreach (var kv in LightGroups) foreach (var l in kv.Value) yield return l;
                yield break;
            }
            if (LightGroups.TryGetValue(group, out var list)) foreach (var l in list) yield return l;
        }
    }
}
