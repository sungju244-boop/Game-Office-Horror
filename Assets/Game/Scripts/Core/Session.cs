using NightEval.Director;
using NightEval.Player;
using NightEval.Rendering;
using NightEval.Story;
using NightEval.Terminal;
using NightEval.UI;
using NightEval.World;
using UnityEngine;

namespace NightEval
{
    /// <summary>
    /// 한 번의 플레이(세션)에 속한 모든 것. "처음부터 다시"는 세션을 통째로 버리고 새로 만든다.
    /// 그래서 문·조명·선택 기록이 전부 초기 상태로 돌아간다.
    /// </summary>
    public sealed class Session
    {
        public GameObject Root;
        public StoryVars Vars;
        public BuildContext Ctx;
        public WorldRegistry World;
        public FirstPersonController Player;
        public Camera Cam;
        public Interactor Interactor;
        public PostFX Post;
        public TerminalScreen Terminal;
        public TerminalSeat Seat;
        public AudioDirector Audio;
        public EnvironmentDirector Env;
        public StoryDirector Story;
        public ChaseController Chase;
        public Hud Hud;
        public Menus Menus;

        public void Dispose()
        {
            if (Root != null)
            {
                // 같은 프레임에 새 세션이 만들어지므로 먼저 꺼서 카메라·리스너가 겹치지 않게 한다
                Root.SetActive(false);
                Object.Destroy(Root);
            }
            Root = null;
            Ctx?.Dispose();
            Ctx = null;
        }
    }
}
