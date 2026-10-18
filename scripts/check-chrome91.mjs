import { readFileSync } from "node:fs";
import ts from "typescript";

// The package's browser ESM bundle and its explicit stylesheet export.
const files = ["dist/index.js", "dist/style.css"];
for (const file of files) {
  const source = readFileSync(file, "utf8");
  if (file.endsWith(".css")) {
    if (/:has\s*\(/.test(source)) throw new Error(`${file}: :has() requires Chrome 105`);
    if (/@container\b/.test(source)) throw new Error(`${file}: @container requires Chrome 105`);
    if (/light-dark\s*\(/.test(source)) throw new Error(`${file}: light-dark() requires a browser newer than Chrome 91`);
    continue;
  }
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS);
  if (parsed.parseDiagnostics.length) throw new Error(`${file}: ${parsed.parseDiagnostics[0].messageText}`);
  function visit(node) {
    if (ts.isClassStaticBlockDeclaration(node)) throw new Error(`${file}: class static initialization blocks require Chrome 94`);
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  const apis = [
    [/\bPromise\.withResolvers\s*\(/, "Promise.withResolvers"],
    [/\.at\(\s*-?\d/, "Array/String.prototype.at"],
    [/\bObject\.hasOwn\s*\(/, "Object.hasOwn"],
    [/\.findLast(Index)?\s*\(/, "Array.prototype.findLast"],
    [/\bstructuredClone\s*\(/, "structuredClone"],
    [/\.to(Sorted|Reversed|Spliced)\s*\(/, "change-array-by-copy"],
  ];
  for (const [pattern, api] of apis) {
    if (pattern.test(source)) throw new Error(`${file}: ${api} requires a browser newer than Chrome 91`);
  }
}
console.log(`Chrome 91 inspection passed for ${files.length} emitted JS/CSS files`);
