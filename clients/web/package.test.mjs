import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("web dev script uses webpack instead of turbopack", () => {
  const packageJson = JSON.parse(
    readFileSync(new URL("./package.json", import.meta.url), "utf8"),
  );

  assert.equal(packageJson.scripts.dev, "bun --bun next dev --webpack");
});
