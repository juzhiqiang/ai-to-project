/**
 * UIResponse 是后端给前端的可渲染组件协议。
 * 每个成员都用 type 作为判别字段，方便前端用 switch(type) 精确渲染。
 */
export type UIResponse =
  | UIText
  | UISelection
  | UIForm
  | UIConfirmation
  | UICard
  | UISteps
  | UITable
  | UIActionButtons;

/** 通用组件基础字段：id 用于前端事件回传和局部刷新定位。 */
export interface UIBase {
  id: string;
  type: UIResponse['type'];
}

/** Markdown/纯文本输出，适合说明性内容或分析摘要。 */
export interface UIText {
  type: 'text';
  id: string;
  content: string;
}

/** 单选/多选卡片，用于需求类型、处理路径等分支选择。 */
export interface UISelection {
  type: 'selection';
  id: string;
  title: string;
  description?: string;
  mode: 'single' | 'multiple';
  options: UISelectionOption[];
}

/** selection/select 字段共享的选项结构。 */
export interface UISelectionOption {
  label: string;
  value: string;
  description?: string;
}

/** 动态表单，用于收集需求标题、优先级、描述、日期、估算等信息。 */
export interface UIForm {
  type: 'form';
  id: string;
  title: string;
  description?: string;
  submitLabel?: string;
  fields: UIFormField[];
}

/** 表单字段联合类型，字段本身也用 type 做判别。 */
export type UIFormField =
  | UIInputField
  | UISelectField
  | UITextareaField
  | UIDateField
  | UINumberField;

/** 各类表单字段共享的展示和校验元信息。 */
interface UIFormFieldBase {
  type: UIFormField['type'];
  name: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | number;
}

/** 短文本输入。 */
export interface UIInputField extends UIFormFieldBase {
  type: 'input';
}

/** 下拉选择，适合优先级、需求类型等枚举值。 */
export interface UISelectField extends UIFormFieldBase {
  type: 'select';
  options: UISelectionOption[];
}

/** 多行文本，适合需求背景、问题描述、验收标准。 */
export interface UITextareaField extends UIFormFieldBase {
  type: 'textarea';
}

/** 日期字段，适合期望完成时间、上线时间。 */
export interface UIDateField extends UIFormFieldBase {
  type: 'date';
}

/** 数值字段，适合预估人天、数量、优先级权重等。 */
export interface UINumberField extends UIFormFieldBase {
  type: 'number';
  min?: number;
  max?: number;
}

/** 二次确认组件，用于提交分析、发布、删除等不可静默执行的操作。 */
export interface UIConfirmation {
  type: 'confirmation';
  id: string;
  title: string;
  summary: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  action?: UIAction;
}

/** 信息卡片，用于展示单个需求、订单、商品等详情对象。 */
export interface UICard {
  type: 'card';
  id: string;
  title: string;
  subtitle?: string;
  fields: UICardField[];
  actions?: UIActionButton[];
}

/** 卡片内的标签-值展示项。 */
export interface UICardField {
  label: string;
  value: string | number | boolean | null;
}

/** 步骤条，用于展示需求分析、审批、生成报告等流程状态。 */
export interface UISteps {
  type: 'steps';
  id: string;
  current: number;
  steps: UIStepItem[];
}

/** 单个步骤的状态。 */
export interface UIStepItem {
  label: string;
  status: 'pending' | 'current' | 'completed' | 'failed';
  description?: string;
}

/** 数据表格，用于批量展示需求列表、任务列表或分析结果列表。 */
export interface UITable {
  type: 'table';
  id: string;
  title?: string;
  columns: UITableColumn[];
  rows: Record<string, string | number | boolean | null>[];
}

/** 表格列定义，key 对应 rows 中的字段名。 */
export interface UITableColumn {
  key: string;
  label: string;
}

/** 操作按钮组，适合在卡片或流程节点后给出下一步动作。 */
export interface UIActionButtons {
  type: 'action_buttons';
  id: string;
  actions: UIActionButton[];
}

/** 单个按钮及其回传动作。 */
export interface UIActionButton {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
  action: UIAction;
}

/** 前端可回传的动作类型，覆盖选择、表单提交、确认框和普通按钮。 */
export type UIActionType = 'selection' | 'form_submit' | 'confirmation' | 'button_click';

/** UIAction 是前端事件回传给 /api/ui-chat/action 的统一载荷。 */
export interface UIAction {
  type: UIActionType;
  componentType?: UIResponse['type'];
  componentId: string;
  /** 6.1 新协议字段：组件动作携带的业务数据。 */
  payload?: unknown;
  /** 兼容 6.0 已有调用方，优先读取 payload，缺省时回退到 value。 */
  value?: unknown;
}

/** AIUIResponse 是 UI 聊天接口的顶层响应：自然语言提示 + 一组组件。 */
export interface AIUIResponse {
  message: string;
  components: UIResponse[];
}

/** 会话上下文用于 action 服务生成连续的下一步 UI。 */
export interface UISessionContext {
  sessionId: string;
  history?: string[];
  metadata?: Record<string, unknown>;
}

export type UIFlowStage = 'select_type' | 'fill_detail' | 'confirm' | 'result';

export interface UIFlowContext {
  sessionId: string;
  sessionStage: UIFlowStage;
  collectedData: Record<string, unknown>;
}
