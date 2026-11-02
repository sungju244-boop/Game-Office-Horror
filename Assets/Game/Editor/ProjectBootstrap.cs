// 프로젝트를 처음 열 때 자동으로 필요한 설정을 해 둔다. 플레이테스터는 ▶ Play 만 누르면 된다.
//  - Assets/Game/Scenes/Main.unity 생성, 빌드 목록 등록, 열기
//  - 제품명·해상도·색 공간(Linear) 설정
//  - 입력 방식이 "새 Input System 전용"이면 "둘 다"로 바꾸고 재시작 안내
//  - 메뉴: 야간 평가실 > 실행 파일 만들기 / 스토리 데이터 폴더 열기
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace NightEval.EditorTools
{
    [InitializeOnLoad]
    public static class ProjectBootstrap
    {
        const string ScenePath = "Assets/Game/Scenes/Main.unity";
        const string Marker = "ProjectSettings/NightEvalBootstrap.txt";

        static ProjectBootstrap()
        {
            EditorApplication.delayCall += Run;
        }

        static void Run()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode || BuildPipeline.isBuildingPlayer) return;
            EnsureScene();
            EnsureBuildSettings();
            if (!File.Exists(Marker))
            {
                ApplyPlayerSettings();
                File.WriteAllText(Marker, "야간 평가실 초기 설정 완료\n");
            }
            EnsureInputHandling();
            OpenMainSceneIfEmpty();
        }

        static void EnsureScene()
        {
            if (File.Exists(ScenePath)) return;
            Directory.CreateDirectory(Path.GetDirectoryName(ScenePath));
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            new GameObject("야간 평가실 — ▶ Play 를 누르면 게임이 코드로 생성됩니다");
            EditorSceneManager.SaveScene(scene, ScenePath);
            AssetDatabase.Refresh();
            Debug.Log("[야간 평가실] Main 씬을 만들었습니다: " + ScenePath);
        }

        static void EnsureBuildSettings()
        {
            if (!File.Exists(ScenePath)) return;
            var scenes = EditorBuildSettings.scenes;
            if (scenes.Length == 1 && scenes[0].path == ScenePath && scenes[0].enabled) return;
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        }

        static void ApplyPlayerSettings()
        {
            PlayerSettings.productName = "야간 평가실";
            PlayerSettings.companyName = "NightEval";
            PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.defaultScreenWidth = 1920;
            PlayerSettings.defaultScreenHeight = 1080;
            PlayerSettings.fullScreenMode = FullScreenMode.FullScreenWindow;
            PlayerSettings.resizableWindow = true;
            PlayerSettings.runInBackground = false;
            PlayerSettings.visibleInBackground = true;
            Debug.Log("[야간 평가실] Player 설정을 적용했습니다 (Linear, 1920x1080).");
        }

        static void EnsureInputHandling()
        {
            var settings = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset").FirstOrDefault();
            if (settings == null) return;
            var so = new SerializedObject(settings);
            var prop = so.FindProperty("activeInputHandler");
            if (prop == null || prop.intValue != 1) return; // 0 = 기존 Input Manager, 2 = 둘 다
            prop.intValue = 2;
            so.ApplyModifiedPropertiesWithoutUndo();
            AssetDatabase.SaveAssets();
            if (EditorUtility.DisplayDialog("야간 평가실", "입력 설정을 '둘 다(Both)'로 바꿨습니다.\nUnity를 다시 시작해야 적용됩니다.", "지금 다시 시작", "나중에"))
                EditorApplication.OpenProject(Directory.GetCurrentDirectory());
        }

        static void OpenMainSceneIfEmpty()
        {
            var active = SceneManager.GetActiveScene();
            bool untitled = string.IsNullOrEmpty(active.path);
            if (!untitled || active.isDirty || !File.Exists(ScenePath)) return;
            if (active.rootCount > 2) return;
            EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
        }

        [MenuItem("야간 평가실/Main 씬 열기", false, 1)]
        static void OpenMain()
        {
            EnsureScene();
            if (EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())
                EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
        }

        [MenuItem("야간 평가실/스토리 데이터 폴더 열기", false, 2)]
        static void RevealStory()
        {
            EditorUtility.RevealInFinder(Path.GetFullPath("Assets/StreamingAssets/Story/story.json"));
        }

        [MenuItem("야간 평가실/실행 파일 만들기 (현재 OS)", false, 20)]
        static void Build()
        {
            EnsureScene();
            EnsureBuildSettings();
            BuildTarget target;
            string exe;
            switch (Application.platform)
            {
                case RuntimePlatform.OSXEditor: target = BuildTarget.StandaloneOSX; exe = "NightEvaluation.app"; break;
                case RuntimePlatform.LinuxEditor: target = BuildTarget.StandaloneLinux64; exe = "NightEvaluation.x86_64"; break;
                default: target = BuildTarget.StandaloneWindows64; exe = "NightEvaluation.exe"; break;
            }
            string dir = Path.Combine("Builds", target.ToString());
            Directory.CreateDirectory(dir);
            var options = new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = Path.Combine(dir, exe),
                target = target,
                targetGroup = BuildPipeline.GetBuildTargetGroup(target),
                options = BuildOptions.None
            };
            BuildReport report = BuildPipeline.BuildPlayer(options);
            if (report.summary.result == BuildResult.Succeeded)
            {
                EditorUtility.RevealInFinder(Path.GetFullPath(options.locationPathName));
                EditorUtility.DisplayDialog("야간 평가실", "빌드 완료:\n" + Path.GetFullPath(options.locationPathName), "확인");
            }
            else
            {
                EditorUtility.DisplayDialog("야간 평가실", "빌드 실패: " + report.summary.result + "\nConsole 창의 빨간 오류를 확인해 주세요.", "확인");
            }
        }
    }
}
