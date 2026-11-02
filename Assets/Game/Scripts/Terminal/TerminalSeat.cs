using System;
using System.Collections;
using NightEval.Player;
using NightEval.World;
using UnityEngine;

namespace NightEval.Terminal
{
    /// <summary>
    /// 컴퓨터 사용: E → 카메라가 모니터 정면으로 이동, 이동·시점 잠금, 마우스 커서로 선택.
    /// ESC → 원래 자리·조작 복구.
    /// </summary>
    public sealed class TerminalSeat : MonoBehaviour
    {
        public bool IsSeated { get; private set; }
        public bool InTransition { get; private set; }
        public event Action Seated;
        public event Action Stood;

        FirstPersonController player;
        Interactor interactor;
        Camera cam;
        TerminalScreen terminal;
        Transform screen;
        MeshCollider screenCollider;
        PlayerAvatar avatar;
        Vector3 viewPos;
        Quaternion viewRot;
        Coroutine routine;
        float breathe;

        public void Init(FirstPersonController player, Interactor interactor, Camera cam, TerminalScreen terminal, Transform screen, MeshCollider screenCollider, PlayerAvatar avatar)
        {
            this.player = player;
            this.interactor = interactor;
            this.cam = cam;
            this.terminal = terminal;
            this.screen = screen;
            this.screenCollider = screenCollider;
            this.avatar = avatar;

            // 화면(가로 0.36m, 세로 0.27m)이 세로 시야의 약 80%를 채우는 거리
            Vector3 normal = screen.TransformDirection(Vector3.back).normalized;
            float vfov = cam.fieldOfView * Mathf.Deg2Rad;
            float dist = (0.27f / 0.8f) / (2f * Mathf.Tan(vfov * 0.5f));
            viewPos = screen.position + normal * dist;
            viewRot = Quaternion.LookRotation(-normal, Vector3.up);
        }

        public void Enter()
        {
            if (IsSeated || InTransition) return;
            if (routine != null) StopCoroutine(routine);
            routine = StartCoroutine(EnterRoutine());
        }

        IEnumerator EnterRoutine()
        {
            InTransition = true;
            player.SetControl(false, false);
            interactor.Active = false;
            interactor.ClearPrompt();
            if (avatar != null) avatar.IsSeated = true;
            Vector3 fromP = cam.transform.position;
            Quaternion fromR = cam.transform.rotation;
            float t = 0f;
            while (t < 1f)
            {
                t += Time.deltaTime / 0.6f;
                float e = Mathf.SmoothStep(0f, 1f, Mathf.Clamp01(t));
                cam.transform.SetPositionAndRotation(Vector3.Lerp(fromP, viewPos, e), Quaternion.Slerp(fromR, viewRot, e));
                yield return null;
            }
            cam.transform.SetPositionAndRotation(viewPos, viewRot);
            IsSeated = true;
            InTransition = false;
            terminal.AcceptInput = true;
            routine = null;
            Seated?.Invoke();
        }

        public void RequestExit()
        {
            if (!IsSeated || InTransition) return;
            if (routine != null) StopCoroutine(routine);
            routine = StartCoroutine(ExitRoutine(0.5f));
        }

        public void ForceExit(bool instant)
        {
            if (!IsSeated && !InTransition) return;
            if (routine != null) StopCoroutine(routine);
            routine = null;
            if (instant)
            {
                FinishExit();
                cam.transform.localPosition = Vector3.zero;
                cam.transform.localRotation = Quaternion.identity;
            }
            else routine = StartCoroutine(ExitRoutine(0.45f));
        }

        IEnumerator ExitRoutine(float time)
        {
            InTransition = true;
            IsSeated = false;
            terminal.AcceptInput = false;
            // 카메라는 머리(Head)의 자식이므로 로컬 원점으로 돌아가면 된다
            Vector3 startWorld = cam.transform.position;
            Quaternion startRot = cam.transform.rotation;
            float t = 0f;
            while (t < 1f)
            {
                t += Time.deltaTime / time;
                float e = Mathf.SmoothStep(0f, 1f, Mathf.Clamp01(t));
                Vector3 headPos = cam.transform.parent.position;
                Quaternion headRot = cam.transform.parent.rotation;
                cam.transform.SetPositionAndRotation(Vector3.Lerp(startWorld, headPos, e), Quaternion.Slerp(startRot, headRot, e));
                yield return null;
            }
            cam.transform.localPosition = Vector3.zero;
            cam.transform.localRotation = Quaternion.identity;
            FinishExit();
            routine = null;
        }

        void FinishExit()
        {
            IsSeated = false;
            InTransition = false;
            terminal.AcceptInput = false;
            terminal.UpdatePointer(null);
            if (avatar != null) avatar.IsSeated = false;
            player.SetControl(true, true);
            interactor.Active = true;
            Stood?.Invoke();
        }

        void Update()
        {
            if (!IsSeated || Time.timeScale <= 0f) return;

            // 숨쉬듯 아주 미세한 흔들림 (화면이 살아 있는 느낌)
            breathe += Time.deltaTime;
            cam.transform.SetPositionAndRotation(viewPos + new Vector3(0f, Mathf.Sin(breathe * 1.1f) * 0.0015f, 0f), viewRot);

            Vector2? p = ScreenToTerminal(Input.mousePosition);
            terminal.UpdatePointer(p);
            if (Input.GetMouseButtonDown(0)) terminal.Click(p);
            if (Input.GetKeyDown(KeyCode.Space) || Input.GetKeyDown(KeyCode.Return) || Input.GetKeyDown(KeyCode.KeypadEnter))
                terminal.Click(null);
            terminal.Scroll(Input.mouseScrollDelta.y);
        }

        Vector2? ScreenToTerminal(Vector3 mouse)
        {
            if (screenCollider == null) return null;
            Ray r = cam.ScreenPointToRay(mouse);
            if (!screenCollider.Raycast(r, out RaycastHit hit, 5f)) return null;
            Vector2 uv = TerminalScreen.CrtCurve(hit.textureCoord);
            if (uv.x < 0f || uv.x > 1f || uv.y < 0f || uv.y > 1f) return null;
            return new Vector2(uv.x * TerminalScreen.W, uv.y * TerminalScreen.H);
        }
    }
}
