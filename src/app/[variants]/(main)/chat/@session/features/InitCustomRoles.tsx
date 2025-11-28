'use client';

import { memo, useEffect } from 'react';

import { getSessionStoreState, useSessionStore } from '@/store/session';
import { sessionMetaSelectors } from '@/store/session/selectors';

interface RoleItem {
  description?: string;
  name: string;
  personality?: any;
  role_id: number | string;
}

const FLAG = 'lobechat.customRolesImported.v1';

const InitCustomRoles = memo(() => {
  const createSession = useSessionStore((s) => s.createSession);

  useEffect(() => {
    // avoid SSR
    if (typeof window === 'undefined') return;

    const runCleanup = async (roles: RoleItem[]) => {
      try {
        const roleNames = new Set(roles.map((r) => r.name).filter(Boolean));
        const { sessions } = getSessionStoreState();
        const isLocal = (m: any) => m?.backgroundColor === '#e6f7ff';

        // 0) 识别“本地角色会话”标题集合
        const localTitles = new Set<string>();
        sessions.forEach((s) => {
          const title = sessionMetaSelectors.getTitle(s.meta);
          if (isLocal(s.meta)) localTitles.add(title);
        });

        // 1) 去重：同名仅保留第一条
        const map = new Map<string, string[]>(); // title -> ids
        sessions.forEach((s) => {
          const title = sessionMetaSelectors.getTitle(s.meta);
          if (!roleNames.has(title)) return;
          const arr = map.get(title) || [];
          arr.push(s.id);
          map.set(title, arr);
        });
        const remove = useSessionStore.getState().removeSession;
        const patch = useSessionStore.getState().internal_updateSession;
        for (const [, ids] of map.entries()) {
          if (ids.length > 1) {
            const toDelete = ids.slice(1);
            for (const id of toDelete) await remove(id);
          }
          const keepId = ids[0];
          const s = getSessionStoreState().sessions.find((i) => i.id === keepId);
          if (s && s.meta?.backgroundColor !== '#e6f7ff') {
            await patch(keepId, { meta: { backgroundColor: '#e6f7ff' } as any });
          }
        }

        // 2) 安全改名：当检测到“仅有一个新增角色名”和“仅有一个旧的本地标题不在角色列表”时，认为是一次改名
        const addedNames = [...roleNames].filter((n) => !localTitles.has(n));
        const removedLocalTitles = [...localTitles].filter((t) => !roleNames.has(t));
        if (addedNames.length === 1 && removedLocalTitles.length === 1) {
          const newName = addedNames[0];
          const oldTitle = removedLocalTitles[0];
          const targetRole = roles.find((r) => r.name === newName);
          const sessionToRename = sessions.find(
            (s) => isLocal(s.meta) && sessionMetaSelectors.getTitle(s.meta) === oldTitle,
          );
          if (targetRole && sessionToRename) {
            await patch(sessionToRename.id, {
              meta: {
                ...sessionToRename.meta,
                backgroundColor: '#e6f7ff',
                description: targetRole.description,
                title: newName,
              } as any,
            });
          }
        }
      } catch {
        // ignore cleanup errors to avoid breaking UI
      }
    };

    const run = async () => {
      try {
        const res = await fetch('/webapi/roles');
        if (!res.ok) return;
        const roles: RoleItem[] = await res.json();

        // A) 永远先做一次去重清理（幂等）
        await runCleanup(roles);

        // B) 始终确保缺失会话被创建（幂等）；仅用 processing 标记避免并发
        const flag = localStorage.getItem(FLAG);
        if (flag === 'processing') return; // 正在进行的并发保护
        localStorage.setItem(FLAG, 'processing');

        // C) 导入缺失会话（幂等）
        for (const role of roles) {
          const { sessions } = getSessionStoreState();
          const exists = sessions.some((s) => sessionMetaSelectors.getTitle(s.meta) === role.name);
          if (exists) continue;

          await createSession(
            {
              config: { systemRole: role.description || '' } as any,
              meta: { backgroundColor: '#e6f7ff', description: role.description, title: role.name },
            },
            false,
          );
        }
        localStorage.setItem(FLAG, '1');
      } catch {
        // reset flag so it can retry next time
        localStorage.removeItem(FLAG);
      }
    };

    run();
  }, [createSession]);

  return null;
});

export default InitCustomRoles;
