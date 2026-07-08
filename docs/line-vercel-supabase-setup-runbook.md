# Next.js + Supabase + Vercel + LINE Bot Webhook 首次設定 Runbook

本文件是給學生專案重複使用的設定清單。目標是把學生端網頁部署到 Vercel，資料寫入 Supabase，並讓教練可以透過 LINE Bot 管理學生資料。

請勿在本文件、截圖、GitHub issue、聊天室或教學投影片中貼上任何真實密鑰、token、email、LINE userId、Supabase project ref 或個人資料。需要示範時一律使用占位符，例如 `<VERCEL_URL>`、`<SUPABASE_URL>`、`<LINE_CHANNEL_SECRET>`、`<LINE_CHANNEL_ACCESS_TOKEN>`、`<ADMIN_LINE_USER_ID>`、`<SHARE_TOKEN>`。

## 適用情境

- 學生有一個公開但不需登入的學生端網頁，例如 `https://<VERCEL_URL>/s/<SHARE_TOKEN>`。
- 教練或管理者用 LINE Official Account 傳訊息給 Bot。
- LINE Bot webhook 收到訊息後，由 Next.js API route 處理。
- 後端使用 Supabase service role key 寫入或讀取管理資料。
- 網站部署在 Vercel，環境變數由 Vercel 管理。

不適用情境：

- 已經有完整會員登入系統的產品。
- LINE Login 或 LIFF app 設定。
- 多租戶正式營運平台的權限設計。

## 前置條件

開始前先確認以下項目都已存在：

- GitHub repo 已建立，且 Vercel project 已連到這個 repo。
- Supabase project 已建立。
- Supabase schema 已建立，必要資料表與 seed data 已可查詢。
- Vercel project 可以成功 deploy。
- LINE Official Account 已建立。
- LINE Developers 裡已建立 Messaging API channel。
- 你有權限進入：
  - GitHub repo
  - Supabase dashboard
  - Vercel project dashboard
  - LINE Official Account Manager
  - LINE Developers Console

## 需要準備的占位資料

把以下資料先整理在自己的私密筆記，不要 commit 到 repo：

```txt
<VERCEL_URL>
<SUPABASE_URL>
<SUPABASE_SERVICE_ROLE_KEY>
<ADMIN_PASSCODE>
<LINE_CHANNEL_SECRET>
<LINE_CHANNEL_ACCESS_TOKEN>
<ADMIN_LINE_USER_ID>
<SHARE_TOKEN>
```

如果還不知道 `<ADMIN_LINE_USER_ID>`，先留空，後面會用暫時 debug 流程取得。

## Step 1：確認 Supabase Schema

1. 打開 Supabase dashboard。
2. 進入目標 project。
3. 打開 SQL Editor。
4. 確認專案需要的 schema 已經執行過。
5. 到 Table Editor 檢查學生資料、方案資料、領取紀錄、pending 領取紀錄等表格是否存在。
6. 確認目標學生有一組可用的 `<SHARE_TOKEN>`。

完成狀態：

- Supabase 有可用資料。
- 學生端路由可以用 `<SHARE_TOKEN>` 找到資料。
- 沒有把 service role key 貼到 repo 或公開文件。

## Step 2：設定 Vercel 環境變數

1. 打開 Vercel dashboard。
2. 進入目標 project。
3. 進入 Settings。
4. 點 Environment Variables。
5. 新增或確認以下變數。

| 變數 | 建議值 | 說明 |
|---|---|---|
| `SUPABASE_URL` | `<SUPABASE_URL>` | Supabase project URL。 |
| `SUPABASE_SERVICE_ROLE_KEY` | `<SUPABASE_SERVICE_ROLE_KEY>` | 後端專用 key，只能放在 Vercel server env，不能公開。 |
| `ADMIN_PASSCODE` | `<ADMIN_PASSCODE>` | 管理端表單用密碼。 |
| `LINE_CHANNEL_SECRET` | `<LINE_CHANNEL_SECRET>` | LINE webhook signature 驗證用。 |
| `LINE_CHANNEL_ACCESS_TOKEN` | `<LINE_CHANNEL_ACCESS_TOKEN>` | LINE reply API 發訊息用。 |
| `LINE_SIGNATURE_REQUIRED` | `true` | 正式環境必須驗證 LINE signature。 |
| `LINE_REPLY_DRY_RUN` | `true` 或 `false` | 首次設定先用 `true`，正式回覆測試再改 `false`。 |
| `LINE_ADMIN_USER_IDS` | `<ADMIN_LINE_USER_ID>` | 允許操作 Bot 的 LINE userId，多個值用逗號分隔。 |
| `LINE_DEBUG_LOG_USER_IDS` | `true` 或 `false` | 只在抓 userId 時短暫打開，完成後關掉。 |

