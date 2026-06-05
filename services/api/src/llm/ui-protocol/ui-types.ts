export type UIResponse =
  | UIText
  | UISelection
  | UIForm
  | UIConfirmation
  | UICard
  | UISteps
  | UITable
  | UIActionButtons;

export interface UIBase {
  id: string;
  type: UIResponse['type'];
}

export interface UIText {
  type: 'text';
  id: string;
  content: string;
}

export interface UISelection {
  type: 'selection';
  id: string;
  title: string;
  description?: string;
  mode: 'single' | 'multiple';
  options: UISelectionOption[];
}

export interface UISelectionOption {
  label: string;
  value: string;
  description?: string;
}

export interface UIForm {
  type: 'form';
  id: string;
  title: string;
  description?: string;
  submitLabel?: string;
  fields: UIFormField[];
}

export type UIFormField =
  | UIInputField
  | UISelectField
  | UITextareaField
  | UIDateField
  | UINumberField;

interface UIFormFieldBase {
  type: UIFormField['type'];
  name: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | number;
}

export interface UIInputField extends UIFormFieldBase {
  type: 'input';
}

export interface UISelectField extends UIFormFieldBase {
  type: 'select';
  options: UISelectionOption[];
}

export interface UITextareaField extends UIFormFieldBase {
  type: 'textarea';
}

export interface UIDateField extends UIFormFieldBase {
  type: 'date';
}

export interface UINumberField extends UIFormFieldBase {
  type: 'number';
  min?: number;
  max?: number;
}

export interface UIConfirmation {
  type: 'confirmation';
  id: string;
  title: string;
  summary: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  action?: UIAction;
}

export interface UICard {
  type: 'card';
  id: string;
  title: string;
  subtitle?: string;
  fields: UICardField[];
  actions?: UIActionButton[];
}

export interface UICardField {
  label: string;
  value: string | number | boolean | null;
}

export interface UISteps {
  type: 'steps';
  id: string;
  current: number;
  steps: UIStepItem[];
}

export interface UIStepItem {
  label: string;
  status: 'pending' | 'current' | 'completed' | 'failed';
  description?: string;
}

export interface UITable {
  type: 'table';
  id: string;
  title?: string;
  columns: UITableColumn[];
  rows: Record<string, string | number | boolean | null>[];
}

export interface UITableColumn {
  key: string;
  label: string;
}

export interface UIActionButtons {
  type: 'action_buttons';
  id: string;
  actions: UIActionButton[];
}

export interface UIActionButton {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
  action: UIAction;
}

export type UIActionType = 'selection' | 'form_submit' | 'confirmation' | 'button_click';

export interface UIAction {
  type: UIActionType;
  componentId: string;
  value: unknown;
}

export interface AIUIResponse {
  message: string;
  components: UIResponse[];
}

export interface UISessionContext {
  sessionId: string;
  history?: string[];
  metadata?: Record<string, unknown>;
}
