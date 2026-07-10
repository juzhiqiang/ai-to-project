import { z } from 'zod';

// 前端组件里允许展示的基础值类型，避免模型输出嵌套对象导致渲染不可控。
const scalarValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const recordValueSchema = z.record(z.string(), scalarValueSchema);

// 所有 UI 事件回传都先收敛到同一个 Action 协议，再由 action service 分发。
const uiActionSchemaBase = z.object({
  type: z.enum(['selection', 'form_submit', 'confirmation', 'button_click']),
  componentType: z.enum([
    'text',
    'selection',
    'form',
    'confirmation',
    'card',
    'steps',
    'table',
    'action_buttons',
  ]).optional(),
  componentId: z.string().min(1),
  payload: z.unknown().optional(),
  value: z.unknown().optional(),
});

export const uiActionSchema = uiActionSchemaBase;

// selection 组件和 select 表单字段共用同一组选项定义。
const selectionOptionSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  description: z.string().optional(),
});

// text 用于 Markdown/纯文本，通常作为说明、摘要或兜底回复。
const textSchema = z.object({
  type: z.literal('text'),
  id: z.string().min(1),
  content: z.string(),
});

// selection 用于让用户选择需求类型、处理路径或下一步动作。
const selectionSchema = z.object({
  type: z.literal('selection'),
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  mode: z.enum(['single', 'multiple']),
  options: z.array(selectionOptionSchema).min(1),
});

// formFieldBase 只放各字段共享属性，具体字段类型通过 discriminatedUnion 扩展。
const formFieldBase = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
  defaultValue: z.union([z.string(), z.number()]).optional(),
});

// 表单字段也使用 type 判别，确保 input/select/textarea/date/number 精确匹配。
const formFieldSchema = z.discriminatedUnion('type', [
  formFieldBase.extend({ type: z.literal('input') }),
  formFieldBase.extend({ type: z.literal('select'), options: z.array(selectionOptionSchema).min(1) }),
  formFieldBase.extend({ type: z.literal('textarea') }),
  formFieldBase.extend({ type: z.literal('date') }),
  formFieldBase.extend({ type: z.literal('number'), min: z.number().optional(), max: z.number().optional() }),
]);

// form 用于动态收集需求分析所需的信息。
const formSchema = z.object({
  type: z.literal('form'),
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  submitLabel: z.string().optional(),
  fields: z.array(formFieldSchema).min(1),
});

// confirmation 用于需要用户二次确认的提交、删除、发布等操作。
const confirmationSchema = z.object({
  type: z.literal('confirmation'),
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.array(z.string()).min(1),
  confirmLabel: z.string().optional(),
  cancelLabel: z.string().optional(),
  action: uiActionSchema.optional(),
});

// actionButtonSchema 被 card 和 action_buttons 复用。
const actionButtonSchema = z.object({
  label: z.string().min(1),
  variant: z.enum(['primary', 'secondary', 'danger']).optional(),
  action: uiActionSchema,
});

// card 展示单个业务对象，例如需求详情、订单详情或商品信息。
const cardSchema = z.object({
  type: z.literal('card'),
  id: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  fields: z.array(
    z.object({
      label: z.string().min(1),
      value: scalarValueSchema,
    }),
  ),
  actions: z.array(actionButtonSchema).optional(),
});

// steps 展示需求分析或审批流程的当前进度。
const stepsSchema = z.object({
  type: z.literal('steps'),
  id: z.string().min(1),
  current: z.number().int().min(0),
  steps: z.array(
    z.object({
      label: z.string().min(1),
      status: z.enum(['pending', 'current', 'running', 'completed', 'failed']),
      description: z.string().optional(),
    }),
  ).min(1),
});

// table 展示批量结构化数据，rows 的 key 与 columns.key 对应。
const tableSchema = z.object({
  type: z.literal('table'),
  id: z.string().min(1),
  title: z.string().optional(),
  columns: z.array(
    z.object({
      key: z.string().min(1),
      label: z.string().min(1),
    }),
  ).min(1),
  rows: z.array(recordValueSchema),
});

// action_buttons 是纯动作区，适合放在流程末尾或兜底提示后。
const actionButtonsSchema = z.object({
  type: z.literal('action_buttons'),
  id: z.string().min(1),
  actions: z.array(actionButtonSchema).min(1),
});

// 统一组件协议：基于 type 字段判别，模型输出和前端消费都依赖这个入口。
export const uiResponseSchema = z.discriminatedUnion('type', [
  textSchema,
  selectionSchema,
  formSchema,
  confirmationSchema,
  cardSchema,
  stepsSchema,
  tableSchema,
  actionButtonsSchema,
]);

// AI 顶层 UI 响应：一句自然语言提示 + 至少一个可渲染组件。
export const aiUIResponseSchema = z.object({
  message: z.string(),
  components: z.array(uiResponseSchema).min(1),
});

export type UIResponse = z.infer<typeof uiResponseSchema>;
export type UIAction = z.infer<typeof uiActionSchema>;
export type AIUIResponse = z.infer<typeof aiUIResponseSchema>;
