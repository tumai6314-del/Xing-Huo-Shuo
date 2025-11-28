export interface RoleKnowledgeSearchItem {
  answer?: string;
  category: string;
  id: string;
  question?: string;
  score: number;
  text: string;
}

export interface RoleLanguageStyleExample {
  id: string;
  text: string;
}

export interface RoleLanguageStyleBlock {
  avoid?: RoleLanguageStyleExample[];
  examples?: RoleLanguageStyleExample[];
  rules?: string;
}

class RoleKnowledgeService {
  search = async (roleName: string, query: string, topK = 3) => {
    const res = await fetch('/webapi/role-knowledge/search', {
      body: JSON.stringify({ query, roleName, topK }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    if (!res.ok) return [] as RoleKnowledgeSearchItem[];

    const data = (await res.json()) as { items?: RoleKnowledgeSearchItem[] };

    return Array.isArray(data.items) ? data.items : [];
  };

  getStyle = async (roleName: string) => {
    const res = await fetch(
      `/webapi/role-knowledge/style?roleName=${encodeURIComponent(roleName)}`,
    );

    if (!res.ok) return null;

    const data = (await res.json()) as RoleLanguageStyleBlock;

    return data || null;
  };
}

export const roleKnowledgeService = new RoleKnowledgeService();
