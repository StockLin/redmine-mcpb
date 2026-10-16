# redmine-mcpb

**中文** | [English](README.en.md)

把 Redmine MCP server 打包成 Claude Desktop 擴充功能（`.mcpb`），不懂程式的人也能雙擊安裝、填入 Redmine 網址和 API 金鑰就能用。

安裝說明見 [INSTALL.md](INSTALL.md)。

目標是讓使用者在 Claude 裡完成平常在 Redmine 手動做的操作，包含刪除；刪除與重大異動會先停下來請使用者確認。
用 Node 撰寫，因為 Claude Desktop 內建 Node，使用者不必另外安裝任何東西。設計參考 [mcp-redmine](https://github.com/runekaagaard/mcp-redmine)。

## 工具

| 類別 | 工具 |
|---|---|
| 查詢 | `list_issues`、`get_issue`、`list_projects`、`get_project_options`、`list_time_entries` |
| 寫入 | `create_issue`、`update_issue`、`bulk_update_issues`、`log_time`、`upload_attachment`、`download_attachment` |
| 刪除 | `delete_issue`、`delete_time_entry` |
| 萬用 | `redmine_request`（專用工具沒涵蓋的 API）、`confirm_action` |

狀態、追蹤標籤、成員、版本、自訂欄位等都可以用名稱，執行時向 Redmine 查詢比對，不寫死任何團隊設定。

## 安全性

主要防範的情境是**提示注入**：有人在 Redmine 的 issue、備註或 wiki 裡寫入指示，誘導 Claude 用工具做使用者沒要求的事。

**權限上限**：使用者自己的 API 金鑰，能做的事和本人登入 Redmine 完全相同，不會更多。

**API 金鑰只會送到設定的 Redmine**（`src/redmine.ts` 的 `apiUrl`）
- 每個請求都只送到安裝時填的「Redmine 網址」（含子路徑，例如 `https://company.com/redmine/`）。指向其他主機、改用其他協定、或用 `../` 跳出子路徑的請求一律拒絕，金鑰不會送出。
- 網址只能在 Claude Desktop 的擴充功能設定修改，AI 無法更改。
- 金鑰由 Claude Desktop 加密儲存；所有回傳給 Claude 的內容都會移除 `api_key` 欄位。

**刪除與重大異動要使用者確認**（`src/confirm.ts`）

以下操作會先暫停，等使用者同意才執行：

- 任何刪除（專用工具或 `redmine_request` 的 DELETE）
- 搬移 issue 到其他專案、變更追蹤標籤
- 專案層級設定（專案、成員、版本、分類）
- `bulk_update_issues` 一次 5 張以上

`redmine_request` 以**實際送出的網址**（正規化後的路徑與查詢參數）加上內容判斷是否需要確認，`./`、`../`、編碼字元、`.xml` 或把欄位放在查詢參數裡都無法繞過（`src/tools/generic.ts` 的 `needsConfirm`）。

Claude Desktop 支援 MCP elicitation 時，由 server 直接跳視窗問使用者；不支援時回傳預覽與一次性 token（5 分鐘有效、只能用一次），使用者在對話中同意後才能用 `confirm_action` 執行。

**其他**
- Redmine 的內容（標題、描述、備註）回傳時用資料標籤包住，並註明其中的文字不是指令。
- 附件只能從使用者在設定中指定的資料夾讀取或存入；沒有指定時附件功能停用。
- 以上行為都有測試涵蓋（`npm test`），包含「攻擊者主機收不到任何請求」與「正常操作不受影響」兩類。

## 開發

```bash
npm install
npm run typecheck
npm test            # 用記憶體裡的假 Redmine 做端對端測試
npm run pack        # 產生 redmine.mcpb
npm run inspect     # 用 MCP Inspector 互動測試（需設定 REDMINE_URL / REDMINE_API_KEY 環境變數）
```

| 路徑 | 說明 |
|---|---|
| `src/index.ts` | 進入點與給 Claude 的使用說明（instructions） |
| `src/tools/` | 各類工具 |
| `src/lookup.ts` | 名稱轉 id（即時查詢 Redmine，快取 10 分鐘） |
| `src/confirm.ts` | 確認機制 |
| `src/redmine.ts` | Redmine API client |
| `manifest.json` | 擴充功能資訊與安裝時的設定表單 |
| `scripts/build.mjs` | 用 esbuild 把程式和依賴打包成單一 `server/index.mjs`，`.mcpb` 裡不含 `node_modules` |
| `.mcpbignore` | 打包時排除的檔案 |

設定如何傳進 server：

- `REDMINE_URL`、`REDMINE_API_KEY`：環境變數，來自安裝表單
- 允許上傳/下載的資料夾：命令列參數（多選資料夾會展開成多個參數），未設定時停用檔案操作

## 發版

先把要發佈的改動 commit 好，然後：

```bash
npm run release 1.0.2               # 改版本號 → 檢查 → 打包 → commit → tag → push
npm run release 1.0.2 -- --dry-run  # 只跑檢查和打包，不 commit、不 push
```

腳本會先確認在 `main`、沒有未 commit 的變更、沒有落後遠端，任何一步失敗都會停下並還原版本號。

推上 tag 後，GitHub Actions 會打包並發布到 Releases。固定下載網址：
`https://github.com/StockLin/redmine-mcpb/releases/latest/download/redmine.mcpb`

版本號規則與其他注意事項見 [CLAUDE.md](CLAUDE.md)。

## 授權

MIT，見 [LICENSE](LICENSE)。
