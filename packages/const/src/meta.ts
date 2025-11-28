import { MetaData } from '@lobechat/types';

import { BRANDING_LOGO_URL } from './branding';

export const DEFAULT_AVATAR = '🤖';
export const DEFAULT_USER_AVATAR = '😀';
export const DEFAULT_BACKGROUND_COLOR = 'rgba(0,0,0,0)';
export const DEFAULT_AGENT_META: MetaData = {};

// 默认「随便聊聊」会话头像
// 使用 public/images/inbox-avatar.png 这张本地图片作为头像
// 为了避免浏览器缓存旧图片，这里带上一个版本号参数 v=2
// 请将自己的照片命名为 inbox-avatar.png 并放到 public/images/ 目录下
export const DEFAULT_INBOX_AVATAR = '/images/inbox-avatar.png?v=2';

// 默认用户头像仍然使用品牌 Logo 或内置图标
export const DEFAULT_USER_AVATAR_URL = BRANDING_LOGO_URL || '/icons/icon-192x192.png';