建議首次設定順序：

1. 先把 `LINE_REPLY_DRY_RUN=true`。
2. 如果還不知道管理者 userId，先暫時設定 `LINE_DEBUG_LOG_USER_IDS=true`。
3. 等抓到 `<ADMIN_LINE_USER_ID>` 並填入 `LINE_ADMIN_USER_IDS` 後，把 `LINE_DEBUG_LOG_USER_IDS=false`。
4. 最後正式測試時再把 `LINE_REPLY_DRY_RUN=false`。

完成狀態：

- Vercel Production 環境有完整變數。
- 沒有把任何真實值貼到 README、runbook、截圖或 commit。
- 修改環境變數後有重新部署，或已觸發 Redeploy。

## Step 3：部署並檢查學生端

1. 在 Vercel project 的 Deployments 頁面確認最新 deployment 成功。
2. 打開學生端網址：

```txt
https://<VERCEL_URL>/s/<SHARE_TOKEN>
```

3. 確認頁面能正常打開。
4. 檢查頁面是否顯示正確學生資料、方案資料或紀錄。

完成狀態：

- `/s/<SHARE_TOKEN>` 能開。
- 沒有出現 500 error。
- 頁面沒有把管理密碼、service role key、LINE token 顯示出來。

如果學生端打不開，先不要設定 LINE webhook。先修好 Supabase env、schema、部署狀態或 share token。

## Step 4：設定 LINE Webhook URL

1. 打開 LINE Developers Console。
2. 進入目標 Provider。
3. 進入 Messaging API channel。
4. 找到 Messaging API 設定頁。
5. 在 Webhook URL 填入：

```txt
https://<VERCEL_URL>/api/line/webhook
```

6. 開啟 Use webhook。
7. 點 Verify。

完成狀態：

- Webhook URL 顯示已設定。
- Use webhook 已啟用。
- Verify 成功。

注意：Verify 只代表 LINE 可以打到 webhook endpoint，不代表 Bot 已經能正式回覆訊息。

## Step 5：為什麼先用 Dry Run

首次設定建議先設：

```txt
LINE_REPLY_DRY_RUN=true
```

原因：

- 可以先確認 LINE webhook 有打進 Vercel。
- 可以先確認訊息解析、管理者 allowlist、Supabase 寫入是否正常。
- 避免 Bot 在權限或文字格式還沒確認前，對使用者送出錯誤訊息。
- 如果 channel access token 設錯，dry run 階段也不會因 reply API 失敗而干擾前半段測試。

Dry run 的預期狀態：

- Vercel Runtime Logs 看得到 webhook 被呼叫。
- API response 裡或 log 裡可看到 reply payload 準備好了。
- LINE 聊天室不一定會收到 Bot 回覆。

## Step 6：為什麼要先抓 LINE_ADMIN_USER_IDS

正式 webhook 會用 LINE event 裡的 `event.source.userId` 判斷誰可以操作 Bot。

必須先把管理者 userId 放進：

```txt
LINE_ADMIN_USER_IDS=<ADMIN_LINE_USER_ID>
```

原因：

- 避免任何加好友的人都能查學生資料或新增紀錄。
- 避免測試訊息被誤認為正式教練操作。
- 後續 pending、confirm、cancel 這類管理動作都需要 allowlist。

如果有多位管理者：

```txt
LINE_ADMIN_USER_IDS=<ADMIN_LINE_USER_ID_1>,<ADMIN_LINE_USER_ID_2>
```

## Step 7：暫時 Debug 抓 LINE userId

只在首次設定或新增管理者時使用。完成後一定要關掉。

1. 到 Vercel Environment Variables。
2. 設定：

```txt
LINE_DEBUG_LOG_USER_IDS=true
LINE_REPLY_DRY_RUN=true
```

3. Redeploy 最新 production deployment。
4. 用管理者的 LINE 帳號傳一則訊息給 Bot，例如：

```txt
裔甯
```

或：

```txt
<學生名稱>
```

5. 到 Vercel dashboard。
6. 進入 Project。
7. 打開 Logs 或 Runtime Logs。
8. 搜尋：

```txt
[line-webhook] received userId
```

9. 從 log 中找到 userId，記成：

```txt
<ADMIN_LINE_USER_ID>
```

10. 回到 Vercel Environment Variables，設定：

```txt
LINE_ADMIN_USER_IDS=<ADMIN_LINE_USER_ID>
LINE_DEBUG_LOG_USER_IDS=false
```

11. 再次 Redeploy。

完成狀態：

