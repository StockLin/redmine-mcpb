import { z } from "zod";
import { LookupError } from "../lookup.js";
import { RedmineError } from "../redmine.js";

// A Redmine object referenced by id or by name, e.g. 2 or "進行中".
export const ref = z.union([z.string(), z.number()]);

export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式要是 YYYY-MM-DD")
  .describe("YYYY-MM-DD");

// An expected, user-fixable problem (bad path, missing setting); shown as-is.
export class UserError extends Error {
  name = "UserError";
}

export type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

export const text = (t: string): ToolResult => ({ content: [{ type: "text", text: t }] });

// Turns expected failures into a readable message for the model instead of a protocol error.
export function handle<A>(fn: (args: A) => Promise<string>) {
  return async (args: A): Promise<ToolResult> => {
    try {
      return text(await fn(args));
    } catch (e) {
      if (e instanceof LookupError || e instanceof RedmineError || e instanceof UserError) return { ...text(`✗ ${e.message}`), isError: true };
      console.error("[redmine] unexpected error", e);
      return { ...text(`✗ 發生非預期錯誤：${e instanceof Error ? e.message : e}`), isError: true };
    }
  };
}

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const NONE = new Set(["", "none", "無", "未指派", "取消指派", "nobody"]);
export const isNone = (v: string | number) => NONE.has(String(v).trim().toLowerCase());
