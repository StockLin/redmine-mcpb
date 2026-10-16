# Redmine for Claude Desktop

**English** | [繁體中文](README.zh-TW.md)

Work with your Redmine from Claude in plain language: find issues, update their status, add notes, log time, edit the wiki. No coding or extra software needed.

### [⬇ Download redmine.mcpb](https://github.com/StockLin/redmine-mcpb/releases/latest/download/redmine.mcpb)

## Install (2 minutes)

1. **Copy your API key.** In Redmine, open **My account** → **API access key** → **Show**, and copy it.
   (Or open `https://<your-redmine>/my/api_key`.)
2. **Add the extension to Claude Desktop.**
   - **Mac:** double-click `redmine.mcpb`.
   - **Windows:** open Claude Desktop → **Settings** → **Extensions**, and drag `redmine.mcpb` into the window. If Windows asks which app to open the file with, just cancel.
3. Click **Install** → **Configure**, enter your **Redmine URL** and **API key**, then **Save**.

Try it: start a new chat and ask *"List my open Redmine issues."*

> - A red warning appears for any extension that isn't from Anthropic's directory. That's expected.
> - Getting 401? Paste the API key again. Getting "redirected" or "behind a login page"? Ask your Redmine admin to enable **Administration → Settings → API → Enable REST web service** and to let API requests through any SSO page.
> - To update, download the file again and install it the same way. Your settings are kept.

## What you can ask

- "Show my open issues in the Website project"
- "Read #123 and its notes, then change the code to do what it asks" *(needs a coding tool such as Claude Code, see below)*
- "Update the Release Notes wiki page with what we finished in #120–#125"
- "Set #123 to In Progress and add a note: started on the API part"
- "Log 2 hours on #123 for development"
- "Delete #130" *(always asks you first)*

## Safety

- **Your permissions only.** It uses your own API key, so it can't do anything you can't already do in Redmine.
- **Asks before risky changes.** Deleting, moving an issue to another project, changing its tracker, changing project settings, or editing 5 or more issues at once all wait for your OK.
- **Your key stays with your Redmine.** Requests only go to the URL you configured. Claude Desktop stores the key encrypted, and it is never shown to Claude.
- **Attachments** can only be read from or saved to folders you pick in the extension settings.

## Use with Claude Code and other MCP clients

The server is a standard MCP server, so coding tools that run local MCP servers (Claude Code, Cursor, VS Code, Windsurf…) can use it too, for example to read an issue and implement it. It needs Node.js 20.11 or later.

1. Get `server/index.mjs`: unzip `redmine.mcpb` (it's a zip file), or build it from source with `npm install && npm run build`.
2. Add it to your client:

   ```bash
   claude mcp add redmine \
     --env REDMINE_URL=https://redmine.example.com \
     --env REDMINE_API_KEY=your-key \
     -- node /path/to/server/index.mjs
   ```

   Or, in clients that use a JSON config:

   ```json
   {
     "mcpServers": {
       "redmine": {
         "command": "node",
         "args": ["/path/to/server/index.mjs"],
         "env": { "REDMINE_URL": "https://redmine.example.com", "REDMINE_API_KEY": "your-key" }
       }
     }
   }
   ```

   To allow attachments, append folder paths to `args`, e.g. `"args": ["/path/to/server/index.mjs", "/Users/me/Downloads"]`.

ChatGPT currently connects only to remote (HTTP) MCP servers, so it can't run this local server.

## For developers

```bash
npm install
npm test               # end-to-end tests against an in-memory fake Redmine
npm run pack           # build redmine.mcpb
npm run release 1.2.0  # bump the version, test, tag and push; CI publishes the release
```

| Path | Purpose |
|---|---|
| `src/tools/` | The tools: read, write, delete, attachments, and the generic `redmine_request` |
| `src/lookup.ts` | Turns names into ids by asking your Redmine live; nothing is hard-coded |
| `src/confirm.ts` | Confirmation: MCP elicitation when the client supports it, otherwise a one-time token |
| `src/redmine.ts` | API client; only talks to the configured Redmine and strips `api_key` from responses |
| `manifest.json` | Extension metadata, install form, and the single source of the version number |

Tools: `list_issues`, `get_issue`, `list_projects`, `get_project_options`, `list_time_entries`, `create_issue`, `update_issue`, `bulk_update_issues`, `log_time`, `upload_attachment`, `download_attachment`, `delete_issue`, `delete_time_entry`, `redmine_request`, `confirm_action`.

Project conventions (versioning, security rules, testing) are in [CLAUDE.md](CLAUDE.md).

## License

[MIT](LICENSE)
