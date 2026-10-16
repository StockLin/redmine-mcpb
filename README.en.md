# redmine-mcpb

[中文](README.md) | **English**

A Redmine MCP server packaged as a Claude Desktop extension (`.mcpb`), so anyone, not just engineers, can install it by double-clicking a file and entering their Redmine URL and API key.

Installation guide: [INSTALL.en.md](INSTALL.en.md).

The goal is to let people do in Claude what they would otherwise do by hand in Redmine, including deletions. Deletions and other high-impact changes stop and ask the user for confirmation first.
It is written in Node because Claude Desktop ships with a built-in Node runtime, so users don't need to install anything else. The design was inspired by [mcp-redmine](https://github.com/runekaagaard/mcp-redmine).

## Tools

| Category | Tools |
|---|---|
| Read | `list_issues`, `get_issue`, `list_projects`, `get_project_options`, `list_time_entries` |
| Write | `create_issue`, `update_issue`, `bulk_update_issues`, `log_time`, `upload_attachment`, `download_attachment` |
| Delete | `delete_issue`, `delete_time_entry` |
| Generic | `redmine_request` (any API the dedicated tools don't cover), `confirm_action` |

Statuses, trackers, members, versions, custom fields and so on can be referred to by name. Names are matched against the user's own Redmine at run time; no team-specific settings are hard-coded.

## Security

The main threat considered is **prompt injection**: someone writes instructions into a Redmine issue, note or wiki page to trick Claude into using the tools for something the user didn't ask for.

**Permission ceiling**: the server uses the user's own API key, so it can do exactly what that person can do when logged in to Redmine, and nothing more.

**The API key is only ever sent to the configured Redmine** (`apiUrl` in `src/redmine.ts`)
- Every request goes only to the "Redmine URL" entered at install time (including a subpath, e.g. `https://company.com/redmine/`). Requests that point to another host, switch protocol, or escape the subpath with `../` are refused, and the key is never sent.
- The URL can only be changed in Claude Desktop's extension settings; the AI cannot change it.
- Claude Desktop stores the key encrypted, and any `api_key` field is stripped from everything returned to Claude.

**Deletions and high-impact changes require confirmation** (`src/confirm.ts`)

These operations pause until the user approves them:

- Any deletion (dedicated tools, or a DELETE through `redmine_request`)
- Moving an issue to another project, or changing its tracker
- Project-level settings (projects, memberships, versions, categories)
- `bulk_update_issues` on 5 or more issues at once

`redmine_request` decides whether confirmation is needed based on **the URL that will actually be sent** (normalized path and query parameters) plus the request body, so `./`, `../`, encoded characters, `.xml` or putting fields in query parameters cannot get around it (`needsConfirm` in `src/tools/generic.ts`).

When Claude Desktop supports MCP elicitation, the server asks the user directly in a dialog. Otherwise it returns a preview and a one-time token (valid for 5 minutes, single use), and `confirm_action` can only run after the user agrees in the chat.

**Other safeguards**
- Redmine content (subjects, descriptions, notes) is wrapped in data tags and labelled as data, not instructions.
- Attachments can only be read from or saved to the folders the user picked in the settings; with no folder selected, attachment tools are disabled.
- All of the above is covered by tests (`npm test`), including "the attacker's host never receives a request" and "normal operations keep working".

## Development

```bash
npm install
npm run typecheck
npm test            # end-to-end tests against an in-memory fake Redmine
npm run pack        # build redmine.mcpb
npm run inspect     # try it in MCP Inspector (needs REDMINE_URL / REDMINE_API_KEY env vars)
```

| Path | Purpose |
|---|---|
| `src/index.ts` | Entry point and the instructions given to Claude |
| `src/tools/` | The tools, grouped by kind |
| `src/lookup.ts` | Name-to-id lookup (queries Redmine live, cached for 10 minutes) |
| `src/confirm.ts` | Confirmation mechanism |
| `src/redmine.ts` | Redmine API client |
| `manifest.json` | Extension metadata and the install-time settings form |
| `scripts/build.mjs` | Bundles the code and dependencies into a single `server/index.mjs` with esbuild, so the `.mcpb` contains no `node_modules` |
| `.mcpbignore` | Files excluded from the package |

How settings reach the server:

- `REDMINE_URL`, `REDMINE_API_KEY`: environment variables, from the install form
- Folders allowed for attachments: command-line arguments (a multi-folder setting expands into several arguments); file operations are disabled when none is set

## Releasing

Commit the changes you want to ship, then:

```bash
npm run release 1.0.2               # bump version → check → pack → commit → tag → push
npm run release 1.0.2 -- --dry-run  # checks and packing only, no commit or push
```

The script first checks that you're on `main`, have no uncommitted changes and are not behind the remote. If any step fails, it stops and restores the version number.

Once the tag is pushed, GitHub Actions builds the package and publishes it to Releases. The download URL never changes:
`https://github.com/StockLin/redmine-mcpb/releases/latest/download/redmine.mcpb`

Versioning rules and other conventions are in [CLAUDE.md](CLAUDE.md).

## License

MIT, see [LICENSE](LICENSE).
