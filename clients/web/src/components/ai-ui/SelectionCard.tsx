import type { UIComponentProps, UISelection } from "./types";

export function SelectionCard({ component, onAction }: UIComponentProps<UISelection>) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-zinc-950">{component.title}</h3>
        {component.description ? <p className="text-sm leading-6 text-zinc-600">{component.description}</p> : null}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {component.options.map((option) => (
          <button
            className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-left transition hover:border-zinc-400 hover:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2"
            key={option.value}
            onClick={() =>
              onAction({
                type: "selection",
                componentType: "selection",
                componentId: component.id,
                payload: option.value,
              })
            }
            type="button"
          >
            <span className="block text-sm font-medium text-zinc-950">{option.label}</span>
            {option.description ? <span className="mt-1 block text-xs leading-5 text-zinc-600">{option.description}</span> : null}
          </button>
        ))}
      </div>
    </section>
  );
}
