// Thin client for the Redmine REST API.
import { REDMINE_API_KEY, REDMINE_URL } from "./config.js";

export type Params = Record<string, unknown>;

export type RawResponse = { status: number; body: unknown; error: string };

type RequestOptions = {
  method?: string;
  data?: unknown;
  params?: Params;
  content?: Uint8Array<ArrayBuffer>;
  binary?: boolean;
};

export class RedmineError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "RedmineError";
  }
}

const BASE = new URL(REDMINE_URL);

// Builds a URL on the configured Redmine. Anything that would resolve to another
// host, protocol or a path outside the Redmine base (absolute URLs, "\\host",
// "../" escapes) is refused, so the API key is only ever sent to that Redmine.
export function apiUrl(apiPath: string, params?: Params): URL {
  if (apiPath.includes("\\")) throw new RedmineError(0, "路徑不可包含反斜線");
  const url = new URL(apiPath.replace(/^\/+/, ""), BASE);
  if (url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) {
    throw new RedmineError(0, `只能連到設定的 Redmine（${BASE.origin}${BASE.pathname}），已拒絕：${apiPath}`);
  }
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    for (const v of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(v));
  }
  return url;
}

export function webUrl(apiPath: string): string {
  return new URL(apiPath.replace(/^\/+/, ""), BASE).toString();
}

// The API path of a URL relative to the Redmine base, decoded, without .json/.xml,
// e.g. "projects/web/memberships". Used to judge what a request really targets.
export function routeOf(url: URL): string {
  let rel = url.pathname.slice(BASE.pathname.length).replace(/^\/+/, "");
  try {
    rel = decodeURIComponent(rel);
  } catch {
    // keep the raw path if it is not valid percent-encoding
  }
  return rel.replace(/\.(json|xml)$/i, "");
}

// The API key must never reach the model, even if an endpoint returns it.
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([k]) => k !== "api_key").map(([k, v]) => [k, redact(v)]));
  }
  return value;
}

// Low-level call that never throws; used by the generic tool and wrapped by the helpers below.
export async function rawRequest(apiPath: string, opts: RequestOptions = {}): Promise<RawResponse> {
  let url: URL;
  try {
    url = apiUrl(apiPath, opts.params);
  } catch (e) {
    return { status: 0, body: null, error: e instanceof Error ? e.message : String(e) };
  }
  const headers: Record<string, string> = { "X-Redmine-API-Key": REDMINE_API_KEY };
  let body: BodyInit | undefined;
  if (opts.content) {
    headers["Content-Type"] = "application/octet-stream";
    body = new Blob([opts.content]);
  } else if (opts.data !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.data);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: (opts.method || "GET").toUpperCase(),
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    return { status: 0, body: null, error: `無法連線到 Redmine：${e instanceof Error ? e.message : e}` };
  }

  // A redirect almost always means an SSO / login page sits in front of the API.
  if (response.status >= 300 && response.status < 400) {
    return {
      status: response.status,
      body: null,
      error: `被導向 ${response.headers.get("location") ?? "?"}：Redmine API 可能被登入頁擋住，或網址設定錯誤`,
    };
  }

  let parsed: unknown = null;
  if (opts.binary && response.ok) {
    parsed = new Uint8Array(await response.arrayBuffer());
  } else {
    const text = await response.text();
    if (text) {
      try {
        parsed = redact(JSON.parse(text));
      } catch {
        parsed = text;
      }
    }
  }

  return { status: response.status, body: parsed, error: response.ok ? "" : describeError(response.status, parsed) };
}

function describeError(status: number, body: unknown): string {
  const errors = (body as { errors?: unknown })?.errors;
  const detail = Array.isArray(errors) ? errors.join("；") : "";
  const hint: Record<number, string> = {
    401: "API 金鑰無效，請到擴充功能設定重新貼上",
    403: "你在 Redmine 沒有這個操作的權限，或這個專案沒啟用對應模組",
    404: "找不到資源（編號錯誤、已刪除，或你沒有權限看到）",
    422: "Redmine 拒絕了這些欄位值",
  };
  return [`HTTP ${status}`, hint[status], detail].filter(Boolean).join("：");
}

async function call<T>(apiPath: string, opts: RequestOptions): Promise<T> {
  const res = await rawRequest(apiPath, opts);
  if (res.error) throw new RedmineError(res.status, res.error);
  return res.body as T;
}

export const get = <T>(apiPath: string, params?: Params) => call<T>(apiPath, { params });
export const post = <T>(apiPath: string, data: unknown, params?: Params) =>
  call<T>(apiPath, { method: "POST", data, params });
export const put = (apiPath: string, data: unknown) => call<unknown>(apiPath, { method: "PUT", data });
export const del = (apiPath: string) => call<unknown>(apiPath, { method: "DELETE" });

export async function upload(content: Uint8Array<ArrayBuffer>, filename: string): Promise<string> {
  const res = await call<{ upload: { token: string } }>("uploads.json", {
    method: "POST",
    params: { filename },
    content,
  });
  return res.upload.token;
}

export async function download(apiPath: string): Promise<Uint8Array> {
  const res = await rawRequest(apiPath, { binary: true });
  if (res.error) throw new RedmineError(res.status, res.error);
  return res.body as Uint8Array;
}

// Fetch every page of a collection endpoint (Redmine caps a page at 100).
export async function getAll<T>(apiPath: string, key: string, params: Params = {}, max = 2000): Promise<T[]> {
  const items: T[] = [];
  for (let offset = 0; items.length < max; offset += 100) {
    const page = await get<Record<string, unknown>>(apiPath, { ...params, limit: 100, offset });
    const batch = (page[key] as T[]) ?? [];
    items.push(...batch);
    const total = page.total_count as number | undefined;
    if (batch.length < 100 || (total !== undefined && items.length >= total)) break;
  }
  return items;
}
