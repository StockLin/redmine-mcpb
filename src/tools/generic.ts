import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import YAML from "yaml";
import { z } from "zod";
import { confirmAction, guarded } from "../confirm.js";
import { fenced } from "../format.js";
import { apiUrl, rawRequest, RedmineError, routeOf } from "../redmine.js";
import { handle } from "./util.js";

// Decides whether a raw API call is high-impact enough to need the user's confirmation.
// It judges the URL that will actually be sent (normalized path, query string) plus
// the body, so "./", "../", encoded characters, .xml or query params cannot sneak past.
export function needsConfirm(method: string, url: URL, data?: Record<string, unknown>): string | null {
  const m = method.toUpperCase();
  if (m === "GET" || m === "HEAD") return null;
  if (m === "DELETE") return "刪除";

  const route = routeOf(url);
  if (/^(memberships|versions|issue_categories|users|groups|roles|custom_fields|trackers|issue_statuses|enumerations)(\/|$)/.test(route)) {
    return "變更專案或系統設定";
  }
  if (/^projects($|\/[^/]+$|\/[^/]+\/(archive|unarchive|close|reopen|memberships|versions|issue_categories)(\/|$))/.test(route)) {
    return "變更專案設定";
  }

  // Rails merges query-string and body params, so check both.
  const keys = [...url.searchParams.keys()];
  const issue = data?.issue as Record<string, unknown> | undefined;
  if (data?.project !== undefined || keys.some((k) => k.startsWith("project["))) return "變更專案設定";
  if (/^issues\/\d+/.test(route)) {
    const moves = keys.some((k) => /^issue\[(project_id|tracker_id)\]/.test(k)) || (issue && ("project_id" in issue || "tracker_id" in issue));
    if (moves) return "搬移 issue 或變更追蹤標籤";
  }
  return null;
}

export function registerGenericTools(server: McpServer) {
  server.registerTool(
    "redmine_request",
    {
      title: "呼叫 Redmine API",
      description:
        "直接呼叫 Redmine REST API，用於專用工具沒涵蓋的操作（wiki、版本、issue 關聯、追蹤者、成員、新聞、檔案等）。" +
        "有專用工具時優先用專用工具。path 例如 /projects/web/wiki/Home.json；data 是 POST/PUT 的 JSON 內容。" +
        "刪除與專案層級的變更會先要求使用者確認。",
      inputSchema: {
        path: z.string().describe("API 路徑，以 .json 結尾，例如 /issues/123/relations.json"),
        method: z.enum(["GET", "POST", "PUT", "DELETE"]).default("GET"),
        params: z.record(z.string(), z.unknown()).optional().describe("查詢參數"),
        data: z.record(z.string(), z.unknown()).optional().describe("POST / PUT 的 JSON 內容"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    handle(async ({ path, method, params, data }) => {
      const run = async () => {
        const res = await rawRequest(path, { method, params, data });
        return fenced(YAML.stringify({ status: res.status, error: res.error || undefined, body: res.body }, { lineWidth: 0 }));
      };
      let url: URL;
      try {
        url = apiUrl(path, params);
      } catch (e) {
        if (e instanceof RedmineError) return `✗ ${e.message}`;
        throw e;
      }
      const reason = needsConfirm(method, url, data);
      if (!reason) return run();
      const body = data ? `\n內容：${JSON.stringify(data, null, 2).slice(0, 2000)}` : "";
      return guarded(server, { title: `${reason}：${method} ${path}`, preview: `${method} ${url.pathname}${url.search}${body}` }, run);
    }),
  );

  server.registerTool(
    "confirm_action",
    {
      title: "執行已確認的操作",
      description:
        "執行先前因需要確認而暫停的操作。只有在使用者於對話中明確同意後才能呼叫；不可自行代替使用者確認。",
      inputSchema: { token: z.string().describe("暫停時回傳的 token") },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    handle(async ({ token }) => confirmAction(token)),
  );
}
