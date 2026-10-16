import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BULK_CONFIRM_THRESHOLD } from "../config.js";
import { guarded } from "../confirm.js";
import { fenced, issueLine, type Issue } from "../format.js";
import * as lookup from "../lookup.js";
import { get, post, put, RedmineError, webUrl } from "../redmine.js";
import { date, handle, isNone, ref, today } from "./util.js";

const clearableDate = z.union([date, z.literal("")]).describe("YYYY-MM-DD，空字串代表清除");

const customFields = z
  .array(z.object({ field: ref.describe("自訂欄位名稱或 id"), value: z.union([z.string(), z.array(z.string())]) }))
  .describe("自訂欄位值；名稱可用 get_project_options 查");

const editable = {
  subject: z.string().min(1).optional(),
  description: z.string().optional(),
  status: ref.optional().describe("狀態名稱或 id"),
  priority: ref.optional().describe("優先權名稱或 id"),
  assignee: ref.optional().describe("me、成員名字或 id；none 代表取消指派"),
  category: ref.optional().describe("分類名稱或 id；none 代表清除"),
  version: ref.optional().describe("版本名稱或 id；none 代表清除"),
  parent_issue_id: z.number().int().nullable().optional().describe("上層 issue 編號；null 代表移除上層"),
  start_date: clearableDate.optional(),
  due_date: clearableDate.optional(),
  estimated_hours: z.number().min(0).nullable().optional(),
  done_ratio: z.number().int().min(0).max(100).optional(),
  is_private: z.boolean().optional(),
  custom_fields: customFields.optional(),
};

type Editable = {
  [K in keyof typeof editable]?: z.infer<(typeof editable)[K]>;
};

// Resolves names to ids and builds the `issue` payload Redmine expects.
async function buildPayload(a: Editable & { tracker?: string | number }, projectId: number) {
  const issue: Record<string, unknown> = {};
  if (a.subject !== undefined) issue.subject = a.subject;
  if (a.description !== undefined) issue.description = a.description;
  if (a.tracker !== undefined) issue.tracker_id = await lookup.resolveTracker(a.tracker, projectId);
  if (a.status !== undefined) issue.status_id = await lookup.resolveStatus(a.status);
  if (a.priority !== undefined) issue.priority_id = await lookup.resolvePriority(a.priority);
  if (a.assignee !== undefined) issue.assigned_to_id = isNone(a.assignee) ? "" : await lookup.resolveUser(a.assignee, projectId);
  if (a.category !== undefined) issue.category_id = isNone(a.category) ? "" : await lookup.resolveCategory(a.category, projectId);
  if (a.version !== undefined) issue.fixed_version_id = isNone(a.version) ? "" : await lookup.resolveVersion(a.version, projectId);
  if (a.parent_issue_id !== undefined) issue.parent_issue_id = a.parent_issue_id ?? "";
  if (a.start_date !== undefined) issue.start_date = a.start_date;
  if (a.due_date !== undefined) issue.due_date = a.due_date;
  if (a.estimated_hours !== undefined) issue.estimated_hours = a.estimated_hours ?? "";
  if (a.done_ratio !== undefined) issue.done_ratio = a.done_ratio;
  if (a.is_private !== undefined) issue.is_private = a.is_private;
  if (a.custom_fields?.length) issue.custom_fields = await lookup.resolveCustomFields(a.custom_fields, projectId);
  return issue;
}

const FIELDS: [string, (i: Issue) => unknown][] = [
  ["專案", (i) => i.project.name],
  ["追蹤標籤", (i) => i.tracker.name],
  ["標題", (i) => i.subject],
  ["狀態", (i) => i.status.name],
  ["優先權", (i) => i.priority.name],
  ["指派", (i) => i.assigned_to?.name ?? "未指派"],
  ["分類", (i) => i.category?.name ?? "（無）"],
  ["版本", (i) => i.fixed_version?.name ?? "（無）"],
  ["上層", (i) => (i.parent ? `#${i.parent.id}` : "（無）")],
  ["開始", (i) => i.start_date ?? "（無）"],
  ["到期", (i) => i.due_date ?? "（無）"],
  ["完成度", (i) => `${i.done_ratio ?? 0}%`],
  ["預估", (i) => (i.estimated_hours ? `${i.estimated_hours}h` : "（無）")],
];

