import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const aiUiDir = new URL("./src/components/ai-ui/", import.meta.url);

function source(fileName) {
  return readFileSync(new URL(fileName, aiUiDir), "utf8");
}

test("6.2 creates the AI UI renderer and all required component files", () => {
  const files = [
    "ComponentRenderer.tsx",
    "SelectionCard.tsx",
    "DynamicForm.tsx",
    "ConfirmationDialog.tsx",
    "InfoCard.tsx",
    "StepsProgress.tsx",
    "DataTable.tsx",
    "ActionButtons.tsx",
    "AIChatContainer.tsx",
  ];

  for (const file of files) {
    assert.equal(existsSync(new URL(file, aiUiDir)), true, `${file} should exist`);
  }
});

test("ComponentRenderer dispatches every UIResponse type", () => {
  const renderer = source("ComponentRenderer.tsx");

  for (const type of ["selection", "form", "confirmation", "card", "steps", "table", "action_buttons", "text"]) {
    assert.match(renderer, new RegExp(`case\\s+["']${type}["']`), `${type} should be handled`);
  }
});

test("interactive components send UIAction payloads through onAction", () => {
  assert.match(source("SelectionCard.tsx"), /onAction\(\{[\s\S]*type:\s*["']selection["']/);
  assert.match(source("DynamicForm.tsx"), /onAction\(\{[\s\S]*type:\s*["']form_submit["']/);
  assert.match(source("ConfirmationDialog.tsx"), /onAction\(\{[\s\S]*type:\s*["']confirmation["']/);
  assert.match(source("ActionButtons.tsx"), /onAction\(action\)/);
});

test("AIChatContainer calls the UI chat backend endpoints", () => {
  const container = source("AIChatContainer.tsx");

  assert.match(container, /fetch\(["']\/api\/ui-chat\/chat["']/);
  assert.match(container, /fetch\(["']\/api\/ui-chat\/action["']/);
});

test("AIChatContainer replaces the current assistant view for navigation actions", () => {
  const container = source("AIChatContainer.tsx");

  assert.match(container, /function shouldReplaceLatestAssistantTurn/);
  assert.match(container, /payload === "view_report"/);
  assert.match(container, /payload === "back_to_result"/);
  assert.match(container, /payload === "edit_detail"/);
  assert.match(container, /replaceLatestAssistantTurn\(data\)/);
});
