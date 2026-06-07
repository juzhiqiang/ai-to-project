import type { FormEvent } from "react";
import type { UIComponentProps, UIForm, UIFormField } from "./types";

const fieldClassName =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-500 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200";

export function DynamicForm({ component, onAction }: UIComponentProps<UIForm>) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const payload = component.fields.reduce<Record<string, string | number>>((result, field) => {
      result[field.name] = readFieldValue(field, formData);
      return result;
    }, {});

    onAction({
      type: "form_submit",
      componentType: "form",
      componentId: component.id,
      payload,
    });
  }

  return (
    <form className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm" onSubmit={handleSubmit}>
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-zinc-950">{component.title}</h3>
        {component.description ? <p className="text-sm leading-6 text-zinc-600">{component.description}</p> : null}
      </div>
      <div className="mt-4 grid gap-4">
        {component.fields.map((field) => (
          <label className="grid gap-1.5 text-sm font-medium text-zinc-800" key={field.name}>
            <span>
              {field.label}
              {field.required ? <span className="text-red-600"> *</span> : null}
            </span>
            {renderField(field)}
          </label>
        ))}
      </div>
      <button
        className="mt-5 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2"
        type="submit"
      >
        {component.submitLabel ?? "提交"}
      </button>
    </form>
  );
}

function renderField(field: UIFormField) {
  const commonProps = {
    className: fieldClassName,
    defaultValue: field.defaultValue ?? "",
    name: field.name,
    placeholder: field.placeholder,
    required: field.required,
  };

  switch (field.type) {
    case "textarea":
      return <textarea {...commonProps} className={`${fieldClassName} min-h-28 resize-y leading-6`} />;
    case "select":
      return (
        <select {...commonProps}>
          <option value="" disabled={field.required}>
            请选择
          </option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    case "date":
      return <input {...commonProps} type="date" />;
    case "number":
      return <input {...commonProps} max={field.max} min={field.min} type="number" />;
    case "input":
      return <input {...commonProps} type="text" />;
  }
}

function readFieldValue(field: UIFormField, formData: FormData) {
  const value = formData.get(field.name);
  const rawValue = value === null ? "" : String(value);

  if (field.type === "number") {
    return rawValue === "" ? "" : Number(rawValue);
  }

  return rawValue;
}