function diff(before: Issue, after: Issue): string[] {
  const out = FIELDS.filter(([, f]) => f(before) !== f(after)).map(([label, f]) => `${label}：${f(before)} → ${f(after)}`);
  if ((before.description ?? "") !== (after.description ?? "")) out.push("描述：已更新");
  const old = new Map((before.custom_fields ?? []).map((c) => [c.id, JSON.stringify(c.value)]));
  for (const c of after.custom_fields ?? []) {
    if (old.get(c.id) !== JSON.stringify(c.value)) out.push(`${c.name}：${[c.value].flat().join(", ") || "（空）"}`);
  }
  return out;
}

// Redmine silently ignores some changes (e.g. a status the workflow does not allow).
function ignored(payload: Record<string, unknown>, after: Issue): string[] {
  const out: string[] = [];
  if (payload.status_id !== undefined && after.status.id !== payload.status_id) out.push("狀態（工作流程可能不允許你的角色改成這個狀態）");
  if (payload.tracker_id !== undefined && after.tracker.id !== payload.tracker_id) out.push("追蹤標籤");
  if (typeof payload.assigned_to_id === "number" && after.assigned_to?.id !== payload.assigned_to_id) out.push("指派");
  return out;
}

const fetchIssue = async (id: number) => (await get<{ issue: Issue }>(`issues/${id}.json`)).issue;

