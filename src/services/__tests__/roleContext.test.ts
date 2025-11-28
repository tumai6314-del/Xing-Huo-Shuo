import { Mock, beforeEach, describe, expect, it, vi } from 'vitest';

import { roleKnowledgeService } from '@/services/roleKnowledge';
import { getSessionStoreState } from '@/store/session';
import { sessionMetaSelectors } from '@/store/session/slices/session/selectors/meta';

import { buildRoleKnowledgeContext } from '../roleContext';

vi.mock('@/store/session', () => ({
  getSessionStoreState: vi.fn(),
}));

vi.mock('@/store/session/slices/session/selectors/meta', () => ({
  sessionMetaSelectors: {
    currentAgentTitle: vi.fn(),
  },
}));

vi.mock('@/services/roleKnowledge', () => ({
  roleKnowledgeService: {
    search: vi.fn(),
    getStyle: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildRoleKnowledgeContext', () => {
  it('should return null when there is no current role name', async () => {
    (getSessionStoreState as Mock).mockReturnValue({});
    (sessionMetaSelectors.currentAgentTitle as Mock).mockReturnValue(undefined);

    const result = await buildRoleKnowledgeContext('你好');

    expect(result).toBeNull();
    expect(roleKnowledgeService.getStyle).not.toHaveBeenCalled();
    expect(roleKnowledgeService.search).not.toHaveBeenCalled();
  });

  it('should return combined style and knowledge text when data is available', async () => {
    (getSessionStoreState as Mock).mockReturnValue({});
    (sessionMetaSelectors.currentAgentTitle as Mock).mockReturnValue('李大钊');

    (roleKnowledgeService.getStyle as Mock).mockResolvedValue({
      rules: '请使用庄重而真诚的口吻回答，与青年平等对话。',
      examples: [{ text: '青年者，人生之王，人生之春，人生之华也。' }],
      avoid: [{ text: '避免使用网络流行语或调侃语气。' }],
    });

    (roleKnowledgeService.search as Mock).mockResolvedValue([
      {
        category: '生平事迹',
        text: '1915年参与组织新文化运动，倡导民主与科学。',
      },
    ]);

    const result = await buildRoleKnowledgeContext('请介绍一下李大钊的青年观。');

    expect(result).not.toBeNull();
    expect(result).toContain('【语言风格说明】');
    expect(result).toContain('【角色知识库参考（仅在相关时使用）】');
    expect(result).toContain('青年者，人生之王');
    expect(result).toContain('1915年参与组织新文化运动');
  });

  it('should return null when both style and items are empty', async () => {
    (getSessionStoreState as Mock).mockReturnValue({});
    (sessionMetaSelectors.currentAgentTitle as Mock).mockReturnValue('某角色');

    (roleKnowledgeService.getStyle as Mock).mockResolvedValue({});
    (roleKnowledgeService.search as Mock).mockResolvedValue([]);

    const result = await buildRoleKnowledgeContext('测试问题');

    expect(result).toBeNull();
  });
});
