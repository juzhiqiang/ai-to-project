import { ActionButtons } from "./ActionButtons";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { DataTable } from "./DataTable";
import { DynamicForm } from "./DynamicForm";
import { InfoCard } from "./InfoCard";
import { SelectionCard } from "./SelectionCard";
import { StepsProgress } from "./StepsProgress";
import type { UIAction, UIResponse } from "./types";

interface ComponentRendererProps {
  component: UIResponse;
  onAction: (action: UIAction) => void;
}

export function ComponentRenderer({ component, onAction }: ComponentRendererProps) {
  switch (component.type) {
    case "text":
      return <p className="whitespace-pre-line rounded-lg border border-zinc-200 bg-white p-4 text-sm leading-6 text-zinc-800 shadow-sm">{component.content}</p>;
    case "selection":
      return <SelectionCard component={component} onAction={onAction} />;
    case "form":
      return <DynamicForm component={component} onAction={onAction} />;
    case "confirmation":
      return <ConfirmationDialog component={component} onAction={onAction} />;
    case "card":
      return <InfoCard component={component} onAction={onAction} />;
    case "steps":
      return <StepsProgress component={component} onAction={onAction} />;
    case "table":
      return <DataTable component={component} onAction={onAction} />;
    case "action_buttons":
      return <ActionButtons component={component} onAction={onAction} />;
    default:
      return assertNever(component);
  }
}

function assertNever(component: never): never {
  throw new Error(`Unsupported UI component: ${JSON.stringify(component)}`);
}
