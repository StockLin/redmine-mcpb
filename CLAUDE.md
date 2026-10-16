# redmine-mcpb

A Redmine MCP server packaged as a Claude Desktop extension (`.mcpb`) so non-developers can install it. Users only have Claude Desktop; they won't install Node or Python. Public repo: <https://github.com/StockLin/redmine-mcpb>.

## Layout

- `src/index.ts`: entry point and the server instructions (including common `redmine_request` paths)
- `src/tools/`: `read`, `write` (create / update / bulk / time), `remove`, `attachments`, `generic` (`redmine_request`, `confirm_action`)
- `src/lookup.ts`: name → id, always looked up live from Redmine. **Never hard-code statuses, trackers or member names.**
- `src/confirm.ts`: confirmation (MCP elicitation, falling back to a one-time token)
- `manifest.json`: extension metadata, install form, and **the single source of the version** (injected as `__VERSION__` at build time)
- `scripts/build.mjs`: esbuild bundle to a single `server/index.mjs`; the `.mcpb` has no `node_modules`
- `.mcpbignore`: files excluded from the package; update it when adding files that shouldn't ship

## Releasing

When the user says "release" / "發版" / "出新版":

1. Make sure everything to ship is committed.
2. Pick the version (current one is in `manifest.json`):
   - bug fix, wording, docs inside the package → patch: `1.0.1 → 1.0.2`
   - new tool, new setting, compatible behavior change → minor: `1.0.x → 1.1.0`
   - tool renamed or removed, setting renamed (users must reconfigure) → major: `1.x.x → 2.0.0`
3. Run `npm run release <version> -- --dry-run`, then `npm run release <version>`.
4. The script bumps, tests, packs, commits, tags and pushes; GitHub Actions publishes the Release.
5. Confirm with `gh run watch -R StockLin/redmine-mcpb` and `gh release view v<version> -R StockLin/redmine-mcpb` that `redmine.mcpb` is attached.
6. Give the user the download link: `https://github.com/StockLin/redmine-mcpb/releases/latest/download/redmine.mcpb`

Never bump versions or create tags by hand; always use `npm run release`. Only changes to `src/` or `manifest.json` need a release; README / CLAUDE.md changes don't.

If a change affects tool behavior or the manifest, ask the user to install the package in Claude Desktop and try it before releasing.

## Confirmation and security rules

Deletions, moving an issue to another project, changing its tracker, project-level settings (projects, memberships, versions, categories) and bulk edits of 5+ issues must go through `guarded()`. Any new tool or path with that kind of impact must be wired into it; for `redmine_request` the decision lives in `needsConfirm()` in `src/tools/generic.ts`. Renaming or removing a tool is a breaking change (major version).

- `needsConfirm()` must judge the **final URL** built by `apiUrl()`: use `routeOf()` for the normalized, decoded path without `.json` / `.xml`, and also check **query-parameter keys** (e.g. `issue[project_id]`, `project[...]`) and the **body**. Never match on the raw `path` string, or `./`, `../`, `%2e`, `.xml` and query params can bypass it.
- `apiUrl()` must keep the **same-origin check**: the final URL's origin must equal the configured Redmine URL and its path must stay under the configured base path; paths containing a backslash are rejected. Every request that sends the API key must go through `apiUrl()`; never build URLs with `new URL()` or `fetch` elsewhere.
- Principle: only requests to another host are refused outright. Other high-impact operations ask for confirmation instead of being blocked, so normal use keeps working (e.g. don't ban `:` in paths or query params on non-GET requests).
- Everything returned to Claude must pass through `rawRequest()`, which strips `api_key`.
- When touching any of the above, the `安全：` tests in `scripts/test.mjs` must keep passing, and new bypass tricks get new tests.

## Testing

- `npm run typecheck`, `npm test`, `npm run pack`
- `npm test` runs the built server against an in-memory fake Redmine (`scripts/test.mjs`), covering writes, deletes and both confirmation paths without touching real data.
- Against a real Redmine, only make read (GET) calls; ask the user to try writes on a test issue themselves.
- `/users/current.json` includes the API key; never print it. To check connectivity use `/projects.json?limit=1`.

## Notes

- Don't commit `redmine.mcpb` or `server/` (both in `.gitignore`).
- No API keys in code or docs.
- This is a public repo: no company- or person-specific Redmine URLs, internal links or account details.
- Docs: `README.md` (English, default) and `README.zh-TW.md` (Traditional Chinese) must stay in sync.
- Push over the SSH alias `git@github.com-personal:StockLin/redmine-mcpb.git` (personal account in `~/.ssh/config`). The default `gh` login is a different account, so pass `-R StockLin/redmine-mcpb`.
- Commit messages: `<type>: <description in Traditional Chinese>`, with type one of feat / fix / refactor / docs / chore.
