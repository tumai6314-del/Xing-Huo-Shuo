'use client';

import { useEffect, useRef } from 'react';

import { useQueryRoute } from '@/hooks/useQueryRoute';
import { useChatStore } from '@/store/chat';
import { chatSelectors } from '@/store/chat/selectors';
import { useSessionStore } from '@/store/session';

const InitWelcomeMessage = () => {
  const replace = useQueryRoute().replace;
  const activeId = useSessionStore((s) => s.activeId);
  const chats = useChatStore(chatSelectors.activeBaseChats);
  const doneRef = useRef(false);

  useEffect(() => {
    if (doneRef.current) return;
    const sp = new URLSearchParams(window.location.search);
    const welcome = sp.get('welcome');
    const force = sp.get('forceWelcome');
    if (!welcome) return;

    if (!activeId) return;

    const hasAnyMessage = (chats?.length ?? 0) > 0;

    const run = async () => {
      const { internal_createMessage } = useChatStore.getState();
      if (!hasAnyMessage || force === '1') {
        await internal_createMessage({
          content: welcome,
          role: 'assistant',
          sessionId: activeId,
        } as any);
      }
      // consume the query param
      doneRef.current = true;
      sp.delete('welcome');
      sp.delete('forceWelcome');
      replace('/chat', { query: Object.fromEntries(sp.entries()), replace: true });
    };

    void run();
  }, [activeId, chats]);

  return null;
};

export default InitWelcomeMessage;