export function registerWriteTools(server: McpServer) {
  server.registerTool(
    "create_issue",
    {
      title: "建立 issue",
      description: "在專案中建立 issue。名稱類欄位都可以用名稱或 id；不確定可選值時先用 get_project_options 查。",
      inputSchema: {
        project: ref.describe("專案名稱、識別碼或 id"),
        tracker: ref.optional().describe("追蹤標籤名稱或 id，未填用專案預設"),
        ...editable,
        subject: z.string().min(1),
        watchers: z.array(ref).optional().describe("追蹤者：成員名字或 id"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    handle(async (a) => {
      const project = await lookup.resolveProject(a.project);
      const issue = await buildPayload(a, project.id);
      issue.project_id = project.id;
      if (a.watchers?.length) issue.watcher_user_ids = await Promise.all(a.watchers.map((w) => lookup.resolveUser(w, project.id)));
      const res = await post<{ issue: Issue }>("issues.json", { issue });
      return fenced(`✓ 已建立 ${issueLine(res.issue)}\n${webUrl(`issues/${res.issue.id}`)}`);
    }),
  );

  server.registerTool(
    "update_issue",
    {
      title: "修改 issue",
      description:
        "修改單一 issue 的欄位，或加備註（notes）。只填要改的欄位。回傳每個欄位的「改前 → 改後」。" +
        "改專案（搬移）或追蹤標籤需要使用者確認。一次要改多張 issue 請改用 bulk_update_issues。",
      inputSchema: {
        issue_id: z.number().int(),
        ...editable,
        notes: z.string().optional().describe("要新增的備註"),
        private_notes: z.boolean().optional().describe("備註設為私人"),
        project: ref.optional().describe("搬移到其他專案（需確認）"),
        tracker: ref.optional().describe("變更追蹤標籤（需確認）"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    handle(async (a) => {
      const before = await fetchIssue(a.issue_id);
      const target = a.project !== undefined ? await lookup.resolveProject(a.project) : undefined;
      const projectId = target?.id ?? before.project.id;
      const issue = await buildPayload(a, projectId);
      if (target && target.id !== before.project.id) issue.project_id = target.id;
      if (a.notes) issue.notes = a.notes;
      if (a.private_notes !== undefined) issue.private_notes = a.private_notes;
      if (!Object.keys(issue).length) return "沒有指定要修改的欄位";

      const run = async () => {
        await put(`issues/${a.issue_id}.json`, { issue });
        const after = await fetchIssue(a.issue_id);
        const changes = diff(before, after);
        if (a.notes) changes.push("已新增備註");
        const skipped = ignored(issue, after);
        return fenced(
          [
            `✓ 已更新 #${a.issue_id} ${after.subject}`,
            ...(changes.length ? changes.map((c) => `- ${c}`) : ["- （沒有欄位實際改變）"]),
            ...(skipped.length ? [`⚠ 以下欄位沒有生效：${skipped.join("、")}`] : []),
          ].join("\n"),
        );
      };

      const moving = issue.project_id !== undefined;
      const retracking = issue.tracker_id !== undefined && issue.tracker_id !== before.tracker.id;
      if (!moving && !retracking) return run();
      const what = [moving && `搬到專案「${target!.name}」`, retracking && "變更追蹤標籤"].filter(Boolean).join("並");
      return guarded(server, { title: `#${a.issue_id} ${what}`, preview: `issue：${issueLine(before)}` }, run);
    }),
  );

  server.registerTool(
    "bulk_update_issues",
    {
      title: "批次修改 issue",
      description:
        `一次修改多張 issue 的相同欄位（狀態、指派、優先權、版本、到期日、完成度、備註）。` +
        `要改兩張以上 issue 時一律用這個工具，不要逐張呼叫 update_issue。${BULK_CONFIRM_THRESHOLD} 張以上需要使用者確認。`,
      inputSchema: {
        issue_ids: z.array(z.number().int()).min(1).max(200),
        status: editable.status,
        priority: editable.priority,
        assignee: editable.assignee,
        version: editable.version,
        due_date: editable.due_date,
        done_ratio: editable.done_ratio,
        notes: z.string().optional().describe("每張都加上的備註"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    handle(async (a) => {
      const ids = [...new Set(a.issue_ids)];
      const { issue_ids: _, notes, ...fields } = a;
      if (!notes && Object.values(fields).every((v) => v === undefined)) return "沒有指定要修改的欄位";

      const issues = await Promise.all(ids.map(fetchIssue));
      // Names resolve per project (members and versions differ between projects).
      const payloads = new Map<number, Record<string, unknown>>();
      for (const i of issues) {
        const p = await buildPayload(fields, i.project.id);
        if (notes) p.notes = notes;
        payloads.set(i.id, p);
      }

      const summary = [
        fields.status !== undefined && `狀態 → ${fields.status}`,
        fields.priority !== undefined && `優先權 → ${fields.priority}`,
        fields.assignee !== undefined && `指派 → ${fields.assignee}`,
        fields.version !== undefined && `版本 → ${fields.version}`,
        fields.due_date !== undefined && `到期 → ${fields.due_date || "（清除）"}`,
        fields.done_ratio !== undefined && `完成度 → ${fields.done_ratio}%`,
        notes && `加備註：${notes}`,
      ].filter(Boolean);

      const run = async () => {
        const ok: string[] = [];
        const failed: string[] = [];
        for (const i of issues) {
          try {
            await put(`issues/${i.id}.json`, { issue: payloads.get(i.id) });
            ok.push(`#${i.id}`);
          } catch (e) {
            failed.push(`#${i.id}：${e instanceof RedmineError ? e.message : e}`);
          }
        }
        return [
          `✓ 成功 ${ok.length} 張：${ok.join("、") || "（無）"}`,
          ...(failed.length ? [`✗ 失敗 ${failed.length} 張：`, ...failed.map((f) => `- ${f}`)] : []),
          "（各張實際變化可用 get_issue 查看）",
        ].join("\n");
      };

      if (issues.length < BULK_CONFIRM_THRESHOLD) return run();
      return guarded(
        server,
        {
          title: `批次修改 ${issues.length} 張 issue`,
          preview: fenced(`變更：${summary.join("；")}\n${issues.map(issueLine).join("\n")}`),
        },
        run,
      );
    }),
  );

  server.registerTool(
    "log_time",
    {
      title: "記錄工時",
      description: "記錄工時到 issue（或專案）。日期預設今天；活動未填時用 Redmine 預設活動。",
      inputSchema: {
        issue_id: z.number().int().optional(),
        project: ref.optional().describe("沒有 issue 時記到專案"),
        hours: z.number().positive().max(24),
        spent_on: date.optional().describe("預設今天"),
        activity: ref.optional().describe("工時活動名稱或 id，例如「開發」"),
        comments: z.string().max(1024).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    handle(async (a) => {
      if (!a.issue_id && a.project === undefined) return "✗ 需要提供 issue_id 或 project";
      const projectId = a.issue_id ? (await fetchIssue(a.issue_id)).project.id : (await lookup.resolveProject(a.project!)).id;
      const entry: Record<string, unknown> = {
        hours: a.hours,
        spent_on: a.spent_on ?? today(),
        comments: a.comments,
        ...(a.issue_id ? { issue_id: a.issue_id } : { project_id: projectId }),
      };
      if (a.activity !== undefined) entry.activity_id = await lookup.resolveActivity(a.activity, projectId);
      try {
        const res = await post<{ time_entry: { id: number; activity: { name: string } } }>("time_entries.json", { time_entry: entry });
        const where = a.issue_id ? `#${a.issue_id}` : "專案";
        return `✓ 已記 ${a.hours}h 到 ${where}（${entry.spent_on}，${res.time_entry.activity.name}，工時 id ${res.time_entry.id}）`;
      } catch (e) {
        if (e instanceof RedmineError && e.status === 422 && a.activity === undefined) {
          const options = (await lookup.activities(projectId)).map((x) => x.name).join("、");
          throw new RedmineError(422, `${e.message}。可能需要指定活動，可選：${options}`);
        }
        throw e;
      }
    }),
  );
}