- `LINE_ADMIN_USER_IDS` 已填入管理者 userId。
- `LINE_DEBUG_LOG_USER_IDS` 已改回 `false`。
- 沒有把 userId 貼到文件、截圖、公開 issue 或聊天記錄。

## Step 8：正式回覆測試

確認以下條件都完成後，再打開正式回覆：

- LINE webhook Verify 成功。
- `/s/<SHARE_TOKEN>` 能開。
- `LINE_ADMIN_USER_IDS` 已填入。
- `LINE_DEBUG_LOG_USER_IDS=false`。
- `LINE_CHANNEL_ACCESS_TOKEN` 已設定。

到 Vercel Environment Variables 設定：

```txt
LINE_REPLY_DRY_RUN=false
LINE_SIGNATURE_REQUIRED=true
```

Redeploy 後，從管理者 LINE 帳號傳：

```txt
裔甯
```

或：

```txt
<學生名稱>
```

預期 Bot 回覆類似管理選單：

```txt
裔甯管理選單

請輸入其中一項：
課程
繳費
保健食品
學生端連結
```

再測：

```txt
學生端連結
```

預期 Bot 回覆：

```txt
https://<VERCEL_URL>/s/<SHARE_TOKEN>
```

完成狀態：

- 管理者帳號傳學生名稱，Bot 會回選單。
- 非 allowlist 帳號不能操作。
- Runtime Logs 沒有持續出現 403 或 500。

## Step 9：保健食品領取流程初測

先用管理者帳號傳：

```txt
保健食品
```

預期 Bot 回覆領取紀錄格式提示。

接著傳一筆測試資料：

```txt
7/1
B群 1組
D 1組
白賦美 1組
```

預期狀態：

- Bot 回覆確認文字。
- 系統建立 pending 領取紀錄。
- 後續可接 confirm 或 cancel 流程。

提醒：如果目前專案仍在測試階段，請確認測試資料是否有標記為 test mode，並在測試後清理。

## 常見狀況

### LINE Verify 失敗

可能原因：

- Webhook URL 打錯。
- Vercel deployment 還沒成功。
- API route 路徑不是 `/api/line/webhook`。
- `LINE_CHANNEL_SECRET` 沒設定或設定錯。
- production 環境變數改完後沒有 Redeploy。

處理順序：

1. 先打開 `https://<VERCEL_URL>/s/<SHARE_TOKEN>` 確認 Vercel 網站活著。
2. 檢查 webhook URL 是否是 `https://<VERCEL_URL>/api/line/webhook`。
3. 檢查 Vercel Runtime Logs 是否有收到 Verify request。
4. 確認 `LINE_SIGNATURE_REQUIRED=true` 時，`LINE_CHANNEL_SECRET` 是同一個 Messaging API channel 的值。
5. Redeploy 後再 Verify。

### Webhook POST 403

可能原因：

- `LINE_ADMIN_USER_IDS` 沒填。
- userId 填錯。
- 傳訊息的人不是 allowlist 管理者。
- `LINE_DEBUG_LOG_USER_IDS` 抓到的是另一個 LINE 帳號。

處理順序：

1. 暫時打開 `LINE_DEBUG_LOG_USER_IDS=true`。
2. 用同一個管理者 LINE 帳號傳訊息。
3. 到 Runtime Logs 重新抓 userId。
4. 把正確值填入 `LINE_ADMIN_USER_IDS`。
5. 關掉 `LINE_DEBUG_LOG_USER_IDS=false`。
6. Redeploy。

### Webhook POST 500

可能原因：

- `SUPABASE_URL` 或 `SUPABASE_SERVICE_ROLE_KEY` 錯誤。
- Supabase schema 尚未建立或缺表。
- `LINE_CHANNEL_ACCESS_TOKEN` 錯誤，且 `LINE_REPLY_DRY_RUN=false`。
- 程式嘗試建立 pending 紀錄時資料庫回錯。

處理順序：

1. 看 Vercel Runtime Logs 的錯誤訊息。
2. 如果錯在 Supabase，先檢查 env 與 schema。
3. 如果錯在 LINE reply API，先改回 `LINE_REPLY_DRY_RUN=true` 分離問題。
4. 確認資料庫寫入正常後，再改回 `LINE_REPLY_DRY_RUN=false`。

### Bot 回「第一行需要日期」

可能原因：

- 你傳的是領取紀錄格式，但第一行不是日期。
- 你本來想叫選單，但輸入的字沒有命中選單關鍵字。

處理方式：

- 要叫選單，傳：

```txt
裔甯
```

或：

```txt
<學生名稱>
```

- 要新增領取紀錄，第一行要是日期，例如：

