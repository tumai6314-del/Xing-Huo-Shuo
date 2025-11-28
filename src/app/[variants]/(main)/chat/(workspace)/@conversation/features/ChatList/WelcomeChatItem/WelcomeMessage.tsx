import isEqual from 'fast-deep-equal';
import qs from 'query-string';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Flexbox } from 'react-layout-kit';

import ChatItem from '@/features/ChatItem';
import { useAgentStore } from '@/store/agent';
import { agentChatConfigSelectors, agentSelectors } from '@/store/agent/selectors';
import { useChatStore } from '@/store/chat';
import { featureFlagsSelectors, useServerConfigStore } from '@/store/serverConfig';
import { useSessionStore } from '@/store/session';
import { sessionMetaSelectors } from '@/store/session/selectors';

import OpeningQuestions from './OpeningQuestions';

const WelcomeMessage = () => {
  const mobile = useServerConfigStore((s) => s.isMobile);
  const { t } = useTranslation('chat');
  const type = useAgentStore(agentChatConfigSelectors.displayMode);
  const openingMessage = useAgentStore(agentSelectors.openingMessage);
  const openingQuestions = useAgentStore(agentSelectors.openingQuestions);

  const meta = useSessionStore(sessionMetaSelectors.currentAgentMeta, isEqual);
  const { isAgentEditable } = useServerConfigStore(featureFlagsSelectors);
  const activeId = useChatStore((s) => s.activeId);

  const agentMsg = t(isAgentEditable ? 'agentDefaultMessage' : 'agentDefaultMessageWithoutEdit', {
    name: meta.title || t('defaultAgent'),
    url: qs.stringifyUrl({
      query: mobile ? { session: activeId, showMobileWorkspace: mobile } : { session: activeId },
      url: '/chat/settings',
    }),
  });

  // 优先使用用户在网站中为角色配置的开场消息；
  // 如果没有配置，则使用一条与角色设定无关的通用欢迎语。
  const message = useMemo(() => {
    if (openingMessage) return openingMessage;
    return agentMsg;
  }, [openingMessage, agentMsg]);

  const chatItem = (
    <ChatItem
      avatar={meta}
      editing={false}
      message={message}
      placement={'left'}
      variant={type === 'chat' ? 'bubble' : 'docs'}
    />
  );

  return openingQuestions.length > 0 ? (
    <Flexbox>
      {chatItem}
      <OpeningQuestions mobile={mobile} questions={openingQuestions} />
    </Flexbox>
  ) : (
    chatItem
  );
};
export default WelcomeMessage;
