import { TRPCError } from '@trpc/server';

import { enableClerk, enableNextAuth } from '@/const/auth';
import { DESKTOP_USER_ID } from '@/const/desktop';
import { isDesktop } from '@/const/version';

import { trpc } from '../lambda/init';

export const userAuth = trpc.middleware(async (opts) => {
  const { ctx } = opts;

  // 桌面端模式下，跳过默认鉴权逻辑
  if (isDesktop) {
    return opts.next({
      ctx: { userId: DESKTOP_USER_ID },
    });
  }
  // `ctx.user` is nullable
  if (!ctx.userId) {
    // 当完全关闭登录鉴权（既没有 Clerk 也没有 NextAuth）时，后端仍然需要一个 userId
    // 用于在数据库里区分数据所属。这里我们为 Web 端提供一个固定的「共享用户」。
    if (!enableClerk && !enableNextAuth) {
      const sharedUserId = process.env.LOBE_SHARED_USER_ID || 'NO_AUTH_SHARED_USER';

      return opts.next({
        ctx: { userId: sharedUserId },
      });
    }

    // 其它情况仍然按原逻辑处理，输出调试信息并返回 401
    if (enableClerk) {
      console.log('clerk auth:', ctx.clerkAuth);
    } else {
      console.log('next auth:', ctx.nextAuth);
    }
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  return opts.next({
    // ✅ user value is known to be non-null now
    ctx: { userId: ctx.userId },
  });
});
