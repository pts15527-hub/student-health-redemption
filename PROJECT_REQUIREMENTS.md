# 裔甯專案紀錄工具 - 產品需求與實作清單

## 產品需求說明

本專案第一版先以單一學生 / 個案使用的專案紀錄工具啟動，正式方向為 `Next.js + Supabase + Vercel + LINE Bot Webhook`。

第一階段不做完整會員登入，也不做多學生管理後台；但 LINE Bot 管理模式需保留多學生擴充能力，因為後續其他學生也會使用類似的保健食品紀錄流程。

### 使用模式

學生查看端：

- 使用 `/s/[share_token]` 查看資料。
- 只能讀取資料，不能新增、修改或刪除。
- 不顯示設定、備份、管理入口。

管理操作端：

- 正式日常管理入口改為 LINE Bot。
- 教練用 LINE 傳送固定格式指令。
- 第一層輸入學生名稱或別名，例如 `裔甯`。
- LINE Platform 將訊息 POST 到 `POST /api/line/webhook`。
- Webhook 驗證 LINE signature 與操作者身份後，寫入 Supabase。
- 可新增保健食品領取紀錄、課程紀錄、付款紀錄。
- `/admin/[share_token]` 可保留為開發備用或緊急修正入口，但不是正式管理端。

### 核心資料

- 學生資料
- 合約摘要
- 課程紀錄
- 付款紀錄
- 商品型錄
- 商品圖片
- 保健食品方案
- 兌換規則
- 領取紀錄

### 本地資料來源

本地資料用於維護商品、商品代碼表與學生方案，再同步或 seed 到 Supabase。

| 路徑 | 用途 |
|---|---|
| `public/products/` | 共用產品圖 |
| `src/data/products.ts` | 共用商品主資料 |
| `src/data/productAliases.ts` | LINE Bot 商品代碼表 |
| `src/data/students/yi-ning.ts` | 裔甯個別保健食品方案 |
| `src/data/index.ts` | 本地資料匯出入口 |
| `lib/line/redemption-parser.ts` | 保健食品 LINE 文字輸入共用解析器 |
| `scripts/test-redemption-parser.mjs` | 保健食品輸入格式與扣組數回測 |

回測指令：

```powershell
npm run validate:data
npm run test:parser
```

## 頁面清單

### 學生端

| Route | 頁面 | 功能 |
|---|---|---|
| `/s/[share_token]` | 首頁總覽 | 剩餘組數、下一堂課、學生姓名、繳費狀態入口、最近領取紀錄、課程統計 |
| `/s/[share_token]/catalog` | 保健食品型錄 | 分類瀏覽、商品卡、規格、主要功效、兌換規則提示 |
| `/s/[share_token]/sessions` | 課程與上課紀錄 | 合約摘要、課程紀錄、即將上課、上課紀錄、取消紀錄 |
| `/s/[share_token]/payments` | 繳費狀態 | 6 期付款狀態卡，已繳顯示日期，未繳顯示應繳日 |
| `/s/[share_token]/records` | 領取紀錄 | 依日期新到舊，顯示扣幾組與剩餘幾組，明細可展開 |
| `/s/[share_token]/plan` | 保健食品方案 | 22 組、剩餘組數、固定組合規則、任搭規則 |

### LINE 管理端

| 入口 | 功能 |
|---|---|
| LINE Bot | 教練用 LINE 指令新增或更新資料 |
| `POST /api/line/webhook` | 接收 LINE 訊息、驗證、解析、寫入 Supabase |

### 開發備用管理頁

| Route | 頁面 | 功能 |
|---|---|---|
| `/admin/[share_token]` | 管理首頁 | 開發測試與緊急修正用 |
| `/admin/[share_token]/records` | 領取管理 | 開發測試用新增領取紀錄 |
| `/admin/[share_token]/sessions` | 課程管理 | 開發測試用新增課程紀錄 |
| `/admin/[share_token]/payments` | 付款管理 | 開發測試用付款狀態調整 |

## 資料表清單

- `students`
- `course_contracts`
- `class_sessions`
- `billing_plans`
- `payment_records`
- `products`
- `product_variants`
- `package_plans`
- `redemption_rules`
- `redemption_rule_products`
- `redemption_bundles`
- `redemption_bundle_items`
- `redemption_records`
- `redemption_record_items`
- `redemption_record_bonus_items`

## API Routes 清單

學生端只讀：

- `GET /api/student/[share_token]/summary`

LINE Webhook：

