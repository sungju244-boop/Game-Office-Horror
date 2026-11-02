using System;
using System.Collections.Generic;
using UnityEngine;

namespace NightEval.World
{
    /// <summary>
    /// E 키로 상호작용할 수 있는 대상. 한 물체에 여러 동작(조사, 확인 지점, 퇴근 등)을 겹쳐 둘 수 있고
    /// 지금 쓸 수 있는 것 중 우선순위가 가장 높은 동작 하나만 안내·실행한다.
    /// </summary>
    public sealed class Interactable : MonoBehaviour
    {
        public string Id = "";

        sealed class Handler
        {
            public string Prompt;
            public Func<bool> Can;
            public Action Use;
            public int Priority;
            public object Owner;
        }

        readonly List<Handler> handlers = new List<Handler>();

        public void Add(string prompt, Func<bool> can, Action use, int priority = 0, object owner = null)
        {
            handlers.Add(new Handler { Prompt = prompt, Can = can, Use = use, Priority = priority, Owner = owner });
        }

        public void RemoveOwner(object owner)
        {
            handlers.RemoveAll(h => ReferenceEquals(h.Owner, owner));
        }

        Handler Active()
        {
            Handler best = null;
            foreach (var h in handlers)
            {
                if (h.Can != null && !h.Can()) continue;
                if (best == null || h.Priority > best.Priority) best = h;
            }
            return best;
        }

        public bool TryGetPrompt(out string prompt)
        {
            var h = Active();
            prompt = h != null ? h.Prompt : null;
            return h != null;
        }

        public void Use()
        {
            var h = Active();
            h?.Use?.Invoke();
        }
    }
}
