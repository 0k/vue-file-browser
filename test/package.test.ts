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
    "--vfb-accent", "--vfb-accent-fg", "--vfb-bg", "--vfb-border", "--vfb-content-max", "--vfb-dim-fg", "--vfb-error-fg", "--vfb-fg",
    "--vfb-file-icon", "--vfb-folder-icon", "--vfb-font-family", "--vfb-font-size", "--vfb-gutter", "--vfb-hover-bg", "--vfb-row-height", "--vfb-row-inset",
    "--vfb-selected-bg", "--vfb-sticky-bg",
  ]);
});
it("no box around the widget", () => {
  const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
  const root = css.slice(0, css.indexOf("}"));
  expect([/(^|[\s;{])border\s*:/.test(root), /border-radius/.test(root)]).toEqual([false, false]);
  expect(root).toContain('--vfb-font-family: "Noto Sans", Cantarell, sans-serif;');
  // No padding beyond the column gap between Size and Modified.
  expect(/padding-left:\s*var\(--vfb-column-gap\)/.test(css)).toBe(false);
});
it("caps the content width through --vfb-content-max, never the scroller", () => {
  const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  expect(css.slice(0, css.indexOf("}"))).toContain("--vfb-content-max: none;");
  const rule = css.match(/([^{}]+)\{[^}]*max-width:\s*var\(--vfb-content-max\)[^}]*\}/);
  expect(rule?.[1]?.split(",").map(s => s.trim()).sort()).toEqual([
    ".vfb-root .vfb-columns", ".vfb-root .vfb-header", ".vfb-root .vfb-list", ".vfb-root .vfb-state", ".vfb-root .vfb-truncated",
  ]);
  expect(rule?.[0]).toContain("margin-inline: auto");
  const body = css.match(/\.vfb-root \.vfb-body \{[^}]*\}/)?.[0];
  expect(body).toContain("overflow: auto");
  expect(body).not.toContain("max-width");
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
it("documents the home segment's house icon", () => {
  const readme = readFileSync(new URL("../README.org", import.meta.url), "utf8");
  expect(readme).toContain("The home segment of the path bar shows a house icon.");
});
it("documents that the host applies requests to show hidden files", () => {
  const readme = readFileSync(new URL("../README.org", import.meta.url), "utf8").replace(/\s+/g, " ");
  expect(readme).toContain("the host must update ~showHidden~ to reveal them.");
});
it("documents the required control bindings separately from optional persistence", () => {
  const readme = readFileSync(new URL("../README.org", import.meta.url), "utf8").replace(/\s+/g, " ");
  expect(readme).toContain("Hosts must bind ~v-model:sort~, ~v-model:show-hidden~ and ~v-model:column-widths~ for the controls to take effect.");
  expect(readme).toContain("Without ~v-model:column-widths~, the resize preview snaps back on release.");
  expect(readme).not.toContain("if they want them remembered");
});