```txt
7/1
B群 1組
```

### 沒有看到 webhook log

可能原因：

- LINE Official Account 沒有啟用 Use webhook。
- 訊息傳到錯的 LINE Official Account。
- Webhook URL 還是舊 deployment 或錯誤 project。
- Vercel Logs 看錯環境，例如看 Preview 但 LINE 打到 Production。
- 使用者沒有真的加好友或沒有傳文字訊息。

處理順序：

1. 確認 LINE Developers 的 Use webhook 已開。
2. 確認 Messaging API channel 對應正確的 Official Account。
3. 確認 webhook URL 是 production 的 `<VERCEL_URL>`。
4. 到 Vercel Project 的 Production Runtime Logs 查看。
5. 傳一則簡單文字，例如 `裔甯`。

## 截圖保留與打碼規則

可以保留的截圖：

- Vercel deployment 成功畫面，但網址若可識別客戶或學生，請打碼。
- LINE Developers 的 Use webhook 已啟用狀態，但 channel ID、channel secret、access token 要打碼。
- Supabase Table Editor 的表格結構畫面，但資料列若有姓名、email、電話、LINE userId、project ref 要打碼。
- 學生端頁面 UI 截圖，但學生姓名、share token、個人紀錄、付款資料要視教學目的打碼。
- Bot 回覆選單截圖，但聊天室名稱、頭像、LINE userId、學生真名可識別資訊要打碼。

一定要打碼或不要保留的截圖：

- `SUPABASE_SERVICE_ROLE_KEY`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `ADMIN_PASSCODE`
- `LINE_ADMIN_USER_IDS`
- Vercel Environment Variables 的完整值
- Supabase project ref、database password、JWT secret
- LINE 使用者 profile、userId、聊天室列表
- 任何學生健康、課程、繳費、領取紀錄的真實資料

建議打碼方式：

- 完整遮住值，不要只遮中間幾碼。
- 截圖檔名也不要放學生姓名、email、userId 或 project ref。
- 對外教學只用 `<PLACEHOLDER>` 標註，不用真實截圖值。

## 安全注意事項

- `SUPABASE_SERVICE_ROLE_KEY` 只能放在 server-side environment，不能放到前端公開變數。
- 不要建立 `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` 這類變數。
- `LINE_CHANNEL_ACCESS_TOKEN` 可以代表 Bot 發訊息，不能公開。
- `LINE_CHANNEL_SECRET` 用來驗證 webhook signature，不能公開。
- `ADMIN_PASSCODE` 不要用容易猜的字串。
- `LINE_DEBUG_LOG_USER_IDS=true` 只能短暫使用，抓完 userId 立刻關掉。
- Vercel env 改完要 Redeploy，否則 production 可能仍使用舊值。
- 如果任何密鑰曾經曝光，請到原平台 rotate 或重新發行，不要只從文件刪掉。

## 後續功能清單

後續可以依序補強：

- 學生選單：輸入學生名稱後回主選單。
- 保健食品領取 pending：Bot 解析領取文字後先建立待確認紀錄。
- 保健食品領取 confirm：教練確認後才寫入正式領取紀錄。
- 保健食品領取 cancel：教練取消 pending，不寫入正式紀錄。
- 課程：新增預約、完成課程、取消課程、查剩餘堂數。
- 繳費：登記已繳、改回未繳、查付款狀態。
- 多學生支援：由學生名稱或代號切換 `<SHARE_TOKEN>`。
- 管理者權限分級：不同教練只能操作自己的學生。

## 最小驗收清單

交接或教學時，請逐項打勾：

- [ ] GitHub repo 已連到 Vercel project。
- [ ] Supabase schema 已建立。
- [ ] Vercel env 已設定完成。
- [ ] `LINE_SIGNATURE_REQUIRED=true`。
- [ ] 首次測試時 `LINE_REPLY_DRY_RUN=true`。
- [ ] `/s/<SHARE_TOKEN>` 能開。
- [ ] LINE Webhook URL 是 `https://<VERCEL_URL>/api/line/webhook`。
- [ ] Use webhook 已啟用。
- [ ] Verify 成功。
- [ ] 已用 debug 流程抓到 `<ADMIN_LINE_USER_ID>`。
- [ ] `LINE_ADMIN_USER_IDS` 已填入。
- [ ] `LINE_DEBUG_LOG_USER_IDS=false`。
- [ ] 正式測試時 `LINE_REPLY_DRY_RUN=false`。
- [ ] 管理者傳 `裔甯` 或 `<學生名稱>`，Bot 回選單。
- [ ] 截圖已打碼。
- [ ] 沒有任何真實密鑰、token、userId 或個資被寫進 repo。
