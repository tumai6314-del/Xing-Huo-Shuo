import { Suspense, lazy } from 'react';

import CircleLoading from '@/components/Loading/CircleLoading';
import ServerLayout from '@/components/server/ServerLayout';
import { DynamicLayoutProps } from '@/types/next';

import Desktop from './_layout/Desktop';
import Mobile from './_layout/Mobile';
import SessionHydration from './features/SessionHydration';
import SkeletonList from './features/SkeletonList';

const SessionListContent = lazy(() => import('./features/SessionListContent'));
const InitCustomRoles = lazy(() => import('./features/InitCustomRoles'));

const Layout = ServerLayout({ Desktop, Mobile });

const Session = (props: DynamicLayoutProps) => {
  return (
    <Suspense fallback={<CircleLoading />}>
      <Layout {...props}>
        <Suspense fallback={<SkeletonList />}>
          <SessionListContent />
        </Suspense>
      </Layout>
      {/* 初始化自定义角色到会话列表（仅客户端执行，一次性） */}
      <Suspense>
        <InitCustomRoles />
      </Suspense>
      <SessionHydration />
    </Suspense>
  );
};

Session.displayName = 'Session';

export default Session;
