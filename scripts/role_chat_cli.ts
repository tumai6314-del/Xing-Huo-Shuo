/*
  简易命令行工具：从后端以指定角色进行对话，并将消息持久化。
  使用示例（Windows PowerShell）：
    bunx tsx scripts/role_chat_cli.ts --role "智能知识库助理" --msg "请总结最近3条更新"
    bunx tsx scripts/role_chat_cli.ts --role "智能知识库助理" --msg "新开话题" --new
    bunx tsx scripts/role_chat_cli.ts --role "智能知识库助理" --msg "继续" --session "<你的 sessionId>"

  注意：
  - 请确保该进程可读取到服务端数据库环境变量：
      NEXT_PUBLIC_SERVICE_MODE=server
      DATABASE_URL=...
      KEY_VAULTS_SECRET=...
    可在运行脚本前在终端或系统环境中设置，或写入 .env/.env.local。
  - OPENAI_API_KEY / OPENAI_PROXY_URL 将从 process.env 读取。通常你可把它们放在 .env.local，
    若本脚本作为独立进程运行，也可以在当前终端中 export 设置。
*/
import { existsSync, readFileSync } from 'node:fs';

import { getServerDB } from '../packages/database/src/server';
import { RoleChatService } from '../src/server/services/roleChat';

function loadEnvFile(p: string) {
  if (!existsSync(p)) return;
  const txt = readFileSync(p, 'utf8');
  for (const line of txt.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    }
  }
  return args as {
    msg?: string;
    new?: boolean | string;
    role?: string;
    session?: string;
    user?: string;
  };
}

async function ensureEnv() {
  // 尝试按需加载环境变量文件（懒加载）
  loadEnvFile('.env');
  loadEnvFile('.env.local');

  const required = ['NEXT_PUBLIC_SERVICE_MODE', 'DATABASE_URL', 'KEY_VAULTS_SECRET'];
  const missing = required.filter((k) => !process.env[k] || process.env[k] === '');
  if (missing.length) {
    const msg = `[role_chat_cli] Missing env: ${missing.join(', ')}`;
    console.error(msg);
    console.error('Please export them or add them to .env/.env.local before running.');
    throw new Error(msg);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const roleName = args.role;
  const userMessage = args.msg;
  const sessionId = args.session;
  const createNewSession = !!args['new'];
  const userId = (args.user as string) || 'DEV_USER';

  if (!roleName || !userMessage) {
    console.log(
      'Usage: bunx tsx scripts/role_chat_cli.ts --role "<角色名>" --msg "<你的问题>" [--new] [--session <id>] [--user <userId>]',
    );
    throw new Error('[role_chat_cli] Missing required arguments');
  }

  await ensureEnv();

  // 获取数据库实例
  const db = await getServerDB();

  // 确保运行时可见 OPENAI 相关环境变量（通常已在环境中，可选提醒）
  if (!process.env.OPENAI_API_KEY) {
    console.warn(
      '[role_chat_cli] OPENAI_API_KEY is not set in env. If your provider needs it, please export it.',
    );
  }

  const svc = new RoleChatService(db as any, userId);

  console.log(`\n[role_chat_cli] chatting with role: ${roleName}`);
  if (sessionId) console.log(`[role_chat_cli] use session: ${sessionId}`);
  if (createNewSession) console.log('[role_chat_cli] create new session: true');

  let meta: any = null;
  try {
    for await (const ev of svc.chatWithRoleByName({
      createNewSession,
      roleName,
      sessionId,
      userMessage,
    })) {
      switch (ev.type) {
      case 'meta': {
        meta = ev;
        console.log(
          `[meta] userMessageId=${ev.userMessageId} assistantMessageId=${ev.assistantMessageId} sessionId=${ev.sessionId} topicId=${ev.topicId ?? ''}`,
        );
      
      break;
      }
      case 'delta': {
        process.stdout.write(ev.text);
      
      break;
      }
      case 'done': {
        console.log('\n[done]');
      
      break;
      }
      // No default
      }
    }
  } catch (e: any) {
    console.error('\n[error]', e?.code || '', e?.message || e?.details || e);
    throw e;
  }

  if (meta) {
    console.log(
      `[summary] sessionId=${meta.sessionId} assistantMessageId=${meta.assistantMessageId}`,
    );
  }
}

try {
  await main();
} catch (e) {
  console.error('[fatal]', e);
  process.exitCode = 1;
}
