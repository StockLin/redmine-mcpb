import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ALLOWED_DIRECTORIES, expandHome } from "../config.js";
import { kb, type Attachment } from "../format.js";
import { download, get, put, upload } from "../redmine.js";
import { handle, UserError } from "./util.js";

// Attachments may only be read from / written to folders the user picked in the extension settings.
async function allowedPath(filePath: string, mustExist: boolean): Promise<string> {
  if (!ALLOWED_DIRECTORIES.length) {
    throw new UserError("附件功能未啟用：請到 Claude Desktop → 設定 → 擴充功能 → Redmine，選擇允許存取的資料夾");
  }
  const resolved = path.resolve(expandHome(filePath));
  const inside = ALLOWED_DIRECTORIES.some((dir) => {
    const rel = path.relative(dir, resolved);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  });
  if (!inside) throw new UserError(`路徑不在允許的資料夾內：${filePath}（允許：${ALLOWED_DIRECTORIES.join("、")}）`);
  const info = await stat(resolved).catch(() => null);
  if (mustExist && !info?.isFile()) throw new UserError(`找不到檔案：${resolved}`);
  if (!mustExist && info?.isDirectory()) throw new UserError(`要給完整檔名，不能是資料夾：${resolved}`);
  return resolved;
}

export function registerAttachmentTools(server: McpServer) {
  server.registerTool(
    "upload_attachment",
    {
      title: "上傳附件到 issue",
      description: "把本機檔案附加到 issue，可同時加備註。檔案必須在使用者允許的資料夾內。",
      inputSchema: {
        issue_id: z.number().int(),
        file_path: z.string().describe("檔案完整路徑"),
        description: z.string().optional().describe("附件說明"),
        notes: z.string().optional().describe("同時新增的備註"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    handle(async (a) => {
      const file = await allowedPath(a.file_path, true);
      const filename = path.basename(file);
      const token = await upload(new Uint8Array(await readFile(file)), filename);
      await put(`issues/${a.issue_id}.json`, {
        issue: { uploads: [{ token, filename, description: a.description }], ...(a.notes ? { notes: a.notes } : {}) },
      });
      return `✓ 已把 ${filename} 附加到 #${a.issue_id}`;
    }),
  );

  server.registerTool(
    "download_attachment",
    {
      title: "下載附件",
      description: "下載附件存到本機（附件 id 可從 get_issue 取得）。存檔路徑要是完整檔名，且在使用者允許的資料夾內。",
      inputSchema: {
        attachment_id: z.number().int(),
        save_path: z.string().describe("存檔的完整路徑（含檔名）"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    handle(async (a) => {
      const target = await allowedPath(a.save_path, false);
      const { attachment } = await get<{ attachment: Attachment }>(`attachments/${a.attachment_id}.json`);
      const content = await download(`attachments/download/${a.attachment_id}/${encodeURIComponent(attachment.filename)}`);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
      return `✓ 已下載 ${attachment.filename}（${kb(content.byteLength)}）到 ${target}`;
    }),
  );
}
