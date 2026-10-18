// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
it("build removes stale output and emits the public declarations afterwards", () => {
  const stale = new URL("../dist/stale-build-test.js", import.meta.url);
  mkdirSync(new URL("../dist", import.meta.url), { recursive: true });
  writeFileSync(stale, "stale output");
  try {
    execFileSync("npm", ["run", "build"], { cwd: root, stdio: "pipe" });
    expect(existsSync(stale)).toBe(false);
    for (const name of ["index.js", "style.css", "index.d.ts", "model.d.ts", "FileBrowser.vue.d.ts", "icons.d.ts"]) {
      expect(readFileSync(new URL(`../dist/${name}`, import.meta.url), "utf8").length).toBeGreaterThan(0);
    }
    expect(existsSync(new URL("../dist/index.cjs", import.meta.url))).toBe(false);
    expect(readFileSync(new URL("../dist/index.d.ts", import.meta.url), "utf8")).not.toMatch(/import\s*["'][^"']+\.css["']/);
    expect(readFileSync(new URL("../dist/style.css", import.meta.url), "utf8"))
      .toBe(readFileSync(new URL("../src/style.css", import.meta.url), "utf8"));
  } finally {
    rmSync(stale, { force: true });
  }
}, 15000);

it("built package typechecks for strict consumers without side-effect CSS declarations", () => {
  const consumer = mkdtempSync(`${root}node_modules/.consumer-test-`);
  try {
    mkdirSync(`${consumer}/node_modules/@0k`, { recursive: true });
    symlinkSync(root, `${consumer}/node_modules/@0k/vue-file-browser`, "dir");
    writeFileSync(`${consumer}/consumer.ts`, [
      'import { FileBrowser, sortEntries, type FolderEntry } from "@0k/vue-file-browser";',
      'const entries: FolderEntry[] = [];',
      'void FileBrowser; void sortEntries(entries);',
    ].join("\n"));
    const result = spawnSync(`${root}node_modules/.bin/tsc`, [
      "--noEmit", "--strict", "--skipLibCheck", "false", "--noUncheckedSideEffectImports", "true",
      "--moduleResolution", "bundler", "--module", "esnext", "--target", "es2020", "--types", "vue",
      `${consumer}/consumer.ts`,
    ], { cwd: consumer, encoding: "utf8" });
    expect([result.status, result.stdout, result.stderr]).toEqual([0, "", ""]);
  } finally {
    rmSync(consumer, { recursive: true });
  }
}, 15000);

it("plain tsc emits no files", () => {
  const output = execFileSync("./node_modules/.bin/tsc", ["--listEmittedFiles"], { cwd: root, encoding: "utf8" });
  expect(output).toBe("");
}, 10000);
