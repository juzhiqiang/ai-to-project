import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("web dev container uses webpack instead of turbopack", () => {
  const composeDev = readFileSync(new URL("./compose.dev.yaml", import.meta.url), "utf8");

  assert.match(
    composeDev,
    /command:\s*\["bun", "--bun", "next", "dev", "--webpack", "--hostname", "0\.0\.0\.0", "--port", "3000"\]/,
  );
});
