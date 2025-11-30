'use client';

import { memo, useMemo } from 'react';
import { Flexbox } from 'react-layout-kit';
import useSWR from 'swr';

import { withSuspense } from '@/components/withSuspense';
import { useQuery } from '@/hooks/useQuery';
import { useDiscoverStore } from '@/store/discover';
import { useSessionStore } from '@/store/session';
import { sessionSelectors } from '@/store/session/selectors';
import { AssistantQueryParams, DiscoverTab } from '@/types/discover';

import Pagination from '../features/Pagination';
import List from './features/List';
import Loading from './loading';

const Client = memo<{ mobile?: boolean }>(() => {
  const { q, page, category, sort, order } = useQuery() as AssistantQueryParams;
  const useAssistantList = useDiscoverStore((s) => s.useAssistantList);
  const { data, isLoading } = useAssistantList({
    category,
    order,
    page,
    pageSize: 21,
    q,
    sort,
  });

  const { items = [], currentPage = 1, pageSize = 21, totalCount = 0 } = (data as any) || {};

  const sessions = useSessionStore(sessionSelectors.allSessions);
  const { data: roles } = useSWR('/webapi/roles', (u: string) => fetch(u).then((r) => r.json()));
  const mergedItems = useMemo(() => {
    const custom = Array.isArray(roles)
      ? roles.map((r: any) => {
          const title = String(r?.name ?? '').trim();
          const session = sessions.find((s) => s.meta?.title === title);
          const meta = session?.meta || {};
          // Use description from database (session meta) as the card description
          const desc = String((meta as any).description ?? '').trim() || '';

          return {
            author: 'Local',
            avatar: (meta as any).avatar,
            backgroundColor: (meta as any).backgroundColor || '#e6f7ff',
            category: 'custom',
            createdAt: new Date().toISOString(),
            description: desc,
            identifier: `custom-role-${r.role_id}`,
            knowledgeCount: 0,
            pluginCount: 0,
            title: r.name,
            tokenUsage: 0,
          };
        })
      : [];
    return [...custom, ...items];
  }, [roles, sessions, items]);

  // 如果远端市场不可用，也不应阻塞本地角色展示
  if (isLoading) return <Loading />;

  return (
    <Flexbox gap={32} width={'100%'}>
      <List data={mergedItems} />
      <Pagination
        currentPage={currentPage}
        pageSize={pageSize}
        tab={DiscoverTab.Assistants}
        total={totalCount}
      />
    </Flexbox>
  );
});

export default withSuspense(Client);
