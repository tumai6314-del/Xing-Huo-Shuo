import { LobeChatDatabase } from '@lobechat/database';
import { ClientSecretPayload } from '@lobechat/types';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { LOADING_FLAT } from '@/const/message';
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from '@/const/settings';
import { MessageModel } from '@/database/models/message';
import { SessionModel } from '@/database/models/session';
import { initModelRuntimeWithUserPayload } from '@/server/modules/ModelRuntime';
import { AiChatService } from '@/server/services/aiChat';

const ROLES_PATH = path.join(process.cwd(), 'src', 'storage', 'roles.json');

export type RoleItem = {
  description?: string;
  name: string;
  personality?: any;
  role_id: number | string;
};

export type ChatEvents =
  | {
      assistantMessageId: string;
      sessionId: string;
      topicId?: string;
      type: 'meta';
      userMessageId: string;
    }
  | { text: string; type: 'delta' }
  | {
      type: 'done';
      usage?: { completionTokens?: number; promptTokens?: number; totalTokens?: number };
    };

async function readRoles(): Promise<RoleItem[]> {
  const raw = await fs.readFile(ROLES_PATH, 'utf8');
  const data = JSON.parse(raw);
  return Array.isArray(data) ? data : [];
}

function buildSystemPrompt(role: RoleItem) {
  const parts: string[] = [];
  if (role.description) parts.push(role.description);
  if (role.personality) parts.push(JSON.stringify(role.personality));
  return parts.join('\n');
}

export class RoleChatService {
  private readonly userId: string;
  private readonly db: LobeChatDatabase;

  constructor(db: LobeChatDatabase, userId: string) {
    this.db = db;
    this.userId = userId;
  }

  private async ensureSessionByRoleName(
    role: RoleItem,
    opts?: { createNewSession?: boolean; sessionId?: string },
  ) {
    const sessionModel = new SessionModel(this.db, this.userId);

    // 1) 指定 sessionId 直接用
    if (opts?.sessionId) return opts.sessionId;

    // 2) 复用：按标题精确匹配
    const list = await sessionModel.queryWithGroups();
    const existed = list.sessions.find(
      (s: any) => (s.meta?.title || '').trim() === role.name.trim(),
    );
    if (existed && !opts?.createNewSession) return existed.id;

    // 3) 新建
    const created = await sessionModel.create({
      config: {
        model: DEFAULT_MODEL,
        provider: DEFAULT_PROVIDER,
        systemRole: role.description || '',
      },
      session: {
        description: role.description || '',
        title: role.name,
      },
      slug: undefined,
      type: 'agent',
    });

    return created.id;
  }

