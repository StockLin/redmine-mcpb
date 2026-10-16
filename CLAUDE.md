# redmine-mcpb

Redmine MCP server，打包成 Claude Desktop 擴充功能（`.mcpb`），給非工程師也能安裝。公開 repo：<https://github.com/StockLin/redmine-mcpb>。使用者只有 Claude Desktop，不會另外裝 Node 或 Python。

## 結構

- `src/index.ts`：進入點與 instructions（含 `redmine_request` 常用路徑說明）
- `src/tools/`：read（查詢）、write（建立/修改/批次/工時）、remove（刪除）、attachments、generic（萬用與 confirm_action）
- `src/lookup.ts`：名稱轉 id，一律即時向 Redmine 查詢，**不可寫死任何狀態、追蹤標籤、成員名稱**
- `src/confirm.ts`：確認機制（elicitation，不支援時改用一次性 token）
- `manifest.json`：擴充功能資訊、安裝表單，也是**版本號的唯一來源**（打包時注入程式的 `__VERSION__`）
- `scripts/build.mjs`：esbuild 打包成單一 `server/index.mjs`，`.mcpb` 不含 `node_modules`
- `.mcpbignore`：打包排除清單，新增不該進 `.mcpb` 的檔案時要更新

## 發版

使用者說「發版」「出新版」「release」時：

1. 確認要發佈的改動都已 commit
2. 依改動決定版本號（目前版本看 `manifest.json`）：
   - 修 bug、改文字、調整說明 → patch：`1.0.1 → 1.0.2`
   - 新增工具、新增設定欄位、行為改變但相容 → minor：`1.0.x → 1.1.0`
   - 工具改名或移除、設定欄位改名（使用者要重新設定）→ major：`1.x.x → 2.0.0`
3. 先跑 `npm run release <版本> -- --dry-run`，通過後再跑 `npm run release <版本>`
4. 腳本會 commit、打 tag、push；GitHub Actions 打包並發布到 Releases
5. 用 `gh run watch` 確認 Actions 成功，再用 `gh release view v<版本>` 確認有 `redmine.mcpb`
6. 告訴使用者固定下載網址：`https://github.com/StockLin/redmine-mcpb/releases/latest/download/redmine.mcpb`

不要手動改版本號、手動打 tag，一律走 `npm run release`。只動到 `src/`、`manifest.json` 才需要發版；只改 README、INSTALL.md、CLAUDE.md 不用。

改到工具行為或 manifest 的版本，發版前請使用者在 Claude Desktop 實際裝一次測試（雙擊 `redmine.mcpb`）。

## 確認規則與安全

刪除、搬移 issue 到其他專案、變更追蹤標籤、專案層級設定（專案、成員、版本、分類）、批次修改 5 張以上，必須經過 `guarded()`。
新增會造成上述影響的工具或路徑時，一定要接上確認機制；`redmine_request` 的判斷在 `src/tools/generic.ts` 的 `needsConfirm()`。
工具名稱改名或移除算不相容變更（major 版本）。

- `needsConfirm()` 一律以 `apiUrl()` 產生的**最終網址**判斷：用 `routeOf()` 取得正規化、解碼、去掉 `.json`/`.xml` 後的路徑，並同時檢查**查詢參數的 key**（如 `issue[project_id]`、`project[...]`）與 **body**。不可再對使用者給的原始 `path` 字串做比對，否則 `./`、`../`、`%2e`、`.xml`、query 參數都能繞過。
- `apiUrl()` 必須維持**同一來源限制**：最終網址的 origin 要等於設定的 Redmine 網址，且 pathname 在其路徑底下；含反斜線的路徑直接拒絕。所有送出 API 金鑰的請求都要經過 `apiUrl()`，不可另外用 `new URL()` 或 `fetch` 組網址。
- 原則：只有「送往其他主機」直接拒絕，其他高影響操作改成要求確認，不要用封鎖造成正常操作失敗（例如不要禁止含 `:` 的路徑或非 GET 的 query 參數）。
- 回傳給 Claude 的內容必須經過 `rawRequest()` 的 `api_key` 移除。
- 修改以上任何邏輯時，`scripts/test.mjs` 的「安全：」測試必須維持通過，並為新的繞過手法補測試。

## 測試

- `npm run typecheck`、`npm run pack`
- 跟真的 Redmine 測試時只做讀取（GET），寫入請使用者用測試 issue 自己試
- 寫入、刪除與確認機制用 `npm test`（`scripts/test.mjs` 內建假 Redmine，不會碰到真的資料）
- `/users/current.json` 回應含 API 金鑰，不要印出來；要測連線改用 `/projects.json?limit=1`

## 注意

- 不要 commit `redmine.mcpb`、`server/`（已在 `.gitignore`）
- 程式和文件裡不放任何 API 金鑰
- push 用 SSH remote `git@github.com-personal:StockLin/redmine-mcpb.git`（`~/.ssh/config` 的個人帳號別名）。`gh` 預設登入的是另一個帳號，對這個 repo 操作時要加 `-R StockLin/redmine-mcpb`
- 公開 repo：不要放任何特定公司或個人的 Redmine 網址、內部連結、帳號資訊
- Commit message：`<type>: <中文描述>`，type 用 feat / fix / refactor / docs / chore
