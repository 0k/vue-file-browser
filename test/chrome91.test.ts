// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const checker = fileURLToPath(new URL("../scripts/check-chrome91.mjs", import.meta.url));
function inspect(js: string, css = ".vfb-root { color: var(--vfb-fg); }") {
  const root = mkdtempSync(fileURLToPath(new URL("../node_modules/.chrome91-test-", import.meta.url)));
  try {
    mkdirSync(`${root}/dist`);
    writeFileSync(`${root}/dist/index.js`, js);
    writeFileSync(`${root}/dist/style.css`, css);
    return spawnSync(process.execPath, [checker], { cwd: root, encoding: "utf8" });
  } finally {
    rmSync(root, { recursive: true });
  }
}

it.each([
  ["values.at(-1)", "Array/String.prototype.at"],
  ["Object.hasOwn(value, 'key')", "Object.hasOwn"],
  ["values.findLast(Boolean)", "Array.prototype.findLast"],
  ["values.findLastIndex(Boolean)", "Array.prototype.findLast"],
  ["structuredClone(value)", "structuredClone"],
  ["values.toSorted()", "change-array-by-copy"],
  ["values.toReversed()", "change-array-by-copy"],
  ["values.toSpliced(0)", "change-array-by-copy"],
  ["Promise.withResolvers()", "Promise.withResolvers"],
  ["class Value { static {} }", "class static initialization blocks"],
])("Chrome 91 checker rejects %s in emitted JavaScript", (source, api) => {
  const result = inspect(source);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(api);
});
it.each([
  [".vfb-root:has(button) {}", ":has()"],
  ["@container (width > 1px) {}", "@container"],
  [".vfb-root { color: light-dark(white, black); }", "light-dark()"],
])("Chrome 91 checker rejects unsupported CSS: %s", (source, feature) => {
  const result = inspect("export const value = 1;", source);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(feature);
});
it("Chrome 91 checker accepts ES2020 and compatible CSS", () => {
  const result = inspect("export const value = input?.name ?? 'folder';");
  expect([result.status, result.stderr]).toEqual([0, ""]);
  expect(result.stdout).toContain("2 emitted JS/CSS files");
});