- `POST /api/line/webhook`
- 目前已建立本機測試 skeleton：可 POST `{ "shareToken": "yi-ning", "messageText": "7/1\nB群 1組" }`，先呼叫共用保健食品 parser 回傳確認摘要與 parsed data；此版本已支援 `x-line-signature` 驗證、LINE webhook event body 解析與 reply API dry run。
- 下一階段 pending confirmation 採 10 分鐘有效期；測試 pending 需標記 `is_test = true`，可用 `npm run cleanup:test-pending` 或 `supabase/cleanup-test-pending-redemptions.sql` 刪除。
- 目前已建立測試模式確認 API：`POST /api/line/webhook/confirm`，只接受 `testMode=true` 且 `pending.is_test=true` 的 pending；測試正式紀錄以 `[TEST] LINE pending confirmation` 標記，可用 `npm run cleanup:test-redemptions` 或 `supabase/cleanup-test-redemptions.sql` 刪除。
- 目前已建立測試模式取消 API：`POST /api/line/webhook/cancel`，只接受 `testMode=true` 且 `pending.is_test=true` 的 pending；取消只更新 pending 狀態，不建立正式領取紀錄。
- LINE 本機流程整合回測使用 `npm run test:line-flow`，依序測 webhook、signature、event reply dry run、admin auth、confirm、cancel，避免測試清理互相干擾。
- `npm run test:line-flow` 包含錯誤 signature 拒絕測試與未授權者拒絕測試，確認非 LINE 來源或非 allowlist 使用者不能建立 pending。

LINE Webhook 需要：

- 驗證 `x-line-signature`。
- 使用 `LINE_CHANNEL_SECRET` 做 signature 驗證。
- 本機開發若未送 `x-line-signature` 可保留 skeleton 測試；正式環境或 `LINE_SIGNATURE_REQUIRED=true` 時必須有合法 signature。
- 使用 `LINE_ADMIN_USER_IDS` 或等效 allowlist 限制可操作者。
- 建立 pending、確認、取消等會改變資料狀態的操作，都必須檢查操作者 LINE userId。
- 本機測試可用 `adminUserId = "local-test-admin"` 模擬 allowlist 通過；正式串 LINE 後改用 `event.source.userId`。
- 支援 LINE 官方 webhook event body：讀取 `event.source.userId`、`event.message.text`、`event.replyToken`。
- reply API 目前預設 dry run；正式發送需設定 `LINE_CHANNEL_ACCESS_TOKEN` 並將 `LINE_REPLY_DRY_RUN=false`。
- 解析固定格式文字指令。
- 保健食品領取文字需呼叫 `lib/line/redemption-parser.ts`，不可在 webhook 內重寫扣組數與盒數計算。
- 寫入 Supabase。
- 回覆成功摘要或錯誤格式提示。

開發備用管理 API：

- `POST /api/admin/[share_token]/redemption-records`
- `POST /api/admin/[share_token]/class-sessions`
- `POST /api/admin/[share_token]/payment-records`
- `PATCH /api/admin/[share_token]/payment-records/[payment_record_id]`

開發備用管理 API 驗證：

- Request body 或 header 需包含 `adminPasscode`。
- 後端比對 `process.env.ADMIN_PASSCODE`。
- 驗證失敗回傳 `401`。

## LINE 指令第一版

第一版先使用固定格式，不做自由自然語言解析。

付款：

```txt
繳費 1 已繳 2026/07/06
繳費 1 未繳
```

課程：

```txt
課程
[新增預約] [完成課程] [補登上課] [取消課程] [返回]
```

課程操作規則：

- `新增預約`：輸入日期時間，新增 `status = scheduled`，`title = 預約課程`。
- `完成課程`：從既有 `scheduled` 清單選一堂，選擇 `[訓練] [矯正]`，更新為 `status = completed`。
- `補登上課`：輸入日期時間，選擇 `[訓練] [矯正]`，新增一筆 `status = completed`。
- `取消課程`：從既有 `scheduled` 清單選一堂，輸入取消備註或「略過」，更新為 `status = cancelled`。
- 新增預約時不用分類；完成或補登時才選 `訓練 / 矯正`。
- 同一天多堂課時，Bot 顯示預約清單讓教練選擇。
- 課程取消不用二次確認。
- 改回未繳不用二次確認。

保健食品：

```txt
7/1 D 3組 R 3組 B群 1組
7/1 任搭4 衛樂寧 1盒 多采 1盒 B群 2盒
7/1 D 1組 任搭4 衛樂寧 1盒 多采 1盒 B群 2盒
```

保健食品輸入規則：

