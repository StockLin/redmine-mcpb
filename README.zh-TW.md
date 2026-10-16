# Redmine for Claude Desktop

[English](README.md) | **繁體中文**

在 Claude 裡用一般說話的方式操作 Redmine：找單、改狀態、加備註、記工時、更新 wiki。不需要寫程式，也不用安裝其他軟體。

### [⬇ 下載 redmine.mcpb](https://github.com/StockLin/redmine-mcpb/releases/latest/download/redmine.mcpb)

## 安裝（約 2 分鐘）

1. **複製 API 金鑰**：在 Redmine 點 **我的帳號** → **API 存取金鑰** → **顯示**，複製那串文字。
   （也可以直接打開 `https://<你的-redmine>/my/api_key`）
2. **加到 Claude Desktop**
   - **Mac**：雙擊 `redmine.mcpb`。
   - **Windows**：打開 Claude Desktop → **設定（Settings）** → **擴充功能（Extensions）**，把 `redmine.mcpb` 拖進視窗。如果 Windows 問要用哪個應用程式開啟，按取消即可。
3. 按 **Install** → **Configure**，填入 **Redmine 網址** 和 **API 金鑰**，再按 **儲存**。

試試看：開一個新對話，問 *「列出我未完成的 Redmine 單」*。

> - 只要不是 Anthropic 官方目錄的擴充功能，都會顯示紅色警告，這是正常的。
> - 出現 401：重新貼一次 API 金鑰。出現「被導向」或「被登入頁擋住」：請 Redmine 管理員到 **管理 → 設定 → API** 勾選 **啟用 REST 網路服務**，並讓 API 請求可以通過 SSO 登入頁。
> - 更新：重新下載檔案，用同樣方式再裝一次，設定會保留。

## 可以這樣問

- 「列出 Website 專案裡我未完成的單」
- 「讀 #123 和它的備註，照單上的內容修改程式碼」*（需要 Claude Code 這類寫程式工具，見下方）*
- 「把 #120–#125 完成的內容更新到 Release Notes 這頁 wiki」
- 「把 #123 改成進行中，加備註：開始處理 API 部分」
- 「記 2 小時開發工時到 #123」
- 「刪除 #130」*（一定會先問你）*

## 安全性

- **只有你自己的權限**：用的是你的 API 金鑰，你在 Redmine 做不到的事，它也做不到。
- **重大變更會先問你**：刪除、把單搬到其他專案、改追蹤標籤、改專案設定、一次改 5 張以上的單，都會等你同意。
- **金鑰只送到你的 Redmine**：請求只會送到你設定的網址；金鑰由 Claude Desktop 加密保存，也不會顯示給 Claude。
- **附件**：只能從你在設定裡選的資料夾讀取或存入。

## 搭配 Claude Code 等其他 MCP 工具

這是標準的 MCP server，所以能執行本機 MCP server 的寫程式工具（Claude Code、Cursor、VS Code、Windsurf…）也能用，例如讀一張單後直接照著實作。需要 Node.js 20.11 以上。

1. 取得 `server/index.mjs`：把 `redmine.mcpb` 解壓縮（它其實是 zip 檔），或從原始碼執行 `npm install && npm run build`。
2. 加到你的工具：

   ```bash
   claude mcp add redmine \
     --env REDMINE_URL=https://redmine.example.com \
     --env REDMINE_API_KEY=你的金鑰 \
     -- node /path/to/server/index.mjs
   ```

   用 JSON 設定檔的工具：

   ```json
   {
     "mcpServers": {
       "redmine": {
         "command": "node",
         "args": ["/path/to/server/index.mjs"],
         "env": { "REDMINE_URL": "https://redmine.example.com", "REDMINE_API_KEY": "你的金鑰" }
       }
     }
   }
   ```

   要開放附件功能，在 `args` 後面加上資料夾路徑，例如 `"args": ["/path/to/server/index.mjs", "/Users/me/Downloads"]`。

ChatGPT 目前只能連接遠端（HTTP）的 MCP server，沒辦法使用這個本機 server。

## 開發者

```bash
npm install
npm test               # 用記憶體裡的假 Redmine 做端對端測試
npm run pack           # 產生 redmine.mcpb
npm run release 1.2.0  # 改版本號、測試、打 tag、push；CI 會發佈 Release
```

| 路徑 | 說明 |
|---|---|
| `src/tools/` | 各類工具：查詢、寫入、刪除、附件，以及萬用的 `redmine_request` |
| `src/lookup.ts` | 名稱轉 id，即時向你的 Redmine 查詢，不寫死任何設定 |
| `src/confirm.ts` | 確認機制：工具支援 MCP elicitation 時直接跳視窗詢問，否則改用一次性 token |
| `src/redmine.ts` | API client：只連到設定的 Redmine，並從回傳內容移除 `api_key` |
| `manifest.json` | 擴充功能資訊、安裝表單，也是版本號的唯一來源 |

工具：`list_issues`、`get_issue`、`list_projects`、`get_project_options`、`list_time_entries`、`create_issue`、`update_issue`、`bulk_update_issues`、`log_time`、`upload_attachment`、`download_attachment`、`delete_issue`、`delete_time_entry`、`redmine_request`、`confirm_action`。

專案慣例（版本規則、安全規則、測試）見 [CLAUDE.md](CLAUDE.md)。

## 授權

[MIT](LICENSE)
