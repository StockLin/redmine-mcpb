// Turns the names people use ("進行中", "Amy", "Web 專案") into Redmine ids.
// Nothing here is hard-coded: every list is fetched from the user's own Redmine,
// so it works with whatever statuses, trackers and custom fields a team set up.
import { get, getAll } from "./redmine.js";

export type Named = { id: number; name: string };
export type Project = Named & { identifier: string; parent?: Named };
export type Status = Named & { is_closed?: boolean };

export class LookupError extends Error {
  name = "LookupError";
}

const TTL = 10 * 60_000;
const cache = new Map<string, { at: number; value: Promise<unknown> }>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value as Promise<T>;
  const value = load();
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key));
  return value;
}

export function clearCache() {
  cache.clear();
}

const norm = (s: string) => s.trim().toLowerCase();

// Accepts an id, an exact name, or a name fragment that matches only one option.
export function pick<T extends Named>(label: string, input: string | number, options: T[], extraKeys: (keyof T)[] = []): T {
  const text = String(input).trim();
  const keys = ["name", ...extraKeys] as (keyof T)[];
  if (/^\d+$/.test(text)) {
    const byId = options.find((o) => o.id === Number(text));
    if (byId) return byId;
  }
  const exact = options.filter((o) => keys.some((k) => norm(String(o[k] ?? "")) === norm(text)));
  if (exact.length === 1) return exact[0];
  const partial = options.filter((o) => keys.some((k) => norm(String(o[k] ?? "")).includes(norm(text))));
  if (partial.length === 1) return partial[0];

  const candidates = (exact.length ? exact : partial.length ? partial : options).slice(0, 30);
  const list = candidates.map((o) => `${o.name}（id ${o.id}）`).join("、");
  const reason = exact.length + partial.length > 1 ? "符合多個" : "找不到";
  throw new LookupError(`${label}「${text}」${reason}。可選：${list || "（沒有可選項目）"}`);
}

// Same as pick, but a bare numeric id is accepted even when it is not in the list
// (e.g. an option the API does not expose to this user).
function pickId<T extends Named>(label: string, input: string | number, options: T[]): number {
  const text = String(input).trim();
  if (/^\d+$/.test(text) && !options.some((o) => o.id === Number(text))) return Number(text);
  return pick(label, input, options).id;
}

// --- Global lists ----------------------------------------------------------

export const currentUser = () =>
  cached("me", async () => {
    // The response also contains the API key; keep only what we need.
    const { user } = await get<{ user: { id: number; firstname: string; lastname: string; login: string } }>(
      "users/current.json",
    );
    return { id: user.id, name: `${user.lastname}${user.firstname}`.trim() || user.login, login: user.login };
  });

export const statuses = () =>
  cached("statuses", async () => (await get<{ issue_statuses: Status[] }>("issue_statuses.json")).issue_statuses);

export const trackers = () => cached("trackers", async () => (await get<{ trackers: Named[] }>("trackers.json")).trackers);

export const priorities = () =>
  cached(
    "priorities",
    async () => (await get<{ issue_priorities: Named[] }>("enumerations/issue_priorities.json")).issue_priorities,
  );

export const projects = () =>
  cached("projects", () => getAll<Project>("projects.json", "projects", { status: 1 }));

// --- Per-project lists -----------------------------------------------------

type CustomField = Named & { value?: unknown; multiple?: boolean };

export type ProjectDetail = Project & {
  description?: string;
  trackers?: Named[];
  issue_categories?: Named[];
  time_entry_activities?: Named[];
  issue_custom_fields?: CustomField[];
  enabled_modules?: { name: string }[];
};

export const projectDetail = (projectId: number) =>
  cached(`project:${projectId}`, async () => {
    const include = "trackers,issue_categories,time_entry_activities,issue_custom_fields,enabled_modules";
    return (await get<{ project: ProjectDetail }>(`projects/${projectId}.json`, { include })).project;
  });

// Users and groups that can be assigned issues in a project.
export const members = (projectId: number) =>
  cached(`members:${projectId}`, async () => {
    const list = await getAll<{ user?: Named; group?: Named; roles: Named[] }>(
      `projects/${projectId}/memberships.json`,
      "memberships",
    );
    const seen = new Map<number, Named & { roles: string[] }>();
    for (const m of list) {
      const who = m.user ?? m.group;
      if (!who) continue;
      const entry = seen.get(who.id) ?? { ...who, roles: [] };
      for (const r of m.roles) if (!entry.roles.includes(r.name)) entry.roles.push(r.name);
      seen.set(who.id, entry);
    }
    return [...seen.values()];
  });

export const versions = (projectId: number) =>
  cached(
    `versions:${projectId}`,
    async () =>
      (await get<{ versions: (Named & { status: string; due_date?: string })[] }>(`projects/${projectId}/versions.json`))
        .versions,
  );

export async function activities(projectId?: number): Promise<Named[]> {
  if (projectId) {
    const detail = await projectDetail(projectId);
    if (detail.time_entry_activities?.length) return detail.time_entry_activities;
  }
  return cached(
    "activities",
    async () =>
      (await get<{ time_entry_activities: Named[] }>("enumerations/time_entry_activities.json")).time_entry_activities,
  );
}

// --- Resolvers -------------------------------------------------------------

export async function resolveProject(input: string | number): Promise<Project> {
  return pick("專案", input, await projects(), ["identifier"]);
}

const ME = new Set(["me", "我", "自己", "myself"]);

export function isMe(input: string | number | undefined): boolean {
  return input !== undefined && ME.has(norm(String(input)));
}

// Users are looked up among project members: listing all users needs admin rights.
export async function resolveUser(input: string | number, projectId?: number): Promise<number> {
  if (isMe(input)) return (await currentUser()).id;
  if (/^\d+$/.test(String(input).trim())) return Number(input);
  if (!projectId) throw new LookupError(`要用名字指定「${input}」需要先知道專案，請一併提供專案，或直接給使用者 id`);
  return pick("成員", input, await members(projectId)).id;
}

export const resolveStatus = async (input: string | number) => pickId("狀態", input, await statuses());
export const resolveTracker = async (input: string | number, projectId?: number) =>
  pickId("追蹤標籤", input, projectId ? ((await projectDetail(projectId)).trackers ?? (await trackers())) : await trackers());
export const resolvePriority = async (input: string | number) => pickId("優先權", input, await priorities());
export const resolveCategory = async (input: string | number, projectId: number) =>
  pickId("分類", input, (await projectDetail(projectId)).issue_categories ?? []);
export const resolveVersion = async (input: string | number, projectId: number) =>
  pickId("版本", input, await versions(projectId));
export const resolveActivity = async (input: string | number, projectId?: number) =>
  pickId("工時活動", input, await activities(projectId));

export async function resolveCustomFields(
  fields: { field: string | number; value: unknown }[],
  projectId: number,
): Promise<{ id: number; value: unknown }[]> {
  const known = (await projectDetail(projectId)).issue_custom_fields ?? [];
  return fields.map(({ field, value }) => ({ id: pickId("自訂欄位", field, known), value }));
}
