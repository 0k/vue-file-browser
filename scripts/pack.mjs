import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
mkdirSync(new URL("../artifacts/", import.meta.url), { recursive: true });
for (const args of [["run", "build"], ["pack", "--pack-destination", "artifacts", "--ignore-scripts"]]) {
  const result = spawnSync("npm", args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
