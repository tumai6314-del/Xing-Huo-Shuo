import { checkAuth } from '@/app/(backend)/middleware/auth';
import { DEFAULT_FILE_EMBEDDING_MODEL_ITEM } from '@/const/settings/knowledge';
import { getServerDefaultFilesConfig } from '@/server/globalConfig';
import { initModelRuntimeWithUserPayload } from '@/server/modules/ModelRuntime';

export const runtime = 'nodejs';

const ROLE_KNOWLEDGE_ROOT = ['src', 'storage', 'role_knowledge'];

type RawKnowledgeItem = {
  answer?: string;
  id?: string;
  question?: string;
  text?: string;
};

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
  knowledge: {
    [key: string]: RawKnowledgeItem[] | RoleLanguageStyleBlock | undefined;
    languageStyle?: RoleLanguageStyleBlock;
  };
  roleName: string;
};

type IndexedKnowledgeItem = {
  answer?: string;
  category: string;
  id: string;
  question?: string;
  text: string;
};

interface SearchBody {
  query: string;
  roleName: string;
  topK?: number;
}

const TEXT_EMBEDDING_DIM = 1024;

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length && i < b.length; i += 1) s += a[i] * b[i];
  return s;
}

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

export const POST = checkAuth(async (req: Request, { jwtPayload }) => {
  try {
    const body = (await req.json()) as SearchBody;
    const { roleName, query, topK = 3 } = body || {};

    if (!roleName || !query) {
      return Response.json({ message: 'roleName and query are required' }, { status: 400 });
    }

    const data = await loadRoleKnowledge(roleName.trim());
    if (!data) return Response.json({ items: [] }, { status: 200 });

    const items: IndexedKnowledgeItem[] = [];
    const groups = data.knowledge || {};
    for (const [category, list] of Object.entries(groups)) {
      if (!Array.isArray(list)) continue;

      list.forEach((raw, idx) => {
        if (!raw) return;
        const id = (raw as RawKnowledgeItem).id || `${category}_${idx}`;
        const question = (raw as RawKnowledgeItem).question;
        const answer = (raw as RawKnowledgeItem).answer;
        const textField = (raw as RawKnowledgeItem).text;

        const textParts: string[] = [];
        if (typeof textField === 'string' && textField.trim()) {
          textParts.push(textField.trim());
        } else {
          if (typeof question === 'string' && question.trim()) textParts.push(question.trim());
          if (typeof answer === 'string' && answer.trim()) textParts.push(answer.trim());
        }

        const text = textParts.join('\n').trim();
        if (!text) return;

        items.push({
          answer: typeof answer === 'string' ? answer : undefined,
          category,
          id,
          question: typeof question === 'string' ? question : undefined,
          text,
        });
      });
    }

    if (!items.length) return Response.json({ items: [] }, { status: 200 });

    const { model, provider } =
      getServerDefaultFilesConfig().embeddingModel || DEFAULT_FILE_EMBEDDING_MODEL_ITEM;
    const runtime = await initModelRuntimeWithUserPayload(provider as any, jwtPayload as any);

    const inputs = [query, ...items.map((it) => it.text)];

    const embeddings = await runtime.embeddings({
      dimensions: TEXT_EMBEDDING_DIM,
      input: inputs,
      model,
    });

    const [queryEmbedding, ...docEmbeddings] = embeddings || [];
    if (!queryEmbedding || !docEmbeddings.length)
      return Response.json({ items: [] }, { status: 200 });

    const scored = docEmbeddings.map((emb, idx) => ({
      item: items[idx],
      score: dot(queryEmbedding, emb),
    }));

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, topK).map(({ item, score }) => ({ ...item, score }));

    return Response.json({ items: top }, { status: 200 });
  } catch (e: any) {
    return Response.json(
      { error: e?.message, message: 'role knowledge search failed' },
      { status: 500 },
    );
  }
});
