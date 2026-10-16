import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { guarded } from "../confirm.js";
import { fenced, issueLine, timeEntryLine, type Issue, type TimeEntry } from "../format.js";
import { del, get } from "../redmine.js";
import { handle } from "./util.js";

const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true };

export function registerDeleteTools(server: McpServer) {
  server.registerTool(
    "delete_issue",
    {
      title: "刪除 issue",
      description: "刪除 issue。一律需要使用者確認；確認畫面會列出一併刪除的子任務、工時與附件。刪除後無法復原。",
      inputSchema: { issue_id: z.number().int() },
      annotations: DESTRUCTIVE,
    },
    handle(async ({ issue_id }) => {
      const { issue } = await get<{ issue: Issue }>(`issues/${issue_id}.json`, { include: "children,attachments,relations" });
      const spent = issue.total_spent_hours ?? issue.spent_hours ?? 0;
      const impact = [
        issue.children?.length && `子任務 ${issue.children.length} 張也會一併刪除：${issue.children.map((c) => `#${c.id}`).join("、")}`,
        spent > 0 && `工時共 ${spent} 小時也會一併刪除`,
        issue.attachments?.length && `附件 ${issue.attachments.length} 個也會一併刪除`,
        issue.relations?.length && `${issue.relations.length} 個關聯會被移除`,
      ].filter(Boolean);
      const preview = fenced([issueLine(issue), ...(impact.length ? impact.map((x) => `- ${x}`) : ["- 沒有子任務、工時或附件"])].join("\n"));
      return guarded(server, { title: `刪除 issue #${issue_id}`, preview }, async () => {
        await del(`issues/${issue_id}.json`);
        return `✓ 已刪除 issue #${issue_id}`;
      });
    }),
  );

  server.registerTool(
    "delete_time_entry",
    {
      title: "刪除工時",
      description: "刪除一筆工時紀錄（工時 id 可從 list_time_entries 取得）。一律需要使用者確認。",
      inputSchema: { time_entry_id: z.number().int() },
      annotations: DESTRUCTIVE,
    },
    handle(async ({ time_entry_id }) => {
      const { time_entry } = await get<{ time_entry: TimeEntry }>(`time_entries/${time_entry_id}.json`);
      return guarded(server, { title: `刪除工時 ${time_entry_id}`, preview: fenced(timeEntryLine(time_entry)) }, async () => {
        await del(`time_entries/${time_entry_id}.json`);
        return `✓ 已刪除工時 ${time_entry_id}`;
      });
    }),
  );
}
