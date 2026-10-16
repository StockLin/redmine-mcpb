// Release a new version: npm run release <version> [-- --dry-run]
// Bumps the version, checks that it builds, then commits, tags and pushes.
// GitHub Actions picks up the tag and publishes redmine.mcpb to Releases.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const next = args.find((a) => !a.startsWith("--"))?.replace(/^v/, "");

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
const out = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();
const fail = (msg) => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const writeJson = (file, data) => writeFileSync(file, JSON.stringify(data, null, 2) + "\n");

// --- Checks -----------------------------------------------------------------

const current = readJson("manifest.json").version;
if (!next) fail(`請指定新版本，例如：npm run release 1.0.2（目前是 ${current}）`);
if (!/^\d+\.\d+\.\d+$/.test(next)) fail(`版本格式要是 X.Y.Z，收到 ${next}`);

const cmp = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};
if (cmp(next, current) <= 0) fail(`新版本 ${next} 必須大於目前的 ${current}`);

if (out("git branch --show-current") !== "main") fail("請在 main 分支上發版");
if (out("git status --porcelain")) fail("還有未 commit 的變更，請先 commit 或還原");

run("git fetch --quiet origin main --tags");
if (out("git rev-list --count HEAD..origin/main") !== "0") fail("本地落後 origin/main，請先 git pull");
if (out(`git tag --list v${next}`)) fail(`tag v${next} 已經存在`);

// --- Bump & verify ----------------------------------------------------------

console.log(`\n▶ ${current} → ${next}${dryRun ? "（dry run，不會 commit / push）" : ""}\n`);

const files = ["manifest.json", "package.json", "package-lock.json"];
const originals = Object.fromEntries(files.map((f) => [f, readFileSync(f, "utf8")]));

for (const file of ["manifest.json", "package.json"]) {
  const data = readJson(file);
  data.version = next;
  writeJson(file, data);
}
const lock = readJson("package-lock.json");
lock.version = next;
if (lock.packages?.[""]) lock.packages[""].version = next;
writeJson("package-lock.json", lock);

try {
  run("npm run typecheck");
  run("npm run pack");
} catch {
  for (const [f, content] of Object.entries(originals)) writeFileSync(f, content);
  fail("檢查或打包失敗，版本號已還原");
}

if (dryRun) {
  for (const [f, content] of Object.entries(originals)) writeFileSync(f, content);
  console.log(`\n✓ dry run 通過，版本號已還原。本機打包結果：redmine.mcpb（v${next}）`);
  process.exit(0);
}

// --- Publish ----------------------------------------------------------------

run(`git add ${files.join(" ")}`);
run(`git commit -q -m "chore: 發佈 v${next}"`);
run(`git tag v${next}`);
run(`git push -q origin main v${next}`);

// owner/repo from the origin remote; works with SSH host aliases like git@github.com-personal:owner/repo.git
const repo = out("git remote get-url origin").match(/[:/]([^/:]+\/[^/]+?)(\.git)?$/)?.[1] ?? "<owner>/<repo>";
console.log(`
✓ 已推送 v${next}，GitHub Actions 打包約需 30 秒
  進度：https://github.com/${repo}/actions
  下載：https://github.com/${repo}/releases/latest/download/redmine.mcpb`);
