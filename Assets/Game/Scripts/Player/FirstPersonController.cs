using NightEval.World;
using UnityEngine;

namespace NightEval.Player
{
    /// <summary>1인칭 이동 (WASD·방향키, Shift 달리기), 마우스 시점, 발소리, 가벼운 머리 흔들림.</summary>
    [RequireComponent(typeof(CharacterController))]
    public sealed class FirstPersonController : MonoBehaviour
    {
        public const float EyeHeight = 1.62f;

        public Transform Head;
        public Camera Cam;
        public float WalkSpeed = 2.3f;
        public float SprintSpeed = 4.9f;
        public bool MoveEnabled;
        public bool AnyDirSprint;            // 위에서 보는 추격 화면: 어느 방향으로든 달린다
        public float SpeedMul = 1f;          // 캐비닛에 깔려 비틀거릴 때 느려진다
        public bool LookEnabled;
        public System.Func<float> Sensitivity = () => 2f;
        public System.Action<bool> OnStep; // true = 타일 바닥

        CharacterController cc;
        float yaw, pitch, vy;
        float stepAccum, bobTime;
        Vector3 headRest;
        bool axisWarned;

        public bool IsMoving { get; private set; }
        public bool IsSprinting { get; private set; }
        public float Yaw => yaw;

        public void Init(Transform head, Camera cam)
        {
            Head = head;
            Cam = cam;
            cc = GetComponent<CharacterController>();
            headRest = new Vector3(0f, EyeHeight, 0f);
            Head.localPosition = headRest;
        }

        public void SetPose(Vector3 position, float yawDeg, float pitchDeg = 0f)
        {
            if (cc == null) cc = GetComponent<CharacterController>();
            bool was = cc.enabled;
            cc.enabled = false;
            transform.position = position;
            cc.enabled = was;
            yaw = yawDeg;
            pitch = pitchDeg;
            vy = 0f;
            ApplyRotation();
        }

        public void SetControl(bool move, bool look)
        {
            MoveEnabled = move;
            LookEnabled = look;
            if (!move) { IsMoving = false; IsSprinting = false; }
        }

        void ApplyRotation()
        {
            transform.rotation = Quaternion.Euler(0f, yaw, 0f);
            if (Head != null) Head.localRotation = Quaternion.Euler(pitch, 0f, 0f);
        }

        float MouseAxis(string axis)
        {
            try { return Input.GetAxisRaw(axis); }
            catch (System.ArgumentException)
            {
                if (!axisWarned) { axisWarned = true; Debug.LogError("[야간 평가실] Input Manager에 '" + axis + "' 축이 없습니다."); }
                return 0f;
            }
        }

        void Update()
        {
            if (Time.timeScale <= 0f || cc == null) return;
            float dt = Time.deltaTime;

            if (LookEnabled)
            {
                float k = Sensitivity();
                yaw += MouseAxis("Mouse X") * k;
                pitch -= MouseAxis("Mouse Y") * k;
                pitch = Mathf.Clamp(pitch, -82f, 82f);
                ApplyRotation();
            }

            Vector3 move = Vector3.zero;
            IsSprinting = false;
            if (MoveEnabled)
            {
                float x = 0f, z = 0f;
                if (Input.GetKey(KeyCode.W) || Input.GetKey(KeyCode.UpArrow)) z += 1f;
                if (Input.GetKey(KeyCode.S) || Input.GetKey(KeyCode.DownArrow)) z -= 1f;
                if (Input.GetKey(KeyCode.D) || Input.GetKey(KeyCode.RightArrow)) x += 1f;
                if (Input.GetKey(KeyCode.A) || Input.GetKey(KeyCode.LeftArrow)) x -= 1f;
                var input = new Vector3(x, 0f, z);
                if (input.sqrMagnitude > 1f) input.Normalize();
                IsSprinting = (Input.GetKey(KeyCode.LeftShift) || Input.GetKey(KeyCode.RightShift)) && (z > 0.1f || (AnyDirSprint && input.sqrMagnitude > 0.01f));
                float speed = (IsSprinting ? SprintSpeed : WalkSpeed) * SpeedMul;
                move = transform.TransformDirection(input) * speed;
            }

            vy = cc.isGrounded ? -1f : vy - 9.8f * dt;
            cc.Move((move + Vector3.up * vy) * dt);

            Vector3 hv = cc.velocity;
            hv.y = 0f;
            float speedNow = hv.magnitude;
            IsMoving = speedNow > 0.3f;

            // 발소리
            if (IsMoving)
            {
                stepAccum += speedNow * dt;
                float stride = IsSprinting ? 0.95f : 0.68f;
                if (stepAccum >= stride)
                {
                    stepAccum = 0f;
                    Vector3 p = transform.position;
                    bool tile = p.z > 5.05f || p.z < -5.05f;
                    OnStep?.Invoke(tile);
                }
            }
            else stepAccum = 0.5f;

            // 머리 흔들림 (아주 약하게)
            if (Head != null && MoveEnabled)
            {
                if (IsMoving) bobTime += dt * (IsSprinting ? 13f : 8.5f);
                float amp = IsMoving ? (IsSprinting ? 0.035f : 0.018f) : 0f;
                Vector3 target = headRest + new Vector3(Mathf.Cos(bobTime * 0.5f) * amp * 0.5f, Mathf.Abs(Mathf.Sin(bobTime)) * amp, 0f);
                Head.localPosition = Vector3.Lerp(Head.localPosition, target, dt * 10f);
            }
        }
    }

    /// <summary>화면 중앙 조준점으로 상호작용 대상을 찾고 E 로 실행.</summary>
    public sealed class Interactor : MonoBehaviour
    {
        public Camera Cam;
        public float Range = 2.3f;
        public bool Active;
        public System.Action<string> OnPrompt; // null = 대상 없음

        Interactable current;
        string lastPrompt = "\u0001";

        void Update()
        {
            current = null;
            string prompt = null;
            if (Active && Cam != null && Time.timeScale > 0f)
            {
                var ray = new Ray(Cam.transform.position, Cam.transform.forward);
                if (Physics.Raycast(ray, out RaycastHit hit, Range, Layers.WorldMask, QueryTriggerInteraction.Collide))
                {
                    var it = hit.collider.GetComponentInParent<Interactable>();
                    if (it != null && it.TryGetPrompt(out string p))
                    {
                        current = it;
                        prompt = p;
                    }
                }
            }
            if (prompt != lastPrompt)
            {
                lastPrompt = prompt;
                OnPrompt?.Invoke(prompt);
            }
            if (current != null && Input.GetKeyDown(KeyCode.E)) current.Use();
        }

        public void ClearPrompt()
        {
            lastPrompt = null;
            OnPrompt?.Invoke(null);
        }
    }
}
