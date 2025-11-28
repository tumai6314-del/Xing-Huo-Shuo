'use client';

import React, { memo, useCallback } from 'react';

import { SkeletonList, VirtualizedList } from '@/features/Conversation';
import WideScreenContainer from '@/features/Conversation/components/WideScreenContainer';
import { useFetchMessages } from '@/hooks/useFetchMessages';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';
import { useChatStore } from '@/store/chat';
import { chatSelectors } from '@/store/chat/selectors';
import { useSessionStore } from '@/store/session';
import { sessionSelectors } from '@/store/session/selectors';

import MainChatItem from './ChatItem';
import Welcome from './WelcomeChatItem';
import WelcomeMessage from './WelcomeChatItem/WelcomeMessage';

interface ListProps {
  mobile?: boolean;
}

const Content = memo<ListProps>(({ mobile }) => {
  const [isCurrentChatLoaded] = useChatStore((s) => [chatSelectors.isCurrentChatLoaded(s)]);

  useFetchMessages();
  const data = useChatStore(chatSelectors.mainDisplayChatIDs);

  // 当前会话是否配置了开场消息（非 Inbox）
  const openingMessage = useAgentStore(agentSelectors.openingMessage);
  const isInboxSession = useSessionStore(sessionSelectors.isInboxSession);
  const showPinnedWelcome = !!openingMessage && !isInboxSession;

  const itemContent = useCallback(
    (index: number, id: string) => <MainChatItem id={id} index={index} />,
    [mobile],
  );

  if (!isCurrentChatLoaded) return <SkeletonList mobile={mobile} />;

  if (data.length === 0)
    return (
      <WideScreenContainer flex={1} height={'100%'}>
        <Welcome />
      </WideScreenContainer>
    );

  return (
    <VirtualizedList
      dataSource={data}
      header={showPinnedWelcome ? <WelcomeMessage /> : undefined}
      itemContent={itemContent}
      mobile={mobile}
    />
  );
});

Content.displayName = 'ChatListRender';

export default Content;
