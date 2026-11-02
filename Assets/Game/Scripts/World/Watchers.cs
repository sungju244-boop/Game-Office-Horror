using System.Collections;
using UnityEngine;

namespace NightEval.World
{
    /// <summary>천장 돔 CCTV. 플레이어를 따라 돌고, 감독석 모니터에 실시간 영상을 보낸다.</summary>
    public sealed class CctvCamera : MonoBehaviour
    {
        public Transform Head;
        public Renderer Led;
        public Material LedOn, LedOff;
        public Camera FeedCamera;
        public RenderTexture FeedTexture;
        public Transform Target;
        public bool Tracking;
        public System.Action OnServo;

        Coroutine feed;
        float servoCooldown;

        public void SetLed(bool on)
        {
            if (Led != null) Led.sharedMaterial = on ? LedOn : LedOff;
        }

        public void StartFeed()
        {
            if (feed == null && FeedCamera != null) feed = StartCoroutine(Feed());
        }

        IEnumerator Feed()
        {
            var wait = new WaitForSeconds(1f / 12f); // 끊기는 감시 영상 느낌
            while (true)
            {
                if (FeedCamera != null && FeedTexture != null) FeedCamera.Render();
                yield return wait;
            }
        }

        void LateUpdate()
        {
            if (!Tracking || Target == null || Head == null) return;
            Vector3 dir = Target.position + Vector3.up * 1.2f - Head.position;
            if (dir.sqrMagnitude < 0.01f) return;
            Quaternion want = Quaternion.LookRotation(dir.normalized, Vector3.up);
            Quaternion before = Head.rotation;
            Head.rotation = Quaternion.RotateTowards(Head.rotation, want, 35f * Time.deltaTime);
            servoCooldown -= Time.deltaTime;
            if (Quaternion.Angle(before, Head.rotation) > 0.2f && servoCooldown <= 0f)
            {
                servoCooldown = 2.5f;
                OnServo?.Invoke();
            }
        }
    }

    /// <summary>
    /// CCTV에만 보이는 플레이어의 몸 (메인 카메라는 이 레이어를 그리지 않는다).
    /// 앉아 있을 때는 의자 위에 앉은 자세로 바뀐다.
    /// </summary>
    public sealed class PlayerAvatar : MonoBehaviour
    {
        public Transform Follow;
        public GameObject Standing, Seated;
        public Transform SeatPoint;
        public bool IsSeated;

        void LateUpdate()
        {
            if (IsSeated && SeatPoint != null)
            {
                transform.SetPositionAndRotation(SeatPoint.position, SeatPoint.rotation);
            }
            else if (Follow != null)
            {
                transform.position = Follow.position;
                transform.rotation = Quaternion.Euler(0f, Follow.eulerAngles.y, 0f);
            }
            if (Standing != null && Standing.activeSelf == IsSeated) Standing.SetActive(!IsSeated);
            if (Seated != null && Seated.activeSelf != IsSeated) Seated.SetActive(IsSeated);
        }
    }
}