- 一般品項輸入單位 = `組`。
- 任搭輸入單位 = `盒`。
- 扣除組數由 Bot 依輸入自動加總，送出前回報確認。
- 一般品項的「幾盒一組」用於回報與換算盒數。
- 任搭規則需檢查盒數總和，例如 `任搭4` 合計 4 盒、`任搭7` 合計 7 盒。
- 使用者按「確認送出」前，不寫入 Supabase。
- 解析成功後可先建立 `pending_redemptions`，有效時間 10 分鐘；確認後才轉成正式 `redemption_records`。
- 測試 pending 必須標記 `is_test = true`，並可安全刪除，不影響正式領取紀錄。
- 測試確認送出時，正式紀錄 notes 必須以 `[TEST] LINE pending confirmation` 開頭，讓測試紀錄可被安全清除。
- 測試取消 pending 時，只將 `pending_redemptions.status` 改為 `cancelled`，不得建立 `redemption_records`。
- 商品代碼不存在、數量格式錯誤或任搭盒數不符合規則時，不寫入 Supabase。
- 商品存在但不屬於目前學生方案時，不寫入 Supabase。

保健食品確認摘要範例：

```txt
日期：2026/07/01

一般品項：
青春源汰淨 3 組｜規則：1 盒一組｜本次 3 盒
青春源煥活 3 組｜規則：1 盒一組｜本次 3 盒
活力 BB EX 1 組｜規則：5 盒一組｜本次 5 盒

本次扣除：7 組

[確認送出] [取消]
```

商品代碼表：

```txt
D = 青春源汰淨
R = 青春源煥活
P = 青春源倍護
B群 = 活力 BB EX
閃電油切 = Magic So 閃澱油切
動動爆燃 = Magic So 動動爆燃
三比八 = Magic So 黃金比例 3:8
多采 = 多采益生菌 EX
衛樂寧 = 衛樂寧
葉黃素 = 超易視晶彩葉黃素
魚油 = 頂級高濃度魚油
植物魚油 = 法國 DHA 植物藻油
白賦美 = 極光白賦美 EX
私密對策 = 蔓越莓私密對策
艾康敏 = 艾康敏益生菌
關節穩 = 膠原關鍵穩 EX
活循飲 = 清醇活循飲
Q10 = 納豆紅麴 Q10
鈣鎂鋅 = 鈣鎂鋅 EX
纖姿凍 = 美妍纖姿凍
艾立眠 = 艾立眠 EX
馬卡 = 馬卡活力久 EX
小心甘 = 小心甘 EX
活力循 = 紅麴活力循 EX
成長飲 = 樂高成長飲
多醣飲 = 活力多醣飲
全能飲 = 科技燕窩全能飲
美妍飲 = 科技燕窩美妍賦活飲
可可 = DoubleS 可可
海鮮 = DoubleS 海鮮濃湯
攝護力 = 攝護力 EX
靈光飲 = 智明靈光飲
```

LINE Bot 回覆：

- 成功：回覆寫入摘要。
- 格式錯誤：回覆範例。
- 權限錯誤：不寫入資料，回覆無權操作或靜默拒絕。

LINE Bot 主選單：

```txt
學生名稱
→ [課程] [繳費] [保健食品] [學生端連結] [結束]
```

多學生擴充要求：

- Bot 第一層需能用學生名稱或別名找到對應 `students`。
- 學生端連結使用該學生的 `/s/[share_token]`。
- 商品代碼表可共用。
- 保健食品兌換規則、總組數、任搭規則必須依目前選定學生的方案讀取。
- 不建立完整多學生管理後台。

## 計算規則

保健食品：

- 總組數 = `package_plans.total_credits`
- 已扣組數 = `sum(redemption_records.credit_used)`
- 剩餘組數 = `total_credits - 已扣組數`
- 領取紀錄依 `record_date` 新到舊排序。
- LINE 一般品項輸入的 `N組` 會加總成 `redemption_records.credit_used`。
- LINE 任搭輸入的 `任搭4` 或 `任搭7` 各自扣 1 組。
- LINE 寫入商品明細時，一般品項需依兌換規則換算為盒數，任搭品項使用輸入盒數。

課程：

- 已完成堂數 = `class_sessions.status = completed`
- 已預約堂數 = `class_sessions.status = scheduled`
- 剩餘堂數 = `course_contracts.total_sessions - 已完成堂數`
- 剩餘可預約堂數 = `course_contracts.total_sessions - 已完成堂數 - 已預約堂數`
- 已預約課程依日期近到遠。
- 已完成與取消紀錄依日期新到舊。

付款：

- 總額 = `billing_plans.total_amount`
- 每期金額 = `billing_plans.amount_per_installment`
- 已繳期數 = `payment_records.status = paid`
- 未繳期數需顯示 `due_date`
- 已繳期數需顯示 `paid_date`

## 測試資料

預設測試學生：

- `share_token`: `yi-ning`
- 姓名：邱裔甯
- 專案名稱：產後修復與代謝優化
- 課程：72 堂
- 正式起算日：2026-06-20
- 付款：6 期，每期 16,000，總額 96,000
- 保健食品方案：22 組

Seed SQL 見 `supabase/schema.sql`。
