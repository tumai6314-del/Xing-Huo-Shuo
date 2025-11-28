'use client';

import { ActionIcon, Avatar, Block, Grid, Text } from '@lobehub/ui';
import { Skeleton } from 'antd';
import { createStyles } from 'antd-style';
import { RefreshCw } from 'lucide-react';
import { useRouter } from 'nextjs-toploader/app';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Flexbox } from 'react-layout-kit';
import useSWR from 'swr';

import { getSessionStoreState, useSessionStore } from '@/store/session';

const useStyles = createStyles(({ css, token, responsive }) => ({
  card: css`
    position: relative;

    overflow: hidden;

    height: 100%;
    min-height: 110px;
    padding: 16px;
    border-radius: ${token.borderRadiusLG}px;

    background: ${token.colorBgContainer};

    ${responsive.mobile} {
      min-height: 72px;
    }
  `,
  cardDesc: css`
    margin-block: 0 !important;
    color: ${token.colorTextDescription};
  `,
  cardTitle: css`
    margin-block: 0 !important;
    font-size: 16px;
    font-weight: bold;
  `,
  icon: css`
    color: ${token.colorTextSecondary};
  `,
  title: css`
    color: ${token.colorTextDescription};
  `,
}));

const AgentsSuggest = memo<{ mobile?: boolean }>(({ mobile }) => {
  const { t } = useTranslation('welcome');
  const { styles } = useStyles();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const pageSize = mobile ? 2 : 4;
  const sessions = useSessionStore((s) => s.sessions);

  const { data: roles } = useSWR('/webapi/roles', (u: string) => fetch(u).then((r) => r.json()));

  const allRoles: any[] = Array.isArray(roles) ? roles : [];
  const total = allRoles.length;
  const maxPage = total > 0 ? Math.ceil(total / pageSize) : 1;
  const currentPage = maxPage > 0 ? ((page - 1 + maxPage) % maxPage) + 1 : 1;
  const startIndex = (currentPage - 1) * pageSize;
  const visibleRoles = allRoles.slice(startIndex, startIndex + pageSize);

  const loadingCards = Array.from({ length: pageSize }).map((_, index) => (
    <Block className={styles.card} key={index}>
      <Skeleton active avatar paragraph={{ rows: 2 }} title={false} />
    </Block>
  ));

  const handleRefresh = () => {
    if (!total) return;
    setPage((prev) => prev + 1);
  };

  const handleClickRole = async (role: any) => {
    const title = String(role?.name ?? '').trim();
    const description = String(role?.description ?? '');
    if (!title) return;

    const { sessions } = getSessionStoreState();
    const existed = sessions.find((s) => s.meta?.title === title);
    let id = existed?.id;
    if (!id) {
      const create = useSessionStore.getState().createSession;
      id = await create(
        {
          config: { systemRole: description || '' } as any,
          meta: { description, title },
        },
        true,
      );
    }

    router.push(`/chat?session=${id}`);
  };

  // if no role data, just hide the component
  if (Array.isArray(roles) && !total) return null;

  return (
    <Flexbox gap={8} width={'100%'}>
      <Flexbox align={'center'} horizontal justify={'space-between'}>
        <div className={styles.title}>{t('guide.agents.title')}</div>
        <ActionIcon
          icon={RefreshCw}
          onClick={handleRefresh}
          size={{ blockSize: 24, size: 14 }}
          title={t('guide.agents.replaceBtn')}
        />
      </Flexbox>
      <Grid gap={8} rows={2}>
        {!roles
          ? loadingCards
          : visibleRoles.map((role: any) => {
              const title = String(role?.name ?? '').trim();
              const session = sessions.find((s) => s.meta?.title === title);
              const meta = session?.meta || {};
              const avatar = (meta as any).avatar as string | undefined;
              const backgroundColor = (meta as any).backgroundColor as string | undefined;
              const desc = (meta as any).description as string | undefined;

              return (
                <Block
                  className={styles.card}
                  clickable
                  gap={12}
                  horizontal
                  key={role.role_id}
                  onClick={() => handleClickRole(role)}
                  variant={'outlined'}
                >
                  <Avatar
                    avatar={avatar}
                    background={backgroundColor || undefined}
                    style={{ flex: 'none' }}
                  />
                  <Flexbox gap={2} style={{ overflow: 'hidden', width: '100%' }}>
                    <Text className={styles.cardTitle} ellipsis={{ rows: 1 }}>
                      {role.name}
                    </Text>
                    {desc && (
                      <Text className={styles.cardDesc} ellipsis={{ rows: mobile ? 1 : 2 }}>
                        {desc}
                      </Text>
                    )}
                  </Flexbox>
                </Block>
              );
            })}
      </Grid>
    </Flexbox>
  );
});

export default AgentsSuggest;
