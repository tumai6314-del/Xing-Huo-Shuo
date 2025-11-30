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

export interface RoleItem {
  description?: string;
  name: string;
  personality?: Record<string, unknown>;
  role_id: number;
}

class RoleKnowledgeService {
  private rolesCache: RoleItem[] | null = null;

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

  /**
   * Get the systemRole (description) for a role from roles.json
   * This is used to override the database systemRole with the backend roles.json definition
   */
  getRoleSystemRole = async (roleName: string): Promise<string | null> => {
    try {
      // Use cached roles if available
      if (!this.rolesCache) {
        const res = await fetch('/webapi/roles');
        if (!res.ok) return null;
        this.rolesCache = (await res.json()) as RoleItem[];
      }

      if (!Array.isArray(this.rolesCache)) return null;

      const role = this.rolesCache.find(
        (r) => typeof r?.name === 'string' && r.name.trim() === roleName.trim(),
      );

      return role?.description ?? null;
    } catch (e) {
      console.error('[roleKnowledge] getRoleSystemRole failed', e);
      return null;
    }
  };

  /**
   * Clear the roles cache (useful when roles.json is updated)
   */
  clearRolesCache = () => {
    this.rolesCache = null;
  };
}

export const roleKnowledgeService = new RoleKnowledgeService();
