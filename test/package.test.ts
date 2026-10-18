// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("stylesheet contract", () => {
  const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
  expect(/:has\s*\(|@container|light-dark\(/.test(css)).toBe(false);
  // Every rule hangs from .vfb-root.
  const selectors = css.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{}]+(?=\{)/g)!.flatMap(s => s.split(",")).map(s => s.trim()).filter(s => !s.startsWith("@") && !/^\d+%$|^from$|^to$/.test(s));
  expect(selectors.filter(s => !s.startsWith(".vfb-root"))).toEqual([]);
  // Colours are only declared as variables on the root block.
  const [root, ...rest] = css.split(/(?=\n\.vfb-root[^{]*\{)/);
  expect(rest.join("").match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g)).toBeNull();
  expect(root).toBeDefined();
  expect(css.match(/--vfb-[a-z-]+(?=\s*:)/g)?.filter((s, i, all) => all.indexOf(s) === i).sort()).toEqual([
    "--vfb-accent", "--vfb-accent-fg", "--vfb-bg", "--vfb-border", "--vfb-dim-fg", "--vfb-error-fg", "--vfb-fg",
    "--vfb-file-icon", "--vfb-folder-icon", "--vfb-font-size", "--vfb-header-bg", "--vfb-hover-bg", "--vfb-radius", "--vfb-row-height",
    "--vfb-selected-bg",
  ]);
});
it("package contract", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  expect(pkg.dependencies).toBeUndefined();
  expect(pkg.peerDependencies).toEqual({ vue: "^3.5.0" });
  expect(pkg.exports).toEqual({ ".": { types: "./dist/index.d.ts", default: "./dist/index.js" }, "./style.css": "./dist/style.css" });
  expect([pkg.main, pkg.module, pkg.types]).toEqual(["./dist/index.js", "./dist/index.js", "./dist/index.d.ts"]);
  expect(Object.values(pkg.devDependencies).every(v => typeof v === "string" && /^\d+\.\d+\.\d+$/.test(v))).toBe(true);
});
it("package source never fetches, routes or persists", () => {
  for (const f of ["FileBrowser.vue", "model.ts", "icons.ts", "index.ts"]) {
    const src = readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
    expect([f, /\bfetch\(|XMLHttpRequest|localStorage|sessionStorage|history\.|location\./.test(src)]).toEqual([f, false]);
  }
});
it("cleans bundles before emitting declarations, with no emission during ordinary typechecking", () => {
  const json = (name: string) => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), "utf8"));
  expect(json("package.json").scripts.build).toBe("vite build && vue-tsc -p tsconfig.build.json && node scripts/finish-build.mjs");
  expect(json("tsconfig.json").compilerOptions.noEmit).toBe(true);
  expect(json("tsconfig.build.json").compilerOptions.noEmit).toBe(false);
  expect(readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8")).not.toContain("emptyOutDir: false");
});
it("pins the approved toolchain updates", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
  expect([pkg.devDependencies.vitest, pkg.devDependencies.vite, pkg.devDependencies.vue]).toEqual(["2.1.9", "5.4.21", "3.5.44"]);
  expect(lock.packages[""].devDependencies).toEqual(pkg.devDependencies);
});
it("documents that the host applies requests to show hidden files", () => {
  const readme = readFileSync(new URL("../README.org", import.meta.url), "utf8").replace(/\s+/g, " ");
  expect(readme).toContain("the host must update ~showHidden~ to reveal them.");
});
