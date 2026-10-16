# 在 Claude Desktop 安裝 Redmine 擴充功能

**中文** | [English](INSTALL.en.md)

裝好之後，可以直接跟 Claude 說「列出指派給我的 issue」、「幫 #1234 加一則備註」、「記 2 小時工時到 #1234」。

全程約 2 分鐘，不需要安裝任何其他軟體。

## 0. 確認 Redmine 有開啟 REST API

由 Redmine 管理員到 **管理 → 設定 → API**，勾選 **啟用 REST 網路服務**。大部分 Redmine 已經開啟，不確定的話問一下管理員。

## 1. 複製你的 Redmine API 金鑰

登入你的 Redmine，點右上角 **我的帳號** → 右側 **API 存取金鑰** → **顯示**，複製那一串英數字。

（也可以直接打開 `你的 Redmine 網址/my/api_key`，例如 `https://redmine.example.com/my/api_key`）

> 這把金鑰等於你的 Redmine 身分，請不要貼給別人或貼到聊天群組。

## 2. 下載擴充功能

下載最新版的 `redmine.mcpb`：

**<https://github.com/StockLin/redmine-mcpb/releases/latest/download/redmine.mcpb>**

（也可以到 [Releases](https://github.com/StockLin/redmine-mcpb/releases) 頁面看各版本的更新內容）

## 3. 安裝

1. 打開 Claude Desktop
2. 把剛下載的 `redmine.mcpb` 交給 Claude Desktop：
   - **Mac**：直接**雙擊** `redmine.mcpb`
   - **Windows**：**不要雙擊**（Windows 會跳出「要用哪個應用程式開啟」，不用理它，按取消即可）。改成在 Claude Desktop 打開 **設定（Settings）** → **擴充功能（Extensions）**，再把 `redmine.mcpb` 從檔案總管**拖進**這個視窗
   - Mac 雙擊沒反應時，也可以用 Windows 的拖曳方式
3. 按 **Install**（安裝）
   - 畫面上會出現紅色警告，說擴充功能可以存取你的電腦。所有不是來自 Anthropic 官方目錄的擴充功能都會顯示，這是正常的
4. 按 **Configure**（設定），填入：
   - **Redmine 網址 / URL**：你的 Redmine 網址，例如 `https://redmine.example.com`
   - **Redmine API 金鑰 / API key**：第 1 步複製的金鑰
5. 按 **儲存**，確認開關顯示 **Enabled**（已啟用）

## 4. 測試

開一個新對話，輸入：

> 列出 Redmine 上指派給我的 issue

看到你的 issue 清單就完成了。Claude 第一次使用 Redmine 工具時會詢問是否允許，選 **允許**。

## 常見問題

**Q：出現 401 或「Unauthorized」**
金鑰貼錯或多貼了空白。到 設定 → 擴充功能 → Redmine → Configure，重新貼一次。

**Q：出現「被導向…」或「Redmine API 可能被登入頁擋住」**
你的 Redmine 前面有額外的登入頁（例如公司的 SSO），API 請求被擋下了。請管理員讓 API 路徑可以直接用 API 金鑰存取。

**Q：Claude 刪除東西前停下來要我確認**
這是刻意設計的。刪除、把 issue 搬到其他專案、變更追蹤標籤、專案設定，以及一次修改 5 張以上 issue，都會等你確認。看過 Claude 列出的預覽內容後，再回答要不要執行。

**Q：想讓 Claude 上傳或下載附件**
到 設定 → 擴充功能 → Redmine → Configure，在「允許存取附件的資料夾」選一個資料夾（例如「下載項目」）。Claude 只能動到你選的資料夾。

**Q：怎麼更新到新版？**
重新下載 `redmine.mcpb`，再安裝一次即可，設定會保留。

**Q：Claude 能做我在 Redmine 沒權限的事嗎？**
不能。它用的是你的金鑰，權限跟你登入 Redmine 完全一樣。
