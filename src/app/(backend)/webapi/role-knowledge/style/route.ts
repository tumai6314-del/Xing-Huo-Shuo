import { checkAuth } from '@/app/(backend)/middleware/auth';

export const runtime = 'nodejs';

const ROLE_KNOWLEDGE_ROOT = ['src', 'storage', 'role_knowledge'];

type LanguageStyleExample = {
  id: string;
  text: string;
};

type RoleLanguageStyleBlock = {
  avoid?: LanguageStyleExample[];
  examples?: LanguageStyleExample[];
  rules?: string;
};

type RoleKnowledgeFile = {
  knowledge?: {
    [key: string]: any;
    languageStyle?: RoleLanguageStyleBlock;
  };
  roleName: string;
};

async function loadRoleKnowledge(roleName: string): Promise<RoleKnowledgeFile | null> {
  const path = await import('node:path');
  const fs = await import('node:fs/promises');
  const root = path.join(process.cwd(), ...ROLE_KNOWLEDGE_ROOT);
  const indexPath = path.join(root, 'index.json');

  try {
    const indexRaw = await fs.readFile(indexPath, 'utf8');
    const index = JSON.parse(indexRaw) as Record<string, string>;
    const fileName = index[roleName];
    if (!fileName) return null;

    const filePath = path.join(root, fileName);
    const raw = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(raw) as RoleKnowledgeFile;

    return data;
  } catch {
    return null;
  }
}

export const GET = checkAuth(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const roleName = url.searchParams.get('roleName');

    if (!roleName) {
      return Response.json({ message: 'roleName is required' }, { status: 400 });
    }

    const data = await loadRoleKnowledge(roleName.trim());
    const style = data?.knowledge?.languageStyle;

    if (!style) return Response.json({}, { status: 200 });

    return Response.json(style, { status: 200 });
  } catch (e: any) {
    return Response.json(
      { error: e?.message, message: 'role language style load failed' },
      { status: 500 },
    );
  }
});
