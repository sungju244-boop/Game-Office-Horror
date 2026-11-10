using System.Collections;
using System.Collections.Generic;
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
    public enum GamePhase { Booting, Title, Intro, Playing, Ending }

    /// <summary>
    /// 게임 전체 흐름: 타이틀 → 인트로 → 플레이 → 엔딩, 일시정지, 처음부터 다시.
    /// 어떤 씬에서 Play 해도 자동으로 생성되어 사무실을 코드로 조립한다.
    /// </summary>
    public sealed class GameManager : MonoBehaviour
    {
        public static GameManager Instance { get; private set; }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatic() { Instance = null; }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void AutoCreate()
        {
            if (Instance != null) return;
            var go = new GameObject("NightEval");
            DontDestroyOnLoad(go);
            go.AddComponent<GameManager>();
        }

        public Settings Settings { get; private set; }
        public StoryData Story { get; private set; }
        public Session S { get; private set; }
        public GamePhase Phase { get; private set; }
        public bool Paused { get; private set; }

        string layoutJson;
        StoryVars chaseSnapshot;
        float titleTime;

        void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
            Settings = Settings.Load();
            ConfigureQuality();
        }

        void Start()
        {
            // 브라우저판과 같은 데이터: 이야기 v2 + 넓힌 4층 배치 (이전 이야기는 story_legacy.json 에 보관만 한다)
            string storyJson = Res.ReadStreaming("Story/story.json");
            layoutJson = Res.ReadResourceText("Data/office_layout");
            if (storyJson == null || layoutJson == null)
            {
                Debug.LogError("[야간 평가실] 데이터 파일이 없어 시작할 수 없습니다.");
                return;
            }
            try { Story = StoryData.FromJson(storyJson); }
            catch (System.Exception e) { Debug.LogError("[야간 평가실] story.json 오류: " + e.Message); return; }
            DisableForeignSceneObjects();
            BuildSession(null);
            ShowTitle();
        }

        static void ConfigureQuality()
        {
            QualitySettings.pixelLightCount = 8;
            QualitySettings.shadows = ShadowQuality.All;
            QualitySettings.shadowResolution = ShadowResolution.High;
            QualitySettings.shadowDistance = 22f;
            QualitySettings.shadowCascades = 2;
            QualitySettings.antiAliasing = 4;
            QualitySettings.vSyncCount = 1;
            Application.targetFrameRate = 120;
        }

        /// <summary>테스트 씬에 남아 있는 기본 카메라·조명 등이 섞이지 않도록 끈다.</summary>
        void DisableForeignSceneObjects()
        {
            foreach (var cam in Camera.allCameras) cam.gameObject.SetActive(false);
            foreach (var l in Resources.FindObjectsOfTypeAll<Light>())
                if (l.gameObject.scene.IsValid() && l.transform.root != transform) l.enabled = false;
            foreach (var al in Resources.FindObjectsOfTypeAll<AudioListener>())
                if (al.gameObject.scene.IsValid()) al.enabled = false;
        }

        // ---------- 세션 ----------

        void BuildSession(StoryVars initialVars)
        {
            StopAllCoroutines();
            Time.timeScale = 1f;
            AudioListener.pause = false;
            Paused = false;
            if (S != null) S.Dispose();

            var s = new Session();
            S = s;
            s.Root = new GameObject("Session");
            s.Root.transform.SetParent(transform, false);
            s.Vars = initialVars != null ? initialVars.Clone() : new StoryVars();
            if (s.Vars.Get("clock").Length == 0) s.Vars.Set("clock", "00:00");
            s.Ctx = new BuildContext();

            // 렌더 분위기
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogColor = new Color(0.012f, 0.018f, 0.028f);
            RenderSettings.fogDensity = 0.075f;
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.05f, 0.06f, 0.08f);
            RenderSettings.skybox = null;

            // 공간
            s.World = OfficeBuilder.Build(s.Root.transform, s.Ctx, layoutJson);

            // 소리
            s.Audio = s.Root.AddComponent<AudioDirector>();
            s.Audio.Init(Settings);

            // 플레이어
            var playerGo = new GameObject("Player");
            playerGo.transform.SetParent(s.Root.transform, false);
            playerGo.layer = Layers.IgnoreRaycast;
            var cc = playerGo.AddComponent<CharacterController>();
            cc.height = 1.75f;
            cc.radius = 0.3f;
            cc.center = new Vector3(0, 0.875f, 0);
            cc.stepOffset = 0.25f;
            cc.slopeLimit = 45f;
            cc.skinWidth = 0.03f;
            var head = new GameObject("Head").transform;
            head.SetParent(playerGo.transform, false);
            var camGo = new GameObject("MainCamera");
            camGo.tag = "MainCamera";
            camGo.transform.SetParent(head, false);
            var cam = camGo.AddComponent<Camera>();
            cam.fieldOfView = 62f;
            cam.nearClipPlane = 0.03f;
            cam.farClipPlane = 60f;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = RenderSettings.fogColor;
            cam.cullingMask = ~((1 << Layers.Avatar) | (1 << Layers.Terminal));
            cam.allowHDR = false;
            camGo.AddComponent<AudioListener>();
            s.Cam = cam;
            s.Post = camGo.AddComponent<PostFX>();
            s.Post.Brightness = Settings.Brightness;
            s.Player = playerGo.AddComponent<FirstPersonController>();
            s.Player.Init(head, cam);
            s.Player.Sensitivity = () => Settings.LookMultiplier;
            s.Player.OnStep = tile => s.Audio.Step(tile, s.Player.IsSprinting);
            s.Player.SetPose(s.World.SpawnPos, s.World.SpawnYaw);
            s.Interactor = playerGo.AddComponent<Interactor>();
            s.Interactor.Cam = cam;
            s.World.Avatar.Follow = playerGo.transform;

            // UI
            s.Hud = s.Root.AddComponent<Hud>();
            s.Hud.Build(s.Root.transform);
            s.Interactor.OnPrompt = p => s.Hud.SetPrompt(p);
            s.Menus = s.Root.AddComponent<Menus>();
            s.Menus.Build(s.Root.transform, clip => s.Audio.Ui(clip, 0.35f));

            // 단말기 (화면 UI는 멀리 떨어진 곳에서 렌더텍스처로 그린다)
            var termGo = new GameObject("TerminalRig");
            termGo.transform.SetParent(s.Root.transform, false);
            termGo.transform.position = new Vector3(0f, -400f, 0f);
            s.Terminal = termGo.AddComponent<TerminalScreen>();
            s.Terminal.Init(s.Ctx, s.World.LiveScreenRenderer, s.World.CrtLight, s.World.CrtGlow, Res.Clip);
            s.Terminal.SetHeader("시냅스 평가 단말기", "평가자 117 · 로그인 대기", s.Vars.Get("clock"));
            s.Terminal.ShowCenter("시냅스 평가 단말기", "평가자 117 · 로그인 대기");
            s.Seat = s.Root.AddComponent<TerminalSeat>();
            s.Seat.Init(s.Player, s.Interactor, cam, s.Terminal, s.World.LiveScreen, s.World.LiveScreenCollider, s.World.Avatar);
            s.World.Computer.Add("컴퓨터 사용", () => Phase == GamePhase.Playing && !s.Seat.IsSeated && !s.Seat.InTransition, () => s.Seat.Enter(), 0, this);
            s.Seat.Seated += () => { s.Hud.SetCrosshair(false); s.Vars.Set("sat_once", "1"); s.Guide?.Clear("Computer"); if (s.Vars.Get("objective_seat") == "1") { s.Vars.Remove("objective_seat"); s.Hud.SetObjective(null); } };
            s.Seat.Stood += () => s.Hud.SetCrosshair(true);

            if (s.World.Clock != null) s.World.Clock.ClockSource = () => s.Vars.Get("clock");

            // 연출·이야기·추격
            s.Env = s.Root.AddComponent<EnvironmentDirector>();
            s.Env.baseFog = s.World.Fog;
            RenderSettings.fogDensity = s.World.Fog;
            s.Env.Init(this, s, Story);
            s.Env.StartAmbientLoops();
            s.Story = s.Root.AddComponent<StoryDirector>();
            s.Story.Init(this, s, Story);
            s.Chase = s.Root.AddComponent<ChaseController>();
            s.Chase.Init(s);
            s.Figures = s.Root.AddComponent<FigureDirector>();
            s.Figures.Chicken = Settings.Chicken;
            s.Figures.Init(s);
            s.Guide = s.Root.AddComponent<GuideDirector>();
            s.Guide.Init(this, s);
            s.Hand = s.Root.AddComponent<HandView>();
            s.Hand.Init(cam);
            // F키 손동작을 막는 때: 플레이 중이 아님, 메뉴·창, 미로·명령 입력, 엔딩
            s.Hand.Blocked = () => Phase != GamePhase.Playing || Paused || s.Menus.AnyOpen || s.Terminal.InMaze || s.Story.Ending;

            Phase = GamePhase.Booting;
        }

        // ---------- 흐름 ----------

        void ShowTitle()
        {
            Phase = GamePhase.Title;
            var s = S;
            s.Player.SetControl(false, false);
            s.Interactor.Active = false;
            s.Hud.SetCrosshair(false);
            s.Hud.SetFade(1f);
            titleTime = 0f;
            PlaceTitleCamera(0f);
            s.Audio.SetMusic("title");
            ShowTitleMenu();
            StartCoroutine(s.Hud.Fade(0f, 1.5f));
        }

        void ShowTitleMenu()
        {
            var last = SaveSystem.Last();
            bool anyChapter = SaveSystem.Reached().Count > 0;
            S.Menus.ShowTitle(Settings.EndingsFound(), Settings.EndingCount, () => StartCoroutine(StartGameRoutine()),
                last != null ? (System.Action)(() => { S.Menus.HideTitle(); ResumeFrom(last); }) : null,
                anyChapter ? (System.Action)(() => { S.Menus.HideTitle(); OpenChapters(ShowTitleMenu); }) : null,
                OpenSettings, Quit);
        }

        /// <summary>장 선택: 도달한 장만 고를 수 있다</summary>
        void OpenChapters(System.Action back)
        {
            var labels = new List<string>();
            var picks = new List<System.Action>();
            var reached = SaveSystem.Reached();
            foreach (var ch in Story.Chapters)
            {
                if (!reached.Contains(ch.Id)) continue;
                var snap = SaveSystem.Chapter(ch.Id);
                if (snap == null) continue;
                labels.Add(ch.Time + "  ·  " + ch.Label + "  ·  " + ch.Title);
                picks.Add(() => ResumeFrom(snap));
            }
            S.Menus.ShowChapters(labels, picks, back);
        }

        /// <summary>저장된 지점부터: 세션을 새로 만들고, 117 자리 옆에서 그 노드부터 이어 간다</summary>
        public void ResumeFrom(SaveSnap snap)
        {
            if (snap == null) { Restart(); return; }
            BuildSession(snap.Vars);
            var s = S;
            s.Hud.SetFade(1f);
            s.Player.SetPose(s.World.DeskStandPos, s.World.DeskStandYaw);
            s.Player.SetControl(true, true);
            s.Interactor.Active = true;
            s.Hud.SetCrosshair(true);
            s.Audio.SetMusic("game");
            s.Terminal.ClearBody();
            Phase = GamePhase.Playing;
            s.Story.Begin(snap.Node);
            s.Guide.Set("Computer", "117", 0f);
            StartCoroutine(s.Hud.Fade(0f, 1.2f));
        }

        /// <summary>가짜 "페이지가 응답하지 않습니다" (1단계: 확인 창으로 대신한다)</summary>
        public IEnumerator FakeFreeze()
        {
            var s = S;
            bool done = false;
            s.Player.SetControl(false, false);
            s.Audio.SilenceAll();
            s.Menus.ShowConfirm("야간 평가실이(가) 응답하지 않습니다.\n기다리거나 페이지를 종료할 수 있습니다.", "기다리기", "페이지 종료", () => done = true, () => done = true);
            while (!done) yield return null;
            s.Audio.SetMusic("game");
            if (!s.Seat.IsSeated) s.Player.SetControl(true, true);
        }

        void PlaceTitleCamera(float t)
        {
            var s = S;
            Vector3 drift = new Vector3(Mathf.Sin(t * 0.07f) * 0.25f, Mathf.Sin(t * 0.11f) * 0.05f, Mathf.Cos(t * 0.05f) * 0.15f);
            Vector3 pos = s.World.TitleCamPos + drift;
            s.Cam.transform.SetPositionAndRotation(pos, Quaternion.LookRotation(s.World.TitleCamLook - pos));
        }

        IEnumerator StartGameRoutine()
        {
            var s = S;
            s.Menus.HideTitle();
            Phase = GamePhase.Intro;
            yield return s.Hud.Fade(1f, 1.0f);
            s.Audio.SetMusic("none");
            yield return s.Menus.PlayIntro(Story.IntroLines);
            BeginPlay();
            s.Menus.HideIntro();
            yield return s.Hud.Fade(0f, 1.6f);
        }

        void BeginPlay()
        {
            var s = S;
            s.Cam.transform.localPosition = Vector3.zero;
            s.Cam.transform.localRotation = Quaternion.identity;
            s.Player.SetPose(s.World.SpawnPos, s.World.SpawnYaw);
            s.Player.SetControl(true, true);
            s.Interactor.Active = true;
            s.Hud.SetCrosshair(true);
            s.Audio.SetMusic("game");
            s.Audio.SetTension(0);
            Phase = GamePhase.Playing;
            s.Vars.Set("objective_seat", "1");
            s.Hud.SetObjective("117번 자리를 찾아 앉자. (칸막이 구역 A, 모니터가 켜진 책상)");
            s.Hud.Help("WASD 이동 · 마우스 시점 · E 상호작용 / 앉기 · F 손동작 · ESC 메뉴", 9f);
            s.Guide.Set("Computer", "117", 0f);
            s.Story.Begin(Story.Start);
        }

        public void Restart()
        {
            BuildSession(null);
            StartCoroutine(RestartRoutine());
        }

        IEnumerator RestartRoutine()
        {
            var s = S;
            s.Hud.SetFade(1f);
            Phase = GamePhase.Intro;
            yield return s.Menus.PlayIntro(Story.IntroLines);
            BeginPlay();
            s.Menus.HideIntro();
            yield return s.Hud.Fade(0f, 1.4f);
        }

        public void ToTitle()
        {
            BuildSession(null);
            ShowTitle();
        }

        string chaseNode;
        public void SaveChaseSnapshot(string node)
        {
            chaseSnapshot = S.Vars.Clone();
            chaseNode = node;
        }

        public void RetryChase()
        {
            if (chaseSnapshot == null) { Restart(); return; }
            var snap = chaseSnapshot.Clone();
            BuildSession(snap);
            var s = S;
            s.Hud.SetFade(1f);
            s.Player.SetPose(s.World.DeskStandPos, s.World.DeskStandYaw);
            s.Player.SetControl(true, true);
            s.Interactor.Active = true;
            s.Hud.SetCrosshair(true);
            s.Audio.SetMusic("game");
            s.Terminal.ClearBody();
            s.Terminal.ShowCenter("연결 종료", "");
            Phase = GamePhase.Playing;
            s.Story.Begin(!string.IsNullOrEmpty(chaseNode) ? chaseNode : string.IsNullOrEmpty(Story.ChaseRetry) ? Story.Start : Story.ChaseRetry);
            StartCoroutine(s.Hud.Fade(0f, 1.2f));
        }

        public void AskLeave()
        {
            var s = S;
            if (Phase != GamePhase.Playing) return;
            s.Player.SetControl(false, false);
            s.Interactor.Active = false;
            s.Menus.ShowConfirm("근무를 마치지 않고 퇴근할까?", "퇴근한다", "돌아간다",
                () => TriggerEnding("END_5"),
                () => { s.Player.SetControl(true, true); s.Interactor.Active = true; });
        }

        public void TriggerEnding(string endingId)
        {
            if (Phase == GamePhase.Ending) return;
            if (!Story.Endings.TryGetValue(endingId, out var ending))
            {
                Debug.LogError("[야간 평가실] 엔딩을 찾을 수 없습니다: " + endingId);
                return;
            }
            StartCoroutine(EndingRoutine(ending));
        }

        IEnumerator EndingRoutine(StoryEnding e)
        {
            var s = S;
            Phase = GamePhase.Ending;
            if (Paused) Resume();
            s.Story.Ending = true;
            s.Story.Stop();
            s.Chase.StopChase();
            s.Player.SetControl(false, false);
            s.Interactor.Active = false;
            s.Interactor.ClearPrompt();
            s.Hud.SetCrosshair(false);
            s.Hud.SetObjective(null);
            Settings.MarkEnding(e.Number);
            s.Audio.SilenceAll();
            yield return s.Hud.Fade(1f, e.Bad ? 0.6f : 2.0f);
            s.Seat.ForceExit(true);
            s.Env.StopAllLoops();
            s.Audio.SetMusic("ending");
            var lines = new List<string>();
            foreach (var l in StoryLogic.VisibleLines(e.Lines, s.Vars)) lines.Add(s.Vars.Format(l.Text));
            var choice = SaveSystem.Choice();
            yield return s.Menus.PlayEnding(e, lines, () => { s.Menus.HideEnding(); Restart(); }, e.RetryChase ? (System.Action)RetryChase : null,
                choice != null ? (System.Action)(() => { s.Menus.HideEnding(); ResumeFrom(choice); }) : null,
                SaveSystem.Reached().Count > 0 ? (System.Action)(() => OpenChapters(() => { })) : null);
        }

        // ---------- 일시정지·설정 ----------

        void Pause()
        {
            Paused = true;
            Time.timeScale = 0f;
            AudioListener.pause = true;
            S.Menus.ShowPause(Resume, OpenSettings, () => { Resume(); Restart(); }, () => { Resume(); ToTitle(); }, Quit);
        }

        void Resume()
        {
            Paused = false;
            Time.timeScale = 1f;
            AudioListener.pause = false;
            S.Menus.HidePause();
        }

        void OpenSettings()
        {
            bool fromPause = Paused;
            if (fromPause) S.Menus.HidePause();
            if (Phase == GamePhase.Title) S.Menus.HideTitle();
            S.Menus.ShowSettings(Settings, ApplySettings, () =>
            {
                Settings.Save();
                if (Phase == GamePhase.Title) ShowTitleMenu();
                else if (Paused) S.Menus.ShowPause(Resume, OpenSettings, () => { Resume(); Restart(); }, () => { Resume(); ToTitle(); }, Quit);
            });
        }

        void ApplySettings()
        {
            if (S != null && S.Post != null) S.Post.Brightness = Settings.Brightness;
            AudioListener.volume = Settings.MasterVolume;
        }

        void Quit()
        {
            Settings.Save();
#if UNITY_EDITOR
            UnityEditor.EditorApplication.isPlaying = false;
#else
            Application.Quit();
#endif
        }

        // ---------- 매 프레임 ----------

        void Update()
        {
            if (S == null) return;
            var s = S;

            if (Input.GetKeyDown(KeyCode.Escape))
            {
                if (s.Menus.SettingsOpen) s.Menus.CloseSettings();
                else if (s.Menus.ChaptersOpen) { s.Menus.HideChapters(); if (Phase == GamePhase.Title) ShowTitleMenu(); }
                else if (Phase == GamePhase.Playing)
                {
                    if (s.Menus.ConfirmOpen) { s.Menus.HideConfirm(); s.Player.SetControl(true, true); s.Interactor.Active = true; }
                    else if (Paused) Resume();
                    else if (s.Seat.IsSeated) s.Seat.RequestExit();
                    else if (!s.Seat.InTransition) Pause();
                }
            }

            if (Phase == GamePhase.Title)
            {
                titleTime += Time.unscaledDeltaTime;
                PlaceTitleCamera(titleTime);
            }

            // 커서: 걸어다닐 때만 잠그고, 단말기·메뉴에서는 보인다
            bool locked = Phase == GamePhase.Playing && !Paused && !s.Seat.IsSeated && !s.Menus.ConfirmOpen && !s.Menus.SettingsOpen && Application.isFocused;
            if (locked)
            {
                if (Cursor.lockState != CursorLockMode.Locked) Cursor.lockState = CursorLockMode.Locked;
                Cursor.visible = false;
            }
            else
            {
                if (Cursor.lockState != CursorLockMode.None) Cursor.lockState = CursorLockMode.None;
                Cursor.visible = true;
            }
        }

        void OnApplicationQuit()
        {
            Settings?.Save();
        }
    }
}
