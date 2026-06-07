import type { ScalarValue, UICard, UIComponentProps } from "./types";

export function InfoCard({ component, onAction }: UIComponentProps<UICard>) {
  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div>
        <h3 className="text-base font-semibold text-zinc-950">{component.title}</h3>
        {component.subtitle ? <p className="mt-1 text-sm text-zinc-600">{component.subtitle}</p> : null}
      </div>
      <dl className="mt-4 grid gap-3">
        {component.fields.map((field) => (
          <div className="grid gap-1 rounded-md bg-zinc-50 px-3 py-2" key={field.label}>
            <dt className="text-xs font-medium text-zinc-500">{field.label}</dt>
            <dd className="break-words text-sm text-zinc-950">{formatValue(field.value)}</dd>
          </div>
        ))}
      </dl>
      {component.actions?.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {component.actions.map(({ action, label, variant = "secondary" }) => (
            <button
              className={buttonClassName(variant)}
              key={`${component.id}-${label}`}
              onClick={() => onAction(action)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function formatValue(value: ScalarValue) {
  if (value === null) {
    return "无";
  }

  if (typeof value === "boolean") {
    return value ? "是" : "否";
  }

  return String(value);
}

function buttonClassName(variant: "primary" | "secondary" | "danger") {
  if (variant === "primary") {
    return "rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2";
  }

  if (variant === "danger") {
    return "rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2";
  }

  return "rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2";
}
