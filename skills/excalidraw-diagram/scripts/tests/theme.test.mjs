import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { contrastRatio, validateTheme } from "../validate_theme.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

test("default theme satisfies the semantic contract and normal-text contrast", async () => {
  const themePath = path.resolve(TEST_DIR, "../../references/default-theme.json");
  const theme = JSON.parse(await readFile(themePath, "utf8"));
  const result = validateTheme(theme);
  assert.deepEqual(result.errors, []);
  assert.ok(Math.min(...result.ratios.map(({ ratio }) => ratio)) >= 4.5);
});

test("theme validation rejects low contrast", async () => {
  assert.ok(contrastRatio("#3B82F6", "#374151") < 3);
  const themePath = path.resolve(TEST_DIR, "../../references/default-theme.json");
  const theme = JSON.parse(await readFile(themePath, "utf8"));
  theme.text.onFill = "#3B82F6";
  assert.ok(validateTheme(theme).errors.some((error) => error.includes("text.onFill")));
});
