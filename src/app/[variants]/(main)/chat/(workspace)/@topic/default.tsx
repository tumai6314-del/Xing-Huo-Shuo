// import TopicListContent from './features/TopicListContent';
import React, { Suspense, lazy } from 'react';

import { DynamicLayoutProps } from '@/types/next';
import { RouteVariants } from '@/utils/server/routeVariants';

import Desktop from './_layout/Desktop';
import Mobile from './_layout/Mobile';
import SkeletonList from './features/SkeletonList';

const TopicContent = lazy(() => import('./features/TopicListContent'));

const Topic = async (props: DynamicLayoutProps) => {
  const isMobile = await RouteVariants.getIsMobile(props);

  const Layout = isMobile ? Mobile : Desktop;

  return (
    <>
      {/*
	        原版在桌面端 Topic 面板顶部渲染 SystemRole（“角色设定” 卡片）。
	        按你的需求，这里不再展示该卡片，只保留话题列表内容。
	      */}
      <Layout>
        <Suspense fallback={<SkeletonList />}>
          <TopicContent />
        </Suspense>
      </Layout>
    </>
  );
};

Topic.displayName = 'ChatTopic';

export default Topic;
