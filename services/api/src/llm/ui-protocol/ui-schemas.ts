import { z } from 'zod';

const scalarValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const recordValueSchema = z.record(z.string(), scalarValueSchema);

const uiActionSchemaBase = z.object({
  type: z.enum(['selection', 'form_submit', 'confirmation', 'button_click']),
  componentId: z.string().min(1),
  value: z.unknown(),
});

export const uiActionSchema = uiActionSchemaBase;

const selectionOptionSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  description: z.string().optional(),
});

const textSchema = z.object({
  type: z.literal('text'),
  id: z.string().min(1),
  content: z.string(),
});

const selectionSchema = z.object({
  type: z.literal('selection'),
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  mode: z.enum(['single', 'multiple']),
  options: z.array(selectionOptionSchema).min(1),
});

const formFieldBase = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
  defaultValue: z.union([z.string(), z.number()]).optional(),
});

const formFieldSchema = z.discriminatedUnion('type', [
  formFieldBase.extend({ type: z.literal('input') }),
  formFieldBase.extend({ type: z.literal('select'), options: z.array(selectionOptionSchema).min(1) }),
  formFieldBase.extend({ type: z.literal('textarea') }),
  formFieldBase.extend({ type: z.literal('date') }),
  formFieldBase.extend({ type: z.literal('number'), min: z.number().optional(), max: z.number().optional() }),
]);

const formSchema = z.object({
  type: z.literal('form'),
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  submitLabel: z.string().optional(),
  fields: z.array(formFieldSchema).min(1),
});

const confirmationSchema = z.object({
  type: z.literal('confirmation'),
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.array(z.string()).min(1),
  confirmLabel: z.string().optional(),
  cancelLabel: z.string().optional(),
  action: uiActionSchema.optional(),
});

const actionButtonSchema = z.object({
  label: z.string().min(1),
  variant: z.enum(['primary', 'secondary', 'danger']).optional(),
  action: uiActionSchema,
});

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

const stepsSchema = z.object({
  type: z.literal('steps'),
  id: z.string().min(1),
  current: z.number().int().min(0),
  steps: z.array(
    z.object({
      label: z.string().min(1),
      status: z.enum(['pending', 'current', 'completed', 'failed']),
      description: z.string().optional(),
    }),
  ).min(1),
});

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

const actionButtonsSchema = z.object({
  type: z.literal('action_buttons'),
  id: z.string().min(1),
  actions: z.array(actionButtonSchema).min(1),
});

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

export const aiUIResponseSchema = z.object({
  message: z.string(),
  components: z.array(uiResponseSchema).min(1),
});

export type UIResponse = z.infer<typeof uiResponseSchema>;
export type UIAction = z.infer<typeof uiActionSchema>;
export type AIUIResponse = z.infer<typeof aiUIResponseSchema>;
