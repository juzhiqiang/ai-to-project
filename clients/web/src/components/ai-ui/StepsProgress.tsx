import type { UIComponentProps, UISteps, UIStepItem } from "./types";

export function StepsProgress({ component }: UIComponentProps<UISteps>) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <ol className="grid gap-3">
        {component.steps.map((step, index) => (
          <li className="flex gap-3" key={`${step.label}-${index}`}>
            <span className={indicatorClassName(step)}>{index + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-zinc-950">{step.label}</span>
              {step.description ? <span className="mt-0.5 block text-xs leading-5 text-zinc-600">{step.description}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function indicatorClassName(step: UIStepItem) {
  const base = "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold";

  switch (step.status) {
    case "completed":
      return `${base} bg-emerald-100 text-emerald-700`;
    case "current":
      return `${base} bg-zinc-950 text-white`;
    case "failed":
      return `${base} bg-red-100 text-red-700`;
    case "pending":
      return `${base} bg-zinc-100 text-zinc-500`;
  }
}
