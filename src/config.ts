import { homedir } from "node:os";
import path from "node:path";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`[redmine] missing required environment variable ${name}`);
    process.exit(1);
  }
  return value;
}

// Accept "redmine.example.com" as well as a full URL; only http(s) is allowed.
function normalizeUrl(raw: string): string {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    console.error(`[redmine] invalid REDMINE_URL: ${raw}`);
    process.exit(1);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    console.error(`[redmine] REDMINE_URL must use http or https: ${raw}`);
    process.exit(1);
  }
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "") + "/";
}

export const REDMINE_URL = normalizeUrl(requireEnv("REDMINE_URL"));
export const REDMINE_API_KEY = requireEnv("REDMINE_API_KEY");

// Bulk changes touching at least this many issues need the user's confirmation.
export const BULK_CONFIRM_THRESHOLD = 5;

export function expandHome(p: string): string {
  return p === "~" || p.startsWith("~/") ? path.join(homedir(), p.slice(1)) : p;
}

// Allowed folders for attachments arrive as CLI args: the .mcpb host expands a
// multi-value `directory` setting into separate args. Unresolved placeholders
// (setting left empty) are ignored.
export const ALLOWED_DIRECTORIES = process.argv
  .slice(2)
  .map((d) => d.trim())
  .filter((d) => d && !d.includes("${"))
  .map((d) => path.resolve(expandHome(d)));
