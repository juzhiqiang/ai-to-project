import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const explicitConstraintMarkers = [
  'must',
  'required',
  'at least',
  'cannot',
  'must not',
  'should',
  '必须',
  '至少',
  '不得',
  '不能',
  '不允许',
  '禁止',
  '需要',
];

const entityDefinitions: Record<string, string> = {
  phone_number: 'user contact number used for identity verification and notifications',
  password: 'secret credential used to authenticate a user',
  verification_code: 'temporary code used to verify user identity or login intent',
  user_registration: 'workflow where a new user creates an account',
  user: 'person or account holder using the system',
  手机号: '用户联系电话，可用于身份校验和通知触达',
  密码: '用户登录或鉴权时使用的秘密凭证',
  验证码: '用于确认身份或操作意图的一次性临时代码',
  用户注册: '新用户创建账号的业务流程',
  用户: '使用系统的人或账号主体',
};

export const checkConstraintValidityTool = tool(
  ({ constraint }) => {
    const normalized = constraint.trim().toLowerCase();
    const valid = Boolean(normalized) && explicitConstraintMarkers.some((marker) => normalized.includes(marker));

    return JSON.stringify({
      valid,
      reason: valid
        ? 'constraint contains an explicit requirement marker'
        : 'constraint does not contain an explicit requirement marker',
    });
  },
  {
    name: 'check_constraint_validity',
    description: 'Check whether a requirement constraint is explicit and usable.',
    schema: z.object({
      constraint: z.string().describe('A single candidate constraint from the requirement text.'),
    }),
  },
);

export const lookupEntityDefinitionTool = tool(
  ({ entity }) => {
    const normalized = entity.trim();
    const definition = entityDefinitions[normalized] ?? 'No local definition found for this entity.';

    return JSON.stringify({
      entity: normalized,
      definition,
    });
  },
  {
    name: 'lookup_entity_definition',
    description: 'Look up a short local definition for a requirement entity.',
    schema: z.object({
      entity: z.string().describe('The entity name to define.'),
    }),
  },
);

export const basicTools = [checkConstraintValidityTool, lookupEntityDefinitionTool];
