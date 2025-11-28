import { BRANDING_LOGO_URL, BRANDING_NAME, ORG_NAME } from '@/const/branding';
import { DEFAULT_LANG } from '@/const/locale';
import { OFFICIAL_URL, OG_URL } from '@/const/url';
import { isCustomORG } from '@/const/version';
import { translation } from '@/server/translation';
import { DynamicLayoutProps } from '@/types/next';
import { RouteVariants } from '@/utils/server/routeVariants';

export const generateMetadata = async (props: any) => {
  const locale = await RouteVariants.getLocale(props as DynamicLayoutProps);
  const { t } = await translation('metadata', locale);

  return {
    alternates: {
      canonical: OFFICIAL_URL,
    },
    appleWebApp: {
      statusBarStyle: 'black-translucent',
      title: BRANDING_NAME,
    },
    description: t('chat.description', { appName: BRANDING_NAME }),
    // favicon / PWA 图标配置：
    // - 如果配置了 BRANDING_LOGO_URL（远程 Logo），Next.js 会直接用它作为 icon
    // - 否则回退到本地的 favicon / apple-touch-icon（带 v=2 版本号，强制浏览器刷新缓存）
    icons: BRANDING_LOGO_URL
      ? BRANDING_LOGO_URL
      : {
          apple: '/apple-touch-icon.png?v=2',
          icon: '/favicon.ico?v=2',
          shortcut: '/favicon-32x32.ico?v=2',
        },
    manifest: '/manifest.json',
    metadataBase: new URL(OFFICIAL_URL),
    openGraph: {
      description: t('chat.description', { appName: BRANDING_NAME }),
      images: [
        {
          alt: t('chat.title', { appName: BRANDING_NAME }),
          height: 640,
          url: OG_URL,
          width: 1200,
        },
      ],
      locale: DEFAULT_LANG,
      siteName: BRANDING_NAME,
      title: BRANDING_NAME,
      type: 'website',
      url: OFFICIAL_URL,
    },
    title: {
      default: t('chat.title', { appName: BRANDING_NAME }),
      template: `%s · ${BRANDING_NAME}`,
    },
    twitter: {
      card: 'summary_large_image',
      description: t('chat.description', { appName: BRANDING_NAME }),
      images: [OG_URL],
      site: isCustomORG ? `@${ORG_NAME}` : '@lobehub',
      title: t('chat.title', { appName: BRANDING_NAME }),
    },
  };
};
