'use client';

import { ActionIcon, ScrollShadow } from '@lobehub/ui';
import { EditableMessage } from '@lobehub/ui/chat';
import { Skeleton } from 'antd';
import { Edit } from 'lucide-react';
import { MouseEvent, memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Flexbox } from 'react-layout-kit';
import useSWR from 'swr';
import useMergeState from 'use-merge-value';

import SidebarHeader from '@/components/SidebarHeader';
import AgentInfo from '@/features/AgentInfo';
import { useOpenChatSettings } from '@/hooks/useInterceptingRoutes';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';
import { useGlobalStore } from '@/store/global';
import { ChatSettingsTabs } from '@/store/global/initialState';
import { systemStatusSelectors } from '@/store/global/selectors';
import { useSessionStore } from '@/store/session';
import { sessionMetaSelectors, sessionSelectors } from '@/store/session/selectors';

import { useStyles } from './style';

const SystemRole = memo(() => {
  const [editing, setEditing] = useState(false);
  const { styles, cx } = useStyles();
  const openChatSettings = useOpenChatSettings(ChatSettingsTabs.Prompt);
  const [init, meta, sessionId] = useSessionStore((s) => [
    sessionSelectors.isSomeSessionActive(s),
    sessionMetaSelectors.currentAgentMeta(s),
    s.activeId,
  ]);

  const [isAgentConfigLoading, systemRole, updateAgentConfig] = useAgentStore((s) => [
    agentSelectors.isAgentConfigLoading(s),
    agentSelectors.currentAgentSystemRole(s),
    s.updateAgentConfig,
  ]);

  const [showSystemRole, toggleSystemRole] = useGlobalStore((s) => [
    systemStatusSelectors.showSystemRole(s),
    s.toggleSystemRole,
  ]);

  const [open, setOpen] = useMergeState(false, {
    defaultValue: showSystemRole,
    onChange: toggleSystemRole,
    value: showSystemRole,
  });

  const { t } = useTranslation('common');

  const isLoading = !init || isAgentConfigLoading;

  const { data: roles } = useSWR('/webapi/roles', (u: string) => fetch(u).then((r) => r.json()));

  const sessionTitle = meta?.title?.trim();

  const backendRole = useMemo(
    () =>
      Array.isArray(roles) && sessionTitle
        ? (roles as any[]).find(
            (r) => typeof r?.name === 'string' && r.name.trim() === sessionTitle,
          )
        : undefined,
    [roles, sessionTitle],
  );

  const backendDescription: string | undefined = backendRole?.description
    ? String(backendRole.description)
    : undefined;

  const isRoleSession = !!backendRole;

  // keep agent config.systemRole in sync with backend roles.json description
  useEffect(() => {
    if (!isRoleSession) return;
    if (!backendDescription) return;
    if (isLoading) return;
    if (systemRole === backendDescription) return;

    updateAgentConfig({ systemRole: backendDescription });
  }, [backendDescription, isLoading, isRoleSession, systemRole, updateAgentConfig]);

  const displaySystemRole = (isRoleSession ? backendDescription : systemRole) ?? '';

  const handleOpenWithEdit = (e: MouseEvent) => {
    if (isLoading || isRoleSession) return;

    e.stopPropagation();
    setEditing(true);
    setOpen(true);
  };

  const handleOpen = () => {
    if (isLoading) return;

    setOpen(true);
  };

  const [expanded, toggleAgentSystemRoleExpand] = useGlobalStore((s) => [
    systemStatusSelectors.getAgentSystemRoleExpanded(sessionId)(s),
    s.toggleAgentSystemRoleExpand,
  ]);

  const toggleExpanded = () => {
    toggleAgentSystemRoleExpand(sessionId);
  };

  return (
    <Flexbox height={'fit-content'}>
      <SidebarHeader
        actions={
          !isRoleSession ? (
            <ActionIcon icon={Edit} onClick={handleOpenWithEdit} size={'small'} title={t('edit')} />
          ) : undefined
        }
        onClick={toggleExpanded}
        style={{ cursor: 'pointer' }}
        title={t('settingAgent.prompt.title', { ns: 'setting' })}
      />
      <ScrollShadow
        className={cx(styles.promptBox, styles.animatedContainer)}
        height={expanded ? 200 : 0}
        onClick={handleOpen}
        onDoubleClick={(e) => {
          if (e.altKey && !isRoleSession) handleOpenWithEdit(e);
        }}
        paddingInline={16}
        size={25}
        style={{
          opacity: expanded ? 1 : 0,
          overflow: 'hidden',
          transition: 'height 0.3s ease',
        }}
      >
        {isLoading ? (
          <Skeleton active avatar={false} title={false} />
        ) : (
          <EditableMessage
            classNames={{ markdown: styles.prompt }}
            editing={editing}
            markdownProps={{ enableLatex: false, enableMermaid: false }}
            model={{
              extra: (
                <AgentInfo
                  meta={meta}
                  onAvatarClick={() => {
                    setOpen(false);
                    setEditing(false);
                    openChatSettings();
                  }}
                  style={{ marginBottom: 16 }}
                />
              ),
            }}
            onChange={(e) => {
              if (isRoleSession) return;
              updateAgentConfig({ systemRole: e });
            }}
            onEditingChange={setEditing}
            onOpenChange={setOpen}
            openModal={open}
            placeholder={`${t('settingAgent.prompt.placeholder', { ns: 'setting' })}...`}
            styles={{
              markdown: {
                opacity: displaySystemRole ? undefined : 0.5,
                overflow: 'visible',
              },
            }}
            text={
              isRoleSession
                ? {
                    cancel: t('cancel'),
                    confirm: t('ok'),
                    title: t('settingAgent.prompt.title', { ns: 'setting' }),
                  }
                : {
                    cancel: t('cancel'),
                    confirm: t('ok'),
                    edit: t('edit'),
                    title: t('settingAgent.prompt.title', { ns: 'setting' }),
                  }
            }
            value={displaySystemRole}
          />
        )}
      </ScrollShadow>
    </Flexbox>
  );
});

export default SystemRole;
