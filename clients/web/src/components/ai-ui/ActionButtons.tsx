import type { UIActionButtons, UIComponentProps, UIActionButton } from "./types";

export function ActionButtons({ component, onAction }: UIComponentProps<UIActionButtons>) {
  return (
    <div className="flex flex-wrap gap-2 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      {component.actions.map(({ action, label, variant = "secondary" }) => (
        <button className={buttonClassName(variant)} key={`${component.id}-${label}`} onClick={() => onAction(action)} type="button">
          {label}
        </button>
      ))}
    </div>
  );
}

function buttonClassName(variant: NonNullable<UIActionButton["variant"]>) {
  if (variant === "primary") {
    return "rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2";
  }

  if (variant === "danger") {
    return "rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2";
  }

  return "rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2";
}
