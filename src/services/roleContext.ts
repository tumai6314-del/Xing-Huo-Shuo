import {
  RoleKnowledgeSearchItem,
  RoleLanguageStyleBlock,
  roleKnowledgeService,
} from '@/services/roleKnowledge';
import { getSessionStoreState } from '@/store/session';
import { sessionMetaSelectors } from '@/store/session/slices/session/selectors/meta';

export const buildRoleKnowledgeContext = async (userQuestion: string): Promise<string | null> => {
  const sessionState = getSessionStoreState();
  const roleName = sessionMetaSelectors.currentAgentTitle(sessionState);

  if (!roleName) return null;

  const lines: string[] = [];

  // 1. 语言风格：每轮对话都尽量注入
  let hasStyle = false;
  try {
    const style: RoleLanguageStyleBlock | null = await roleKnowledgeService.getStyle(
      String(roleName),
    );

    if (style && (style.rules || style.examples?.length || style.avoid?.length)) {
      hasStyle = true;
      lines.push('【语言风格说明】');

      if (style.rules) {
        lines.push(style.rules.trim());
      }

      if (style.examples && style.examples.length > 0) {
        lines.push('\n可参考的典型表达（用于模仿语气和节奏，不要逐字照抄）：');
        style.examples.forEach((ex, idx) => {
          if (!ex.text) return;
          lines.push(`\n例句 ${idx + 1}：${ex.text}`);
        });
      }

      if (style.avoid && style.avoid.length > 0) {
        lines.push('\n需要避免的表达方式：');
        style.avoid.forEach((ex) => {
          if (!ex.text) return;
          lines.push(`\n避免：${ex.text}`);
        });
      }

      lines.push('\n');
    }
  } catch (e) {
    console.error('[roleKnowledge] load language style failed', e);
  }

  // 2. 语义检索：只在相关时使用
  const items: RoleKnowledgeSearchItem[] = await roleKnowledgeService.search(
    String(roleName),
    userQuestion,
    3,
  );

  if (items.length > 0) {
    lines.push('【角色知识库参考（仅在相关时使用）】');

    items.forEach((it, idx) => {
      lines.push(`\n${idx + 1}. [${it.category}]`);
      if (it.text) {
        lines.push(it.text);
      } else {
        if (it.question) lines.push(`问：${it.question}`);
        if (it.answer) lines.push(`答：${it.answer}`);
      }
    });

    lines.push(
      '\n请在回答用户问题时，优先参考以上资料；如果资料未覆盖，也可以在合理范围内推理，但不要与上述资料出现明显矛盾。',
    );
  }

  if (!hasStyle && !items.length) return null;

  return lines.join('\n');
};
