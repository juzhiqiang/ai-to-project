import type { UIComponentProps, UIConfirmation } from "./types";

export function ConfirmationDialog({ component, onAction }: UIComponentProps<UIConfirmation>) {
  const confirmAction = component.action ?? {
    type: "confirmation" as const,
    componentType: "confirmation" as const,
    componentId: component.id,
    payload: true,
  };

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold text-zinc-950">{component.title}</h3>
      <ul className="mt-3 grid gap-2 text-sm text-zinc-700">
        {component.summary.map((item) => (
          <li className="rounded-md bg-zinc-50 px-3 py-2" key={item}>
            {item}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2"
          onClick={() => onAction(confirmAction)}
          type="button"
        >
          {component.confirmLabel ?? "确认"}
        </button>
        <button
          className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2"
          onClick={() =>
            onAction({
              type: "confirmation",
              componentType: "confirmation",
              componentId: component.id,
              payload: false,
            })
          }
          type="button"
        >
          {component.cancelLabel ?? "取消"}
        </button>
      </div>
    </section>
  );
}
