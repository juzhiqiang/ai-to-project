import { z } from 'zod';

export const APP_NAME = "llm";

const RequirementActionSchema = z.preprocess(
  (value) => {
    if (typeof value === 'string') {
      return value ? [value] : [];
    }

    return value;
  },
  z.array(z.string()).max(1),
);

export const RequirementSchema = z.object({
  action: RequirementActionSchema.describe('唯一核心动作'),
  constraints: z.array(z.string()).describe('明确约束条件'),
  entities: z.array(z.string()).describe('关键实体'),
});

export const RequirementResultSchema = RequirementSchema.describe('Structured requirement extraction result.');

export type RequirementResult = z.infer<typeof RequirementResultSchema>;
