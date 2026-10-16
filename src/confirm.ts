// Stops destructive or high-impact changes until the user approves them.
//
// 1. If Claude Desktop supports MCP elicitation, the server asks the user
//    directly in a dialog. The model cannot answer it on the user's behalf.
// 2. Otherwise the action is parked behind a one-time token. The model gets a
//    preview and must bring the token back via confirm_action after the user
//    agrees in chat. Tokens expire after 5 minutes and work once.
import { randomBytes } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ElicitResultSchema } from "@modelcontextprotocol/sdk/types.js";

const TOKEN_TTL = 5 * 60_000;
const ELICIT_TIMEOUT = 5 * 60_000;

type Pending = { title: string; run: () => Promise<string>; expires: number };
const pending = new Map<string, Pending>();

export type Gate = { title: string; preview: string };

function prune() {
  const now = Date.now();
  for (const [token, p] of pending) if (p.expires < now) pending.delete(token);
}

async function askUser(server: McpServer, gate: Gate): Promise<"accept" | "decline" | "unsupported"> {
  if (!server.server.getClientCapabilities()?.elicitation) return "unsupported";
  try {
    const result = await server.server.request(
      {
        method: "elicitation/create",
        params: {
          message: `⚠️ ${gate.title}\n\n${gate.preview}\n\n確定要執行嗎？此操作可能無法復原。`,
          requestedSchema: {
            type: "object",
            properties: {
              confirm: { type: "boolean", title: "我確定要執行", default: false },
            },
            required: ["confirm"],
          },
        },
      },
      ElicitResultSchema,
      { timeout: ELICIT_TIMEOUT },
    );
    return result.action === "accept" && result.content?.confirm === true ? "accept" : "decline";
  } catch (e) {
    console.error(`[redmine] elicitation failed, falling back to token: ${e}`);
    return "unsupported";
  }
}

// Runs `run` only after the user approves. Returns the text for the tool result.
export async function guarded(server: McpServer, gate: Gate, run: () => Promise<string>): Promise<string> {
  const answer = await askUser(server, gate);
  if (answer === "accept") return run();
  if (answer === "decline") return `✗ 使用者沒有同意，未執行：${gate.title}`;

  prune();
  const token = randomBytes(4).toString("hex");
  pending.set(token, { title: gate.title, run, expires: Date.now() + TOKEN_TTL });
  return [
    `⏸ 尚未執行：${gate.title}`,
    "",
    gate.preview,
    "",
    "這是需要使用者確認的操作。請先把上面的內容完整告訴使用者，並明確詢問是否執行。",
    `只有在使用者於對話中明確同意後，才能呼叫 confirm_action，token 為 ${token}（5 分鐘內有效，只能用一次）。`,
    "不可自行代替使用者確認；使用者拒絕或沒有回覆就不要呼叫。",
  ].join("\n");
}

export async function confirmAction(token: string): Promise<string> {
  prune();
  const p = pending.get(token.trim());
  if (!p) return "✗ token 無效或已過期（5 分鐘），請重新發起操作";
  pending.delete(token.trim());
  return p.run();
}