  /**
   * 在后端以“角色名”发起一轮对话，支持持久化与流式增量
   */
  async *chatWithRoleByName(params: {
    createNewSession?: boolean;
    // 默认使用系统默认
    model?: string;
    provider?: string;
    roleName: string;
    sessionId?: string;
    userMessage: string; // 默认使用系统默认
  }): AsyncGenerator<ChatEvents, void, unknown> {
    const { roleName, userMessage } = params;

    // 0) 读取角色
    const roles = await readRoles();
    const role = roles.find((r) => r.name === roleName);
    if (!role) {
      throw Object.assign(new Error('Role not found'), { code: '404_ROLE_NOT_FOUND' });
    }

    // 1) 准备会话
    const sessionId = await this.ensureSessionByRoleName(role, {
      createNewSession: params.createNewSession,
      sessionId: params.sessionId,
    });

    // 2) 创建消息（与现有 server 逻辑一致：先 user，再 assistant 占位）
    const messageModel = new MessageModel(this.db, this.userId);
    const aiChatService = new AiChatService(this.db, this.userId);

    const userMsg = await messageModel.create({
      content: userMessage,
      files: [],
      role: 'user',
      sessionId,
      topicId: undefined,
    } as any);

    const assistantMsg = await messageModel.create({
      content: LOADING_FLAT,
      fromModel: params.model || DEFAULT_MODEL,
      fromProvider: params.provider || DEFAULT_PROVIDER,
      parentId: userMsg.id,
      role: 'assistant',
      sessionId,
      topicId: userMsg.topicId,
    } as any);

    // 把当前 meta 先抛给调用方
    yield {
      assistantMessageId: assistantMsg.id,
      sessionId,
      topicId: userMsg.topicId ?? undefined,
      type: 'meta',
      userMessageId: userMsg.id,
    };

    // 3) 组上下文（包含 system、历史、当前用户消息）
    const system = buildSystemPrompt(role);

    const { messages: history } = await aiChatService.getMessagesAndTopics({
      sessionId,
      topicId: userMsg.topicId ?? undefined,
    });

    // 将历史转换为简化的 OpenAI 风格 messages
    const hist = (history || [])
      .map((m: any) => ({ content: m.content, role: m.role }))
      .filter((m: any) => m.content);

    const payload: any = {
      messages: [
        { content: system, role: 'system' },
        ...hist,
        { content: userMessage, role: 'user' },
      ],
      model: params.model || DEFAULT_MODEL,
      stream: true,
    };

    // 4) 初始化模型 runtime（使用 env 中的 OPENAI_API_KEY / OPENAI_PROXY_URL 等）
    const provider = (params.provider || DEFAULT_PROVIDER) as string;
    const jwtPayload: ClientSecretPayload = {
      apiKey: process.env.OPENAI_API_KEY,
      // 对于 openai 兼容代理，直接复用
      baseURL: process.env.OPENAI_PROXY_URL,
      userId: this.userId,
    } as any;

    // 5) 调用并做简单重试
    const maxRetry = 2;
    let attempt = 0;
    let lastErr: any;

    while (attempt <= maxRetry) {
      try {
        const runtime = await initModelRuntimeWithUserPayload(provider, jwtPayload);
        const res = await runtime.chat(payload, { user: this.userId });
        if (!res?.body)
          throw Object.assign(new Error('No response body'), { code: '502_RUNTIME_STREAM_ERROR' });

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });

          // 以“最小假设”解析：将 chunk 当作增量文本（SSE 下也包含 data: 前缀，做一次清洗）
          const deltas = chunk
            .split('\n')
            .map((l) => l.replace(/^data:\s*/i, ''))
            .filter((l) => l && l !== '[DONE]');

          for (const d of deltas) {
            // 若是 JSON 块且包含 content 字段，则取 content；否则当作纯文本
            let text = '';
            try {
              const obj = JSON.parse(d);
              text = obj?.content || obj?.delta || '';
              if (!text && typeof obj === 'string') text = obj;
            } catch {
              text = d;
            }

            if (!text) continue;
            fullText += text;
            // 持久化增量
            await messageModel.update(assistantMsg.id, {
              content: fullText,
              role: 'assistant',
            } as any);
            // 抛出给调用方
            yield { text, type: 'delta' };
          }
        }

        // 完成事件（usage 暂时无法通用获取，留空）
        yield { type: 'done' };
        return;
      } catch (e: any) {
        lastErr = e;
        // 简单重试：429/超时优先
        const shouldRetry =
          e?.status === 429 ||
          e?.code === 'ETIMEDOUT' ||
          e?.name === 'TimeoutError' ||
          e?.code === 'ECONNRESET';
        if (!shouldRetry || attempt === maxRetry) break;

        await sleep(attempt === 0 ? 500 : 1500);
        attempt += 1;
      }
    }

    // 失败：将 assistant 标记为错误
    await new MessageModel(this.db, this.userId).update(assistantMsg.id, {
      error: {
        code: lastErr?.code || '502_RUNTIME_STREAM_ERROR',
        message: String(lastErr?.message || lastErr),
      },
      role: 'assistant',
    } as any);

    throw Object.assign(new Error('Runtime chat failed'), {
      code: lastErr?.code || '502_RUNTIME_STREAM_ERROR',
      details: String(lastErr?.message || lastErr),
    });
  }
}
