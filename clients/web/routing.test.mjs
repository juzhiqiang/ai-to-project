import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./app/page.tsx", import.meta.url), "utf8");
const nextConfigSource = readFileSync(new URL("./next.config.ts", import.meta.url), "utf8");

test("requirement page calls the backend route path directly", () => {
  assert.match(pageSource, /fetch\("\/requirement\/extract"/);
  assert.doesNotMatch(pageSource, /fetch\("\/api\/requirement\/extract"/);
});

test("next rewrites the requirement route to the API service", () => {
  assert.match(nextConfigSource, /source:\s*"\/requirement\/:path\*"/);
  assert.match(nextConfigSource, /destination:.*\/requirement\/:path\*/s);
});

test("next preserves the API prefix when proxying API routes", () => {
  assert.match(nextConfigSource, /source:\s*"\/api\/:path\*"/);
  assert.match(nextConfigSource, /destination:.*\/api\/:path\*/s);
});
