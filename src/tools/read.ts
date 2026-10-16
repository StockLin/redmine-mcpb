import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fenced, issueDetail, issueLine, timeEntryLine, type Issue, type TimeEntry } from "../format.js";
import * as lookup from "../lookup.js";
import { get, getAll, type Params } from "../redmine.js";
import { date, handle, ref } from "./util.js";

const READ = { readOnlyHint: true, openWorldHint: true };

export function registerReadTools(server: McpServer) {
  server.registerTool(
    "list_issues",
    {
      title: "查詢 issue 列表",
      description:
        "依條件列出 issue，每筆一行：編號｜[追蹤標籤] 狀態｜優先權｜標題｜指派｜到期｜專案。" +
        "assignee / author 可填「me」代表目前使用者；用名字指定人時需同時提供 project。",
      inputSchema: {
        project: ref.optional().describe("專案名稱、識別碼或 id"),
        assignee: ref.optional().describe("指派對象：me、成員名字或 id"),
        author: ref.optional().describe("建立者：me、成員名字或 id"),
        status: ref.default("open").describe("open（未結束，預設）、closed、all，或狀態名稱/id"),
        tracker: ref.optional().describe("追蹤標籤名稱或 id"),
        keyword: z.string().optional().describe("標題包含的文字"),
        due_before: date.optional().describe("到期日在這天（含）之前"),
        updated_since: date.optional().describe("這天（含）之後有更新"),
        sort: z.string().default("updated_on:desc").describe("排序，例如 updated_on:desc、due_date、priority:desc"),
        limit: z.number().int().min(1).max(100).default(25),
        offset: z.number().int().min(0).default(0),
      },
      annotations: READ,
    },
    handle(async (a) => {
      const project = a.project !== undefined ? await lookup.resolveProject(a.project) : undefined;
      const status = String(a.status).trim().toLowerCase();
      const params: Params = {
        project_id: project?.id,
        status_id: status === "open" ? "open" : status === "closed" ? "closed" : status === "all" ? "*" : await lookup.resolveStatus(a.status),
        tracker_id: a.tracker !== undefined ? await lookup.resolveTracker(a.tracker, project?.id) : undefined,
        assigned_to_id: a.assignee === undefined ? undefined : lookup.isMe(a.assignee) ? "me" : await lookup.resolveUser(a.assignee, project?.id),
        author_id: a.author === undefined ? undefined : lookup.isMe(a.author) ? "me" : await lookup.resolveUser(a.author, project?.id),
        subject: a.keyword ? `~${a.keyword}` : undefined,
        due_date: a.due_before ? `<=${a.due_before}` : undefined,
        updated_on: a.updated_since ? `>=${a.updated_since}` : undefined,
        sort: a.sort,
        limit: a.limit,
        offset: a.offset,
      };
      const res = await get<{ issues: Issue[]; total_count: number }>("issues.json", params);
      if (!res.issues.length) return "沒有符合條件的 issue";
      const range = `顯示第 ${a.offset + 1}–${a.offset + res.issues.length} 筆`;
      const more = a.offset + res.issues.length < res.total_count ? `，還有更多可用 offset=${a.offset + res.issues.length} 繼續` : "";
      return fenced(`共 ${res.total_count} 筆，${range}${more}\n${res.issues.map(issueLine).join("\n")}`);
    }),
  );

  server.registerTool(
    "get_issue",
    {
      title: "查看 issue 詳細內容",
      description: "取得單一 issue 的完整資訊：欄位、描述、自訂欄位、子任務、關聯、附件（含附件 id）、追蹤者與歷程備註。",
      inputSchema: {
        issue_id: z.number().int(),
        include_history: z.boolean().default(true).describe("是否包含歷程與備註"),
      },
      annotations: READ,
    },
    handle(async ({ issue_id, include_history }) => {
      const include = ["children", "relations", "attachments", "watchers", ...(include_history ? ["journals"] : [])].join(",");
      const { issue } = await get<{ issue: Issue }>(`issues/${issue_id}.json`, { include });
      return fenced(issueDetail(issue));
    }),
  );

  server.registerTool(
    "list_projects",
    {
      title: "列出專案",
      description: "列出你有權限的專案：識別碼｜名稱｜上層專案｜id。",
      inputSchema: { keyword: z.string().optional().describe("名稱或識別碼包含的文字") },
      annotations: READ,
    },
    handle(async ({ keyword }) => {
      const all = await lookup.projects();
      const k = keyword?.trim().toLowerCase();
      const list = k ? all.filter((p) => p.name.toLowerCase().includes(k) || p.identifier.toLowerCase().includes(k)) : all;
      if (!list.length) return "沒有符合的專案";
      return fenced(
        `共 ${list.length} 個專案\n` +
          list.map((p) => [p.identifier, p.name, p.parent ? `上層：${p.parent.name}` : "", `id ${p.id}`].filter(Boolean).join("｜")).join("\n"),
      );
    }),
  );

  server.registerTool(
    "get_project_options",
    {
      title: "查看專案的可選值",
      description:
        "列出專案可用的追蹤標籤、狀態、優先權、成員（可指派對象）、版本、分類、自訂欄位與工時活動。" +
        "建立或修改 issue 前不確定有哪些選項時先查這裡。",
      inputSchema: { project: ref.describe("專案名稱、識別碼或 id") },
      annotations: READ,
    },
    handle(async ({ project }) => {
      const p = await lookup.resolveProject(project);
      const soft = <T>(promise: Promise<T>) => promise.catch(() => null);
      const [detail, statuses, priorities, members, versions] = await Promise.all([
        lookup.projectDetail(p.id),
        lookup.statuses(),
        lookup.priorities(),
        soft(lookup.members(p.id)),
        soft(lookup.versions(p.id)),
      ]);
      const names = (list?: { id: number; name: string }[] | null) =>
        list === null ? "（無法取得，可能沒有權限）" : list?.length ? list.map((x) => `${x.name}（${x.id}）`).join("、") : "（無）";
      const lines = [
        `專案：${detail.name}（識別碼 ${detail.identifier}，id ${detail.id}）`,
        `追蹤標籤：${names(detail.trackers)}`,
        `狀態（實際能改成哪些依工作流程而定）：${names(statuses)}`,
        `優先權：${names(priorities)}`,
        `成員：${members === null ? names(null) : members.map((m) => `${m.name}（${m.id}，${m.roles.join("/")}）`).join("、") || "（無）"}`,
        `版本：${versions === null ? names(null) : versions.filter((v) => v.status !== "closed").map((v) => `${v.name}（${v.id}${v.due_date ? `，${v.due_date}` : ""}）`).join("、") || "（無）"}`,
        `分類：${names(detail.issue_categories)}`,
        `工時活動：${names(await lookup.activities(p.id))}`,
        `自訂欄位：${detail.issue_custom_fields === undefined ? "（這個 Redmine 版本不提供，可直接用自訂欄位 id）" : names(detail.issue_custom_fields)}`,
        `啟用模組：${detail.enabled_modules?.map((m) => m.name).join("、") ?? "（未知）"}`,
      ];
      return fenced(lines.join("\n"));
    }),
  );

  server.registerTool(
    "list_time_entries",
    {
      title: "查詢工時",
      description: "列出工時紀錄並加總時數：日期｜時數｜人｜活動｜issue 或專案｜說明｜工時 id。user 可填「me」。",
      inputSchema: {
        user: ref.optional().describe("me、成員名字或 id"),
        project: ref.optional(),
        issue_id: z.number().int().optional(),
        from: date.optional(),
        to: date.optional(),
        limit: z.number().int().min(1).max(500).default(100),
      },
      annotations: READ,
    },
    handle(async (a) => {
      const project = a.project !== undefined ? await lookup.resolveProject(a.project) : undefined;
      const params: Params = {
        project_id: project?.id,
        issue_id: a.issue_id,
        user_id: a.user === undefined ? undefined : lookup.isMe(a.user) ? "me" : await lookup.resolveUser(a.user, project?.id),
        from: a.from,
        to: a.to,
      };
      const entries = await getAll<TimeEntry>("time_entries.json", "time_entries", params, a.limit);
      if (!entries.length) return "沒有符合條件的工時紀錄";
      const total = entries.reduce((sum, t) => sum + t.hours, 0);
      return fenced(`${entries.length} 筆，合計 ${Math.round(total * 100) / 100} 小時\n${entries.map(timeEntryLine).join("\n")}`);
    }),
  );
}
