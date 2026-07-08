# 裔甯專案紀錄工具 - 架構書

## 目前狀態

本文件先作為產品與資料架構草稿。現階段只整理資料來源與結構，不進入網頁實作。

## 命名方向

本工具不使用「學生專屬權益紀錄」作為產品名稱。

暫定工作名稱：`裔甯專案紀錄工具`

命名判斷：

- 這不是一般學生管理系統，而是單一個案的專案紀錄工具。
- 核心不是只記「權益」，而是整合課程、營養補給、兌換、繳費與合約狀態。
- 後續正式名稱可再依使用情境調整，例如偏向「專案追蹤」、「照護紀錄」、「課程與營養方案」或「客戶專屬方案」。

## 架構決策摘要

1. 本工具以「單一學生專案版本」為第一階段，不做完整會員登入，也不做多學生管理後台。
2. 正式技術方向改為 `Next.js + Supabase + Vercel + LINE Bot Webhook`，不再以 localStorage 作為正式資料層。
3. 合約資料、商品型錄、兌換方案與課程權益先由開發者整理後匯入 Supabase。
4. 學生端只負責查看合約摘要、課程、保健食品方案、商品、領取紀錄與繳費狀態。
5. 學生端不提供設定、備份、商品編輯、方案編輯、重置資料入口。
6. 邱裔甯的保健食品方案不能用單一 `boxesPerSet` 表示，應改成「22 組額度 + 多種兌換規則」。
7. 繳費紀錄屬於合約權益的一部分，學生端以首頁入口進入獨立繳費狀態頁，不放在底部導航。
8. 正式管理操作模式改為 LINE Bot 指令，不以網頁管理後台作為主要入口。
9. 網頁 `/admin` 可保留為開發備用或緊急修正工具，但不作為正式日常操作流程。

## 技術架構與部署方向

正式方向：

```txt
Codex / ChatGPT -> GitHub -> Next.js -> Supabase -> Vercel
LINE Bot -> Vercel API Route Webhook -> Supabase
```

| 工具 | 在本專案的角色 |
|---|---|
| Codex / ChatGPT | 協助規劃架構、整理資料、撰寫程式、產生 SQL、修 bug |
| GitHub | 存放程式碼、版本管理、串接 Vercel 部署 |
| Next.js | 建立學生查看端、Webhook API routes、必要時保留開發備用管理頁 |
| Supabase | 雲端資料庫，儲存學生資料、商品、兌換規則、領取紀錄、課程紀錄、繳費紀錄 |
| Vercel | 部署學生端網頁與 LINE Webhook API |
| LINE Bot | 教練日常管理入口，以 LINE 訊息新增或更新紀錄 |

### LINE Bot 管理架構

正式管理流程：

```txt
教練傳 LINE 訊息
-> LINE Bot 收到文字訊息
-> LINE Platform POST 到 Vercel API Route
-> Webhook 驗證 LINE signature
-> 指令解析器判斷操作類型
-> 寫入 Supabase
-> 學生端網頁讀取 Supabase 最新狀態
```

Webhook 建議使用：

```txt
POST /api/line/webhook
```

選擇 Vercel API Route 的原因：

- 目前專案已使用 Next.js，學生端預計部署在 Vercel。
- Webhook 可以與學生端共用同一個 Supabase server client 與資料型別。
- 不需要額外維護 Supabase Edge Function、Cloudflare Worker 或 Netlify Function。
- 部署與環境變數集中在 Vercel，初期維護成本最低。

替代方案保留：

| Webhook 位置 | 適合情境 |
|---|---|
| Vercel API Route | 第一階段推薦，與 Next.js 專案整合最低成本 |
| Supabase Edge Function | 未來若想把資料寫入邏輯集中在 Supabase 端 |
| Cloudflare Worker | 未來若需要更細的邊緣網路控制、低延遲或獨立於 Vercel |
| Netlify Function | 若部署平台改成 Netlify |

### 登入與權限策略

本專案第一階段不做完整會員登入。

原因：

- 目前是單一學生專案，不需要完整會員系統。
- 學生端主要是查看，不需要帳號密碼操作。
- 管理操作由教練透過 LINE Bot 指令處理，不需要學生或教練登入網頁後台。

第一階段建議：

- 學生查看端使用專屬網址，例如 `/s/yi-ning`。
- 管理操作端使用 LINE Bot，不顯示在學生端。
- LINE Webhook 使用 `LINE_CHANNEL_SECRET` 驗證 LINE signature。
- 本機開發可不送 signature 以保留 skeleton 測試；正式環境或 `LINE_SIGNATURE_REQUIRED=true` 時必須驗證 `x-line-signature`。
- Webhook 已支援 LINE 官方 event body 欄位：`event.source.userId`、`event.message.text`、`event.replyToken`。
- reply API 目前採 dry run；正式發送需設定 `LINE_CHANNEL_ACCESS_TOKEN` 並將 `LINE_REPLY_DRY_RUN=false`。
- 教練身份可用 LINE userId allowlist 或管理密碼二擇一；正式建議 userId allowlist。
- 網頁 `/admin/yi-ning` 若保留，只作為開發備用與緊急資料修正入口。
- Supabase 先作為受控資料庫，由 Next.js server-side 存取。

未來升級條件：

- 若學生數量增加。
- 若需要每位學生登入查看自己的資料。
- 若管理端需要多人共同操作。
- 若需要嚴格資料權限與審計紀錄。

到那時再評估 Supabase Auth 與 Row Level Security。

### 路由方向

學生查看端：

```txt
/s/[studentSlug]
/s/[studentSlug]/catalog
/s/[studentSlug]/sessions
/s/[studentSlug]/records
/s/[studentSlug]/plan
```

管理操作端，後續討論：

```txt
LINE Bot
POST /api/line/webhook
```

開發備用管理頁：

```txt
/admin/[studentSlug]
/admin/[studentSlug]/records
/admin/[studentSlug]/sessions
/admin/[studentSlug]/payments
```

上述 `/admin` 路由不是正式日常管理入口，部署後可視需要關閉、隱藏或加強保護。

### 資料儲存方向

正式資料來源：

- Supabase Postgres

不再作為正式資料來源：

- localStorage
- 手寫在前端檔案中的永久資料

localStorage 只可作為早期原型或離線測試，不列入正式架構。

初期資料匯入方式：

- 先從合約、型錄、圖片資料夾與裔甯保健食品清單整理成 seed data。
- 用 SQL seed 或 TypeScript seed script 寫入 Supabase。
- Next.js 從 Supabase 讀取資料渲染學生端頁面。
- LINE Webhook 解析管理指令後寫入 Supabase。

### 本地資料分層

Jarvis / 專案本地資料用來整理 seed、維護商品代碼表與支援多學生方案，不取代 Supabase 正式資料庫。

建議結構：

```txt
public/products/
src/data/products.ts
src/data/productAliases.ts
src/data/students/yi-ning.ts
src/data/index.ts
```

分工：

| 檔案 / 資料夾 | 用途 |
|---|---|
| `public/products/` | 共用產品圖檔，供學生端型錄與商品卡使用 |
| `src/data/products.ts` | 共用商品主資料：正式品名、分類、規格、主要功效、圖片路徑 |
| `src/data/productAliases.ts` | 共用商品代碼表，供 LINE Bot 將短碼轉成產品 slug |
| `src/data/students/yi-ning.ts` | 裔甯個別保健食品方案：總組數、固定規則、任搭規則 |
| `src/data/index.ts` | 本地資料統一匯出入口 |
| `lib/line/redemption-parser.ts` | LINE 保健食品文字輸入解析器，將文字轉成確認摘要與結構化紀錄 |
| `scripts/test-redemption-parser.mjs` | 保健食品輸入格式回測腳本 |

維護原則：

- 產品圖與商品代碼表是共用資料。
- 每位學生的保健食品方案獨立放在 `src/data/students/`。
- 新增學生時，不複製整份商品清單，只新增該學生的方案資料。
- 本地資料可用於產生 Supabase seed；正式網站與 LINE Bot 寫入後仍以 Supabase 為狀態來源。
- 本地資料需可回測，例如檢查商品代碼是否都對應存在商品、學生方案是否引用存在商品、圖片路徑是否存在。
- LINE Webhook 不直接重寫兌換計算規則，需呼叫共用 parser，避免 Bot、seed、測試與未來備用管理頁規則分叉。

## 模式分工：學生查看模式 vs 管理操作模式

本工具需要分成兩種模式，避免學生端查看體驗與教練端操作流程混在一起。

### 學生查看模式

目前架構書優先定稿的是學生查看模式。

目標：

- 讓裔甯快速知道自己的課程、保健食品、領取紀錄與繳費狀態。
- 降低學生理解成本，讓她知道「剩多少、領過什麼、接下來是什麼」。
- 不讓學生誤改合約、方案、商品、繳費或扣組數資料。

學生可以做：

- 查看首頁總覽。
- 查看保健食品型錄。
- 查看商品規格、主要功效與兌換規則。
- 查看自己的 22 組方案、已扣組數與剩餘組數。
- 查看領取紀錄。
- 查看課程堂數、預約、完成與取消紀錄。
- 查看繳費狀態。

學生不可以做：

- 新增或修改商品。
- 修改兌換規則。
- 修改總組數。
- 自己扣組數。
- 自己新增領取紀錄。
- 自己標記繳費。
- 重置資料。
- 備份或匯出資料。
- 進入設定頁。

學生端底部導航：

```txt
首頁｜型錄｜課程｜紀錄｜方案
```

學生端不放：

- `＋領取`
- `設定`
- `備份`
- `管理`

### 管理操作模式

管理操作模式是教練 / 乙方使用。新方向以 LINE Bot 作為正式管理入口，不以網頁管理後台作為主要入口。

LINE Bot 需要支援：

- 新增保健食品領取紀錄。
- 記錄扣除組數。
- 記錄贈品。
- 標記 6 期繳費是否已繳。
- 將已繳改回未繳。
- 更新課程完成、預約或取消狀態。
- 補登已完成課程。

目前暫定原則：

- 管理操作模式不要出現在學生端底部導航。
- 日常管理以 LINE 指令為主。
- 網頁 `/admin` 若保留，只作為開發備用或緊急修正工具。
- 不需要完整會員登入，但 Webhook 必須驗證 LINE 來源與操作者身份。

#### LINE 指令設計原則

第一階段不做自由自然語言解析，先採用固定格式指令，降低誤寫資料庫風險。

建議先支援以下類型：

```txt
繳費 1 已繳 2026/07/06
繳費 1 未繳

課程
[新增預約] [完成課程] [補登上課] [取消課程] [返回]

7/1 D 3組 R 3組 B群 1組
7/1 任搭4 衛樂寧 1盒 多采 1盒 B群 2盒
7/1 D 1組 任搭4 衛樂寧 1盒 多采 1盒 B群 2盒
```

LINE Bot 回覆原則：

- 成功寫入後回覆摘要，例如「已新增 2026/07/10 上課紀錄」。
- 解析失敗時回覆格式範例，不寫入資料庫。
- 高風險操作可要求二次確認，例如大量扣組數、刪除或覆蓋紀錄。
- 第一階段先避免刪除資料，改用取消、未繳、備註修正等方式保留歷史。

#### LINE 課程操作流程

課程模組選單：

```txt
課程
[新增預約] [完成課程] [補登上課] [取消課程] [返回]
```

新增預約：

- 使用情境：先排未來課程。
- 輸入內容：日期與時間。
- 不需要分類為訓練或矯正。
- 寫入：
  - `status = scheduled`
  - `title = 預約課程`

範例：

```txt
7/17 18:30
```

完成課程：

- 使用情境：原本已有預約，上完課後把該筆預約改為已完成。
- Bot 顯示目前 `scheduled` 課程清單，讓教練選擇同一天不同時段的正確課程。
- 選定課程後，Bot 詢問課程類型：

```txt
[訓練] [矯正]
```

- 寫入：
  - `status = completed`
  - `title = 訓練` 或 `title = 矯正`

補登上課：

- 使用情境：忘記先建立預約，但課已經上完。
- 輸入內容：日期與時間。
- Bot 詢問課程類型：

```txt
[訓練] [矯正]
```

- 寫入：
  - 新增一筆 `status = completed`
  - `title = 訓練` 或 `title = 矯正`

取消課程：

- 使用情境：取消已預約課程。
- Bot 顯示目前 `scheduled` 課程清單，讓教練選擇要取消的課程。
- 選定後可輸入取消備註，或輸入「略過」。
- 不需要二次確認。
- 寫入：
  - `status = cancelled`
  - `notes = 取消備註`

學生端呈現：

- `scheduled` 顯示在「即將上課」。
- `completed` 顯示在「上課紀錄」，並顯示 `訓練` 或 `矯正`。
- `cancelled` 顯示在「取消紀錄」。

直接執行規則：

- 課程取消不用二次確認。
- 改回未繳不用二次確認。
- 保健食品新增領取紀錄仍需確認摘要後才寫入。

#### LINE 保健食品輸入規則

保健食品模組採用少量選單 + 文字輸入，不把所有商品列成按鈕，避免 LINE 訊息過長。

選單：

```txt
保健食品
[新增領取紀錄] [返回]
```

商品代碼表用關鍵字呼叫，例如：

```txt
商品代碼
裔甯 商品代碼
```

輸入單位定稿：

- 一般品項輸入單位 = `組`。
- 任搭輸入單位 = `盒`。
- 扣除組數由 Bot 依輸入自動加總，送出前回報確認。
- 一般品項的「幾盒一組」只用來換算與提醒，不要求使用者輸入盒數。
- 任搭規則需檢查盒數總和，例如 `任搭4` 合計 4 盒、`任搭7` 合計 7 盒。

一般品項格式：

```txt
日期 商品代碼 N組 商品代碼 N組
```

範例：

```txt
7/1 D 3組 R 3組 B群 1組
```

Bot 確認摘要：

```txt
日期：2026/07/01

一般品項：
青春源汰淨 3 組｜規則：1 盒一組｜本次 3 盒
青春源煥活 3 組｜規則：1 盒一組｜本次 3 盒
活力 BB EX 1 組｜規則：5 盒一組｜本次 5 盒

本次扣除：7 組

[確認送出] [取消]
```

任搭格式：

```txt
日期 任搭4 商品代碼 N盒 商品代碼 N盒
日期 任搭7 商品代碼 N盒 商品代碼 N盒
```

範例：

```txt
7/1 任搭4 衛樂寧 1盒 多采 1盒 B群 2盒
```

Bot 確認摘要：

```txt
日期：2026/07/01

任搭4：
衛樂寧 1 盒
多采益生菌 EX 1 盒
活力 BB EX 2 盒
合計：4 盒｜規則：4 盒任搭為 1 組

本次扣除：1 組

[確認送出] [取消]
```

混合格式：

```txt
日期 商品代碼 N組 任搭4 商品代碼 N盒 商品代碼 N盒
```

範例：

```txt
7/1 D 1組 任搭4 衛樂寧 1盒 多采 1盒 B群 2盒
```

Bot 確認摘要：

```txt
日期：2026/07/01

一般品項：
青春源汰淨 1 組｜規則：1 盒一組｜本次 1 盒

任搭4：
衛樂寧 1 盒
多采益生菌 EX 1 盒
活力 BB EX 2 盒
合計：4 盒｜規則：4 盒任搭為 1 組

本次扣除：2 組

[確認送出] [取消]
```

寫入規則：

- 使用者按「確認送出」前，不寫入 Supabase。
- 寫入 `redemption_records.credit_used` 時，使用 Bot 確認摘要中的「本次扣除」。
- 一般品項寫入 `redemption_record_items.quantity` 時，使用換算後盒數。
- 任搭品項寫入 `redemption_record_items.quantity` 時，使用輸入的盒數。
- 若商品代碼不存在、數量格式錯誤或任搭盒數不符合規則，Bot 回覆錯誤提示，不寫入。

商品代碼表定稿：

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

## LINE Bot 管理模式 v1 定稿

本章整理正式 LINE Bot 管理流程，作為後續實作 `POST /api/line/webhook` 的主要依據。

### 設計定位

LINE Bot 是教練日常管理入口，學生端仍然只用網頁查看狀態。

```txt
教練用 LINE 寫入
學生用網頁查看
Supabase 作為共同資料來源
```

第一版不做完整會員登入，也不做多學生管理後台；但 LINE Bot 的第一層要支援多個學生名稱，因為後續不同學生也會需要保健食品紀錄。

### 多學生擴充原則

第一層輸入學生名稱或學生別名，例如：

```txt
裔甯
```

Bot 根據輸入找到對應學生，進入該學生的管理狀態。

未來新增其他學生時，應在資料中維護：

- `students.name`
- `students.share_token`
- LINE Bot 可辨識的學生別名，例如 `裔甯`
- 該學生的 `package_plans`
- 該學生的 `redemption_rules`
- 該學生的課程合約與付款資料

多學生設計重點：

- 學生端仍使用 `/s/[share_token]` 查看資料。
- LINE Bot 以學生名稱或別名作為第一層入口。
- 進入某位學生後，後續操作都寫入該學生的 Supabase 資料。
- 不需要建立完整多學生後台。
- 商品代碼表可共用，但兌換規則與方案額度必須依學生方案讀取。
- 保健食品輸入法共用：一般品項用 `組`，任搭用 `盒`。
- 實際扣組數、換算盒數、可用任搭規則，需依目前選定學生的 `redemption_rules` 計算。

### 主選單

輸入學生名稱後，Bot 回覆主選單：

```txt
裔甯管理
[課程] [繳費] [保健食品] [學生端連結] [結束]
```

主選單模組：

- `課程`：新增預約、完成課程、補登上課、取消課程。
- `繳費`：標記已繳、改回未繳。
- `保健食品`：新增領取紀錄。
- `學生端連結`：回覆該學生的 `/s/[share_token]` 網址。
- `結束`：清除目前學生管理狀態。

完成任一操作後，Bot 回覆操作結果，並再次顯示同一位學生的主選單。

### 狀態與導航

```txt
返回 = 回上一層
取消 = 取消目前操作，不寫入資料，回到該學生主選單
結束 = 清除目前學生與操作狀態
閒置逾時 = 30 分鐘自動清除狀態
```

錯誤處理：

- 輸入格式錯誤時，不寫入 Supabase。
- Bot 回覆錯誤原因、正確範例與操作按鈕。
- 錯誤回覆按鈕建議：`[重新輸入] [返回] [取消]`。

學生端連結：

- 可在主選單點 `[學生端連結]`。
- 也可用關鍵字呼叫，例如：

```txt
裔甯連結
裔甯學生端
裔甯狀態
```

Bot 回覆：

```txt
裔甯學生端：
https://正式網址/s/yi-ning
```

### 課程模組

```txt
課程
[新增預約] [完成課程] [補登上課] [取消課程] [返回]
```

新增預約：

- 輸入日期時間，例如 `7/17 18:30`。
- 新增 `class_sessions`：
  - `status = scheduled`
  - `title = 預約課程`

完成課程：

- Bot 顯示目前 `scheduled` 課程清單。
- 教練選擇要完成的那一堂。
- Bot 再詢問：

```txt
[訓練] [矯正]
```

- 更新該筆課程：
  - `status = completed`
  - `title = 訓練` 或 `title = 矯正`

補登上課：

- 用於忘記先建立預約但已經上完課。
- 輸入日期時間。
- Bot 詢問 `[訓練] [矯正]`。
- 新增 `status = completed` 的課程紀錄。

取消課程：

- Bot 顯示目前 `scheduled` 課程清單。
- 教練選擇要取消的那一堂。
- 可輸入取消備註，或輸入「略過」。
- 不需要二次確認。
- 更新：
  - `status = cancelled`
  - `notes = 取消備註`

### 繳費模組

```txt
繳費
[標記已繳] [改回未繳] [返回]
```

標記已繳：

- Bot 顯示目前未繳期數。
- 教練選擇期數。
- Bot 要求輸入繳費日期，不預設今天。
- 更新：
  - `status = paid`
  - `paid_date = 輸入日期`

改回未繳：

- Bot 顯示目前已繳期數。
- 教練選擇期數。
- 不需要二次確認。
- 更新：
  - `status = unpaid`
  - `paid_date = null`

### 保健食品模組

```txt
保健食品
[新增領取紀錄] [返回]
```

保健食品採用文字輸入，不把全部商品列成按鈕，避免 LINE 訊息過長。

共用商品代碼表：

- 商品代碼表可以跨學生共用。
- 但每位學生可兌換哪些品項、幾盒一組、任搭規則與總組數，要依該學生的方案設定。

代碼表可用關鍵字呼叫：

```txt
商品代碼
學生名 商品代碼
```

輸入單位：

- 一般品項：輸入 `N組`。
- 任搭：輸入 `N盒`。
- Bot 依目前學生的兌換規則換算盒數與加總扣除組數。

一般品項範例：

```txt
7/1
B群 1組
D 1組
白賦美 1組
```

Bot 確認摘要：

```txt
請確認本次領取：

日期：2026/07/01

一般品項：
活力 BB EX 1 組｜規則：5 盒一組｜本次 5 盒
青春源汰淨 1 組｜規則：1 盒一組｜本次 1 盒
極光白賦美 EX 1 組｜規則：5 盒一組｜本次 5 盒

本次扣除：3 組
本次盒數：11 盒

[確認送出] [取消]
```

任搭範例：

```txt
7/1 任搭4 衛樂寧 1盒 多采 1盒 B群 2盒
```

混合範例：

```txt
7/1 D 1組 任搭4 衛樂寧 1盒 多采 1盒 B群 2盒
```

寫入規則：

- 使用者按「確認送出」前，不寫入 Supabase。
- 解析成功後先建立 `pending_redemptions`，狀態為 `pending`，有效時間 10 分鐘。
- 測試建立的 pending 必須標記 `is_test = true`，可用清理腳本或 SQL 刪除，不影響正式領取紀錄。
- 使用者按「確認送出」後，才將 pending 轉成正式 `redemption_records` 與 `redemption_record_items`。
- 目前確認送出 API 先採測試模式：`POST /api/line/webhook/confirm` 只接受 `testMode=true` 且 `pending.is_test=true`。
- 測試確認送出的正式紀錄 notes 以 `[TEST] LINE pending confirmation` 開頭，可用 `npm run cleanup:test-redemptions` 清除。
- 目前取消 pending API 先採測試模式：`POST /api/line/webhook/cancel` 只接受 `testMode=true` 且 `pending.is_test=true`。
- 建立 pending、確認送出、取消 pending 都必須通過管理者 allowlist；本機測試使用 `adminUserId = "local-test-admin"`，正式 LINE 串接後改用 `event.source.userId` 並比對 `LINE_ADMIN_USER_IDS`。
- 使用者按「取消」或逾時，pending 標記為 `cancelled` 或 `expired`，不建立正式領取紀錄。
- 本機 LINE 流程回測使用 `npm run test:line-flow`，依序測 webhook、signature、event reply dry run、admin auth、confirm、cancel；不要平行跑 confirm/cancel 測試，避免清理測試資料時互相干擾。
- 確認後新增一筆 `redemption_records`。
- `redemption_records.credit_used` 使用確認摘要中的「本次扣除」。
- 一般品項寫入 `redemption_record_items.quantity` 時，使用換算後盒數。
- 任搭品項寫入 `redemption_record_items.quantity` 時，使用輸入盒數。
- 若商品代碼不存在、數量格式錯誤、品項不屬於該學生方案或任搭盒數不符合規則，Bot 回覆錯誤提示，不寫入。

### 確認規則

需要確認摘要後才寫入：

- 保健食品新增領取紀錄。

直接執行，不二次確認：

- 課程取消。
- 改回未繳。
- 完成課程。
- 新增預約。
- 補登上課。
- 標記已繳。

### 本階段定稿邊界

本階段先完善：

- 學生查看首頁
- 學生查看型錄
- 學生查看課程
- 學生查看繳費狀態
- 學生查看領取紀錄
- 學生查看保健食品方案
- LINE Bot 管理指令格式

本階段暫不定稿：

- `/records/new`
- 網頁 `/admin` 作為正式管理入口
- 自由自然語言管理
- 刪除資料指令
- 多學生管理後台

## 頁面安排

| 頁面 | 主要內容 | 備註 |
|---|---|---|
| `/` 首頁總覽 | 學生姓名、課程摘要、保健食品剩餘組數、最近領取紀錄、下一堂課、繳費狀態入口按鈕 | 首頁優先服務學生本人，讓學生快速知道目前狀態 |
| `/catalog` 保健食品型錄 | 分類瀏覽、商品卡、圖片、品名、規格、主要功效、兌換規則提示 | 只查看，不編輯；學生看懂能換什麼即可，實際兌換由教練協助處理 |
| `/sessions` 課程權益與上課紀錄 | 課程合約摘要、已完成/已預約/剩餘堂數、上課紀錄、取消紀錄 | 不放繳費狀態，讓課程頁專注於上課時間與紀錄 |
| `/payments` 繳費狀態 | 6 期付款狀態、已繳日期、未繳應繳日 | 不放在底部導航，由首頁按鈕進入 |
| `/records` 保健食品領取紀錄 | 所有領取紀錄，依日期新到舊 | 顯示扣除組數、品項明細、備註 |
| `/plan` 我的領取方案 | 22 組額度、固定組合規則、任搭規則 | 只查看，不編輯；學生查看模式不顯示優惠與限時活動 |

## 頁面與使用流程定稿

### 首頁 `/`

主要讀者：學生本人。

首頁第一屏資訊優先順序：

1. 剩餘保健食品組數
2. 下一堂課
3. 學生姓名
4. 「查看繳費狀態」按鈕
5. 最近領取紀錄
6. 課程統計

首頁目標：

- 快速知道保健食品總共 22 組、已扣幾組、剩幾組。
- 快速看到最近一次保健食品領取紀錄。
- 快速看到課程總堂數、已完成堂數、已預約堂數、剩餘堂數。
- 快速看到下一堂已預約課程。
- 提供「查看繳費狀態」按鈕，連到獨立繳費狀態頁。

首頁不做：

- 不顯示設定入口。
- 不顯示備份入口。
- 不讓學生修改方案或商品資料。

### 保健食品型錄 `/catalog`

呈現方式：分類瀏覽 + 商品卡。

產品分類來源：`COLORFUL_CATALOG_2026.pdf` 第 5 頁「保健品功能一覽表」。

分類名稱：

- 高端抗老
- 全能守護
- 美容保養
- 營養補充
- 纖體瘦身
- 骨關節保養
- 心血管 / 循環系統保養
- 益生菌
- 健康機能
- 眼 / 腦保養
- 增強體力 / 能量充沛
- 男女專屬

商品卡建議顯示：

- 產品圖片
- 品名
- 規格
- 主要功效
- 所屬兌換規則，例如 `5 盒一組`、`4 盒任搭為 1 組`

使用邏輯：

- 學生可以看懂有哪些商品、每個商品大概用途、以及它屬於哪種兌換方式。
- 實際上學生通常是先告訴教練想換什麼，再由教練處理兌換紀錄。
- 因此型錄頁以理解與溝通為主，不需要讓學生直接在此頁完成兌換。

### 方案頁 `/plan`

主要目標：

- 讓學生理解自己總共有 `22 組`。
- 讓學生理解目前剩幾組。
- 讓學生理解哪些商品幾盒算 1 組。

呈現方式：

- 方案頁用「規則」呈現，例如：
  - 5 盒一組
  - 6 盒一組
  - 8 盒一組
  - 4 盒任搭為 1 組
  - 7 盒任搭為 1 組
- 型錄頁則用「商品」呈現，並在商品卡上標示它屬於哪個規則。
- 學生查看模式下，方案頁不顯示優惠與限時活動。
- 優惠與限時活動由教練親自通知，或留到管理操作模式處理。

### LINE 管理操作：新增領取紀錄

此段為 LINE Bot 管理模式定稿，網頁 `/records/new` 不作為正式日常操作入口。

目前確定：

- 新增時需要記錄扣了幾組，因為扣組數是最重要資訊。
- 領取紀錄完成後，剩餘組數由 `22 - 已扣組數加總` 計算。
- 一般品項輸入單位為 `組`，任搭輸入單位為 `盒`。
- Bot 依輸入自動加總本次扣除組數，送出前回報確認。
- Bot 只在使用者按「確認送出」後寫入 Supabase。
- 特殊優惠與贈品先用備註或特殊紀錄處理，不讓學生端自由選擇。

尚待討論：

- 限時優惠是否需要出現在新增紀錄流程中。

目前傾向：

- 學生端主要用於查看。
- 教練端以 LINE Bot 文字輸入為主：
  - 一般品項輸入 `商品代碼 N組`
  - 任搭輸入 `任搭4/任搭7 商品代碼 N盒`
  - 可混合一般品項與任搭
  - Bot 回覆正式品名、規則、換算盒數與本次扣除組數
  - 可記錄贈品與備註
- 限時優惠由教練親自通知，不一定要放成學生可自由選的入口。

### 課程頁 `/sessions`

課程頁包含：

- 課程合約摘要
- 總堂數、已完成堂數、已預約堂數、剩餘堂數
- 預約紀錄
- 已完成上課紀錄
- 取消紀錄
- 繳費紀錄

學生端可查看的合約內容：

- 專案名稱：產後修復與代謝優化
- 課程方案名稱：產後修復運動矯正與營養監測計畫
- 正式起算日：2026-06-20
- 總課堂數：72 堂
- 專案期間：15 個月，含 3 個月緩衝期
- 服務內容：
  - 運動矯正訓練
  - 筋膜調理
  - 醫動對接監測
  - 營養諮詢
- 請假規則摘要：課前 24 小時告知。
- 特殊狀態提醒摘要：若有頭暈、心悸、體力不支、瘦瘦針反應或貧血相關狀況，需於訓練前主動告知。

學生端不顯示的合約內容：

- 身分證字號
- 地址、電話、Email
- 乙方銀行帳戶
- 完整退費公式
- 法院管轄條款
- 完整法律條文原文

上課紀錄顯示：

- 已預約課程：
  - 日期
  - 時間
  - 課程名稱
  - 地點，如果有
  - 備註
- 已完成課程：
  - 日期
  - 時間
  - 課程名稱
  - 課程內容摘要
  - 備註
- 取消紀錄：
  - 日期
  - 時間
  - 課程名稱
  - 備註

上課紀錄排序：

- 已預約課程：依日期由近到遠。
- 已完成課程：依日期由新到舊。
- 取消紀錄：依日期由新到舊。

堂數計算：

- 已完成堂數 = `classSessions` 中 `status === "completed"` 且 `countsTowardUsedSessions === true` 的數量。
- 已預約堂數 = `classSessions` 中 `status === "scheduled"` 的數量。
- 剩餘堂數 = `courseContract.totalSessions - 已完成堂數`。
- 目前學生端 UI 先不特別標示「取消但扣堂」，但資料模型保留 `countsTowardUsedSessions` 供未來管理模式使用。

繳費紀錄顯示：

- 顯示總額 `96,000`
- 顯示每期 `16,000`
- 顯示 6 期狀態卡。
- 已繳期數需顯示繳費日期。
- 未繳期數需顯示應繳日。
- 首頁只提供「查看繳費狀態」按鈕，不在首頁展開 6 期明細。

取消紀錄：

- 目前先不特別顯示「取消但扣堂」。
- 若後續要做扣堂邏輯，可保留 `countsTowardUsedSessions` 欄位，但 UI 暫不強調。

### 領取紀錄 `/records`

排序方式：

- 全部依日期由新到舊排序。

每筆紀錄必顯示：

- 日期
- 扣了幾組
- 扣完後剩餘幾組
- 商品明細
- 贈品明細，如果有
- 備註

扣組數是最重要資訊，必須在紀錄卡上清楚顯示。

紀錄卡摘要格式：

```txt
2026/07/01
扣 1 組｜剩餘 21 組
```

其他資訊採「點開查看更多」：

- 商品明細
- 贈品明細
- 備註
- 對應兌換規則或套組

## Supabase 資料表與 Seed 建議

正式實作時，資料不放在 `src/data/initialData.ts` 作為永久來源，而是整理成 Supabase seed data。

`src/data/initialData.ts` 可在早期開發時作為暫時 mock，但正式方向以 Supabase 為準。

### 建議資料表

| 資料表 | 用途 |
|---|---|
| `students` | 單一學生 / 個案基本資料 |
| `course_contracts` | 課程合約摘要與堂數權益 |
| `class_sessions` | 預約、完成、取消的上課紀錄 |
| `billing_plans` | 合約付款規則，例如總額、期數、每期金額 |
| `payment_records` | 6 期實際繳費狀態 |
| `products` | 商品主資料：品項、規格、主要功效、分類、圖片 |
| `product_variants` | 同產品線不同口味或包裝 |
| `package_plans` | 保健食品方案總額度，例如 22 組 |
| `redemption_rules` | 一般兌換規則，例如 5 盒一組、4 盒任搭 |
| `redemption_rule_products` | 兌換規則與商品的多對多關聯 |
| `redemption_bundles` | 專案優惠或組合包，後續管理模式使用 |
| `redemption_records` | 實際領取紀錄 |
| `redemption_record_items` | 每筆領取紀錄中的商品明細 |
| `redemption_record_bonus_items` | 每筆領取紀錄中的贈品明細 |

### Seed 資料來源

| Seed 區塊 | 來源 |
|---|---|
| `students` | 合約書 |
| `course_contracts` | 合約書 |
| `billing_plans` | 合約書 |
| `payment_records` | 合約付款規則預先產生 6 期 |
| `products` | `COLORFUL_CATALOG_2026.pdf`、商品網站、產品圖資料夾 |
| `product_variants` | DoubleS 蛋白粉、魚油包裝等 |
| `package_plans` | 裔甯保健食品目錄 |
| `redemption_rules` | 裔甯保健食品目錄 |
| `redemption_bundles` | 裔甯保健食品目錄中的專案優惠 |
| `redemption_records` | 已發生的領取紀錄，例如 2026-07-01 |
| `class_sessions` | 後續由管理操作模式建立或匯入 |

### Next.js 讀寫邊界

學生查看端：

- 只讀 Supabase 資料。
- 不提供寫入操作。
- 不顯示管理入口。

LINE Bot / Webhook 管理端：

- 正式日常寫入入口。
- 負責新增領取紀錄、標記繳費、更新課程紀錄。
- 透過 `POST /api/line/webhook` 接收 LINE 訊息並寫入 Supabase。
- 必須驗證 LINE signature 與操作者身份。

網頁 `/admin`：

- 只作為開發備用或緊急修正工具。
- 不放在學生端，也不作為正式管理流程。

## 資料模型定稿

以下資料模型是目前架構書的第一版定稿，用來承接合約、商品型錄、裔甯保健食品配置、圖片與繳費紀錄。

### StudentProfile

學生 / 個案基本資料。學生端只需要顯示必要資訊，不放敏感個資。

```ts
type StudentProfile = {
  id: string;
  name: string;
  projectName: string;
  notes?: string;
  riskNotes?: string[];
};
```

欄位來源：

- `name`：合約甲方姓名
- `projectName`：合約專案名稱，例如「產後修復與代謝優化」
- `riskNotes`：合約中的運動安全提醒，例如頭暈、心悸、瘦瘦針反應、貧血狀態等

### CourseContract

課程合約與堂數權益。

```ts
type CourseContract = {
  id: string;
  planName: string;
  totalSessions: number;
  startDate: string;
  durationMonths: number;
  bufferMonths: number;
  location?: string;
  serviceItems: string[];
  cancellationPolicy?: string;
  pregnancyPolicy?: string;
  notes?: string;
};
```

裔甯目前建議值：

```ts
const courseContract = {
  planName: "產後修復運動矯正與營養監測計畫",
  totalSessions: 72,
  startDate: "2026-06-20",
  durationMonths: 15,
  bufferMonths: 3,
  serviceItems: ["運動矯正訓練", "筋膜調理", "醫動對接監測", "營養諮詢"],
};
```

### ClassSession

單堂課程、預約、完成或取消紀錄。

```ts
type ClassSessionStatus = "scheduled" | "completed" | "cancelled";

type ClassSession = {
  id: string;
  date: string;
  time?: string;
  title: string;
  status: ClassSessionStatus;
  content?: string;
  notes?: string;
  countsTowardUsedSessions: boolean;
};
```

注意：

- `cancelled` 不一定不扣堂。
- 若未依課前 24 小時告知，合約規則可視同扣課，因此需要 `countsTowardUsedSessions`。

### BillingPlan

合約付款規則。

```ts
type BillingPlan = {
  totalAmount: number;
  installmentCount: number;
  amountPerInstallment: number;
  dueDayOfMonth: number;
  startDate: string;
  notes?: string;
};
```

裔甯目前建議值：

```ts
const billingPlan = {
  totalAmount: 96000,
  installmentCount: 6,
  amountPerInstallment: 16000,
  dueDayOfMonth: 20,
  startDate: "2026-06-20",
};
```

### PaymentRecord

每一期實際繳費紀錄。

```ts
type PaymentStatus = "unpaid" | "paid" | "late" | "waived";

type PaymentRecord = {
  id: string;
  installmentNo: number;
  dueDate: string;
  paidDate?: string;
  amount: number;
  status: PaymentStatus;
  method?: string;
  notes?: string;
};
```

頁面建議：

- 放在獨立 `/payments` 頁面。
- 由首頁「查看繳費狀態」按鈕進入。
- 不新增底部導航。

### Product

商品主資料。承接型錄中的品項、規格、主要功效與圖片。

```ts
type Product = {
  id: string;
  name: string;
  specification: string;
  primaryBenefits: string;
  productLine?: string;
  imageSrc?: string;
  imageAlt?: string;
  imageAliases?: string[];
  isAvailable: boolean;
  notes?: string;
};
```

設計原則：

- `name` 使用正式品名。
- `specification` 只放簡潔規格，不放完整產品頁文案。
- `primaryBenefits` 只放短句摘要。
- `imageSrc` 後續指向專案內圖片路徑，不直接使用桌面路徑。

### ProductVariant

用於同產品線不同口味或包裝，例如 DoubleS 可可 / 海鮮濃湯、魚油排裝 / 罐裝。

```ts
type ProductVariant = {
  id: string;
  productId: string;
  label: string;
  flavor?: string;
  packageType?: string;
  imageSrc?: string;
  notes?: string;
};
```

### PackagePlan

裔甯保健食品方案總額度。

```ts
type PackagePlan = {
  id: string;
  planName: string;
  totalCredits: number;
  creditUnitLabel: "組";
  startDate?: string;
  notes?: string;
};
```

裔甯目前建議值：

```ts
const packagePlan = {
  planName: "裔甯保健食品配置",
  totalCredits: 22,
  creditUnitLabel: "組",
  startDate: "2026-06-20",
};
```

### RedemptionRule

一般兌換規則，例如 5 盒一組、4 盒任搭為 1 組。

```ts
type RedemptionRuleMode = "fixed_quantity" | "mix_and_match" | "single_item";

type RedemptionRule = {
  id: string;
  label: string;
  mode: RedemptionRuleMode;
  creditCost: number;
  quantityPerRedemption: number;
  productIds: string[];
  notes?: string;
};
```

範例：

```ts
const rule = {
  label: "4 盒任搭為 1 組",
  mode: "mix_and_match",
  creditCost: 1,
  quantityPerRedemption: 4,
  productIds: ["cranberry-care", "shelening", "b-complex"],
};
```

### RedemptionBundle

專案優惠或組合包。用來處理「輸入 6 為 1 套、但扣 1 組」這類不能用單純盒數計算的方案。

```ts
type RedemptionBundle = {
  id: string;
  label: string;
  creditCost: number;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
  bonusItems?: Array<{
    name: string;
    quantity: number;
    notes?: string;
  }>;
  notes?: string;
};
```

### RedemptionPromotion

限時活動、效期品、贈品資訊。

```ts
type RedemptionPromotion = {
  id: string;
  label: string;
  validUntil?: string;
  items: Array<{
    productId?: string;
    name: string;
    quantity: number;
  }>;
  bonusItems?: Array<{
    name: string;
    quantity: number;
    notes?: string;
  }>;
  notes?: string;
};
```

### RedemptionRecord

每次實際領取紀錄。

```ts
type RedemptionRecord = {
  id: string;
  date: string;
  sourceType: "rule" | "bundle" | "promotion" | "manual";
  sourceId?: string;
  creditUsed: number;
  items: Array<{
    productId?: string;
    name: string;
    quantity: number;
  }>;
  bonusItems?: Array<{
    name: string;
    quantity: number;
    notes?: string;
  }>;
  notes?: string;
};
```

計算規則：

- 已扣組數 = `redemptionRecords.creditUsed` 加總。
- 剩餘組數 = `packagePlan.totalCredits - 已扣組數`。
- 一般兌換紀錄用 `sourceType: "rule"`。
- 專案優惠用 `sourceType: "bundle"`。
- 限時活動用 `sourceType: "promotion"`。

### AppState

整體初始化資料。

```ts
type AppState = {
  studentProfile: StudentProfile;
  courseContract: CourseContract;
  classSessions: ClassSession[];
  billingPlan: BillingPlan;
  paymentRecords: PaymentRecord[];
  products: Product[];
  productVariants: ProductVariant[];
  packagePlan: PackagePlan;
  redemptionRules: RedemptionRule[];
  redemptionBundles: RedemptionBundle[];
  redemptionPromotions: RedemptionPromotion[];
  redemptionRecords: RedemptionRecord[];
};
```

## Contract 資料來源：邱裔甯

來源檔案：`C:\Users\pts15\Desktop\運動矯正訓練與營養規劃專案合約書 V1.pdf`

可轉入 App 的資料：

| 欄位 | 建議值 |
|---|---|
| 學生姓名 | 邱裔甯 |
| 專案名稱 | 產後修復與代謝優化 |
| 課程方案名稱 | 產後修復運動矯正與營養監測計畫 |
| 總課堂數 | 72 堂 |
| 正式起算日 | 2026-06-20 |
| 專案期間 | 15 個月，含 3 個月緩衝期 |
| 營養權益 | 一年份保健食品規劃與提供 |
| 服務內容 | 運動矯正訓練、筋膜調理、醫動對接監測、營養諮詢 |

不建議放入學生端 App 的資料：

- 身分證字號
- 銀行帳戶
- 電話、Email、地址
- 完整退費公式
- 付款帳務細節原文

## Payment 資料設計建議

繳費紀錄建議不要放在 `studentProfile`、`courseContract` 或 `packagePlan` 裡。

原因：

- 繳費是「多筆交易紀錄」，不是學生基本資料。
- 合約付款方式是規則，實際繳費是事件，兩者應分開。
- 未來可能需要顯示已繳、未繳、逾期、備註、收款方式，不適合塞進單一合約欄位。

建議資料結構：

```ts
type BillingPlan = {
  totalAmount: number;
  installmentCount: number;
  amountPerInstallment: number;
  dueDayOfMonth: number;
  startDate: string;
  notes?: string;
};

type PaymentRecord = {
  id: string;
  installmentNo: number;
  dueDate: string;
  paidDate?: string;
  amount: number;
  status: "unpaid" | "paid" | "late" | "waived";
  method?: string;
  notes?: string;
};
```

建議放置方式：

- `billingPlan`：放合約中的付款規則，例如總額、期數、每期金額、每月幾號前付款。
- `paymentRecords`：放實際繳費紀錄，一期一筆。

學生端頁面不新增底部導航入口；繳費狀態由首頁按鈕進入獨立 `/payments` 頁面，避免課程頁混入付款資訊。

## 裔甯保健食品配置資料來源

來源檔案：`C:\Users\pts15\Desktop\裔甯 保健食品目錄.docx`

這份檔案不是一般型錄，而是邱裔甯的實際保健食品兌換配置。它應該作為 `packagePlan` / `redemptionRules` 的資料來源。

### 方案總額度

| 欄位 | 值 |
|---|---:|
| 總組數 | 22 組 |

### 固定組合規則

| 規則 | 品項 |
|---|---|
| 5 盒一組 | 動動爆燃、閃澱油切、黃金比例3:8、頂級高濃度魚油、活力BB EX、多采益生菌EX、法國頂級DHA植物藻油、衛樂寧、攝護力、蔓越莓私密對策、極光白賦美EX、艾康敏益生菌、膠原關鍵穩EX、清醇複方活循飲、納豆紅麴Q10、智明靈光飲 |
| 6 盒一組 | 鈣鎂鋅EX、美妍纖姿凍 |
| 8 盒一組 | 艾立眠、馬卡活力久EX、小心甘EX、紅麴活力循EX、超易視晶彩葉黃素 |
| 7 盒一組 | 樂高成長飲、活力多醣飲 |
| 3 盒一組 | 科技燕窩全能飲 |
| 1 盒一組 | SuperNutri YouthFountain D 青春源汰淨、SuperNutri YouthFountain R 青春源煥活、SuperNutri YouthFountain P 青春源倍護 |

### 任搭規則

| 規則 | 可選品項 |
|---|---|
| 4 盒任搭為 1 組 | 蔓越莓私密對策、攝護力、衛樂寧、極光白賦美EX、艾康敏益生菌、多采益生菌EX、活力BB EX |
| 7 盒任搭為 1 組 | 超易視晶亮葉黃素、小心甘EX、馬卡活力久EX、艾立眠EX |

### 限時活動與專案優惠

| 類型 | 內容 | 記錄方式建議 |
|---|---|---|
| 限時活動 | 晚安纖姿飲、美妍賦活飲、龜鹿關鍵飲、白金版賦活飲等效期品項與贈品 | 放在 `redemptionPromotions`，用 notes 記錄效期與贈品 |
| 專案優惠 | D/R/P 青春源組合搭配美妍賦活飲或 DSK 禮包 | 放在 `redemptionBundles`，需標記扣幾組 |
| 已執行紀錄 | 2026-07-01：D*3 + R*3 組合扣 1 組，已給 2 罐 D + 2 罐 R，另有 B 群、珍珠粉等 | 可轉成第一筆 `redemptionRecord` |

### 架構影響

原本簡化模型假設：

```ts
boxesPerSet: number;
```

裔甯的實際配置不適合只用單一 `boxesPerSet`，因為不同商品與套組有不同「幾盒一組」規則，且部分專案優惠不是用盒數直接換算組數。

建議改為：

```ts
type PackagePlan = {
  planName: string;
  totalCredits: number;
  creditUnitLabel: "組";
  redemptionRules: RedemptionRule[];
  bundles?: RedemptionBundle[];
  promotions?: RedemptionPromotion[];
};

type RedemptionRule = {
  id: string;
  label: string;
  mode: "fixed_quantity" | "mix_and_match" | "single_item";
  creditCost: number;
  quantityPerRedemption: number;
  productIds: string[];
};

type RedemptionBundle = {
  id: string;
  label: string;
  creditCost: number;
  items: Array<{ productId: string; quantity: number }>;
  bonusItems?: Array<{ name: string; quantity: number; notes?: string }>;
  notes?: string;
};
```

## Products 資料來源

來源檔案：`C:\Users\pts15\Desktop\COLORFUL_CATALOG_2026.pdf`

萃取範圍：

- 只保留保健食品相關品項。
- 只整理三欄：品項、規格、主要功效。
- 排除保養品、儀器設備、以及只有搭配建議但沒有獨立規格的組合推薦。
- 主要功效以短句摘要，不逐字搬產品頁文案。

| 品項 | 規格 | 主要功效 |
|---|---:|---|
| YouthFountain 青春源-汰淨 Delete | 90 錠 / 瓶 | 清除老廢細胞、抗氧化、幫助代謝與健康維持 |
| YouthFountain 青春源-煥活 Reborn | 90 錠 / 瓶 | 細胞修復、活化體力、抗老保養 |
| YouthFountain 青春源-倍護 Protect | 90 錠 / 瓶 | 免疫防護、抗氧化、維持健康防線 |
| 科技燕窩美妍賦活飲 | 10 包 / 盒，每包 30ml；另有 7 包 / 盒，每包 25ml | 美顏保養、膠原補充、氣色與肌膚水潤 |
| 科技燕窩晚安纖姿飲 | 10 包 / 盒，每包 30ml；另有 7 包 / 盒，每包 25ml | 睡眠、代謝、排便順暢、體態管理 |
| 科技燕窩全能飲 | 50ml / 包，8 包 / 盒 | 美妍活力、防護升級、思緒清晰 |
| 智明靈光飲 | 7 包 / 盒，每包 25ml；另有 10 包 / 盒，每包 30ml | 專注力、記憶力、眼睛保健、思緒清晰 |
| 活力多醣飲 | 7 包 / 盒，每包 25ml | 免疫力、呼吸道保養、元氣補充 |
| Magic So 超能速纖 | 沖泡粉包，15 包 / 盒 | 補水、代謝、排便順暢、體態控制 |
| Magic So 動動爆燃 | 錠劑，60 錠 / 盒 | 運動燃燒、體力補充、代謝效率 |
| Magic So 黃金比例 3:8 | 膠囊，60 粒 / 盒 | 餐前體態管理、降低食慾、脂肪代謝 |
| Magic So 閃澱油切 | 膠囊，60 粒 / 盒 | 油脂吸附、降低澱粉吸收、飯後負擔管理 |
| Magic So 美妍纖姿凍 | 果凍，10 包 / 盒 | 排空清暢、降低熱量吸收、餐前急救 |
| DoubleS 科技營養餐 | 沖泡粉，每包 35g，10 包 / 盒 | 代餐、飽足感、體重管理 |
| DoubleS 科技營養餐 經典濃醇可可 | 每包 35g，10 包 / 盒 | 輕卡路里代餐、每份 15g 蛋白質、飽足感、熱量控制 |
| DoubleS 科技營養餐 日式海鮮濃湯 | 每包 35g，10 包 / 盒 | 輕卡路里代餐、每份 15g 蛋白質、飽足感、鹹口味替代餐 |
| 膠原關鍵穩 EX | 膠囊，30 粒 / 盒 | 關節保養、軟骨修護、減緩磨損 |
| 龜鹿膠原關鍵飲 | 飲品，每包 25ml，7 包 / 盒 | 關節保養、行動力、筋骨支持 |
| 極光白賦美 EX | 錠劑，90 錠 / 瓶 | 美白、淡斑、抗氧化、肌膚透亮 |
| 御賞珍珠粉 | 膠囊，60 粒 / 盒 | 肌膚光澤、氣色、女性日常滋養 |
| 蔓越莓私密對策 | 粉包，30 包 / 盒 | 女性私密保養、舒緩異味、維持菌叢平衡 |
| 艾立眠 EX | 膠囊，30 粒 / 盒 | 睡眠品質、放鬆、精神恢復 |
| 紅麴活力循 EX | 膠囊，30 粒 / 盒 | 心血管循環、血脂血壓管理 |
| 納豆紅麴 Q10 複方 / 素食版活力循 | 膠囊，60 粒 / 盒 | 血脂、血壓、循環代謝保養 |
| 頂級高濃度魚油 | 軟膠囊，60 粒 / 瓶 | Omega-3 補充、腦部、視力、心血管保養 |
| 葉黃素 EX | 膠囊，30 粒 / 盒 | 眼睛保健、黃斑部保養、視覺疲勞 |
| 多采益生菌 EX | 粉包，30 包 / 盒 | 腸道菌叢、排便順暢、消化機能 |
| 艾康敏益生菌 | 膠囊，30 粒 / 盒 | 過敏體質調整、免疫平衡、呼吸道保養 |
| 樂高成長飲 | 飲品，每包 25ml，7 包 / 盒 | 兒童成長、骨骼發育、營養補充 |
| 法國 DHA 植物藻油 | 植物膠囊，30 粒 / 盒 | DHA 補充、記憶力、學習力、視覺功能 |
| 小心甘 EX | 膠囊，30 粒 / 盒 | 肝臟保養、疲勞恢復、代謝排毒 |
| 馬卡活力久 EX | 膠囊，30 粒 / 盒 | 男性活力、體力、耐力與精神 |
| 清醇活循飲 | 飲品，10 包 / 盒，每包 30ml | 三高保養、循環代謝、油脂代謝 |
| 攝護力 EX | 膠囊，60 粒 / 盒 | 男性攝護腺保養、泌尿順暢 |
| 活力 BB EX | 錠劑，90 粒 / 盒 | B 群補充、精神體力、代謝與氣色 |
| 鈣鎂鋅 EX | 錠劑，90 粒 / 盒 | 骨骼牙齒、鈣鎂鋅補充、睡眠與免疫支持 |
| 衛樂寧 | 0.5 公克 / 粒，60 粒 / 盒 | 消化道保養、維持黏膜健康、餐後消化與代謝支持 |

### 後續轉成 `products` 時的建議欄位

```ts
type Product = {
  id: string;
  name: string;
  specification: string;
  primaryBenefits: string;
  isAvailable: boolean;
};
```

備註：

- `id` 後續再統一命名，不先硬切。
- `isAvailable` 由開發者整理 seed data 時設定，正式資料存在 Supabase。
- 若學生端只需要查看，不需要商品分類，`category` 可以延後或不放。

## Product Images 資料來源

來源資料夾：`C:\Users\pts15\Desktop\康樂富產品圖\`

目前共有 34 張產品圖，格式皆為 `.jpg`。這批圖片可作為後續產品型錄頁與兌換選擇頁的視覺素材來源。

### 圖片檔案清單

| 圖片檔名 | 對應品項備註 |
|---|---|
| `B群.jpg` | 活力 BB EX |
| `D.jpg` | YouthFountain 青春源-汰淨 Delete |
| `P.jpg` | YouthFountain 青春源-倍護 Protect |
| `Q10.jpg` | 納豆紅麴 Q10 |
| `R.jpg` | YouthFountain 青春源-煥活 Reborn |
| `全能飲.jpg` | 科技燕窩全能飲 |
| `動動爆燃.jpg` | Magic So 動動爆燃 |
| `可可蛋白粉.jpg` | DoubleS 科技營養餐 經典濃醇可可 |
| `多醣飲.jpg` | 活力多醣飲 |
| `多采益生菌.jpg` | 多采益生菌 EX |
| `小心甘.jpg` | 小心甘 EX |
| `攝護力.jpg` | 攝護力 EX |
| `植物魚油.jpg` | 法國 DHA 植物藻油 |
| `樂高成長飲.jpg` | 樂高成長飲 |
| `活力循(顆粒).jpg` | 紅麴活力循 EX |
| `活循飲(液態).jpg` | 清醇活循飲 |
| `海鮮濃湯蛋白粉.jpg` | DoubleS 科技營養餐 日式海鮮濃湯 |
| `白賦美.jpg` | 極光白賦美 EX |
| `私密對策.jpg` | 蔓越莓私密對策 |
| `美妍纖姿凍.jpg` | Magic So 美妍纖姿凍 |
| `美妍賦活飲.jpg` | 科技燕窩美妍賦活飲 |
| `艾康敏益生菌.jpg` | 艾康敏益生菌 |
| `艾立眠.jpg` | 艾立眠 EX |
| `葉黃素.jpg` | 葉黃素 EX / 超易視晶彩葉黃素，需統一命名 |
| `衛樂寧.jpg` | 衛樂寧 |
| `鈣鎂鋅.jpg` | 鈣鎂鋅 EX |
| `閃電油切.jpg` | Magic So 閃澱油切，需統一檔名或建立 alias |
| `關節穩.jpg` | 膠原關鍵穩 EX |
| `靈光飲.jpg` | 智明靈光飲 |
| `馬卡.jpg` | 馬卡活力久 EX |
| `魚油(排裝).jpg` | 頂級高濃度魚油，排裝版 |
| `魚油(罐裝).jpg` | 頂級高濃度魚油，罐裝版 |
| `黃金比例3比8.jpg` | Magic So 黃金比例 3:8 |
| `龜鹿飲.jpg` | 龜鹿膠原關鍵飲 |

### 後續轉成 `products` 時的建議欄位

```ts
type Product = {
  id: string;
  name: string;
  specification: string;
  primaryBenefits: string;
  imageSrc?: string;
  imageAlt?: string;
  imageAliases?: string[];
  isAvailable: boolean;
};
```

### 命名與整理原則

- 圖片檔案建議後續複製到專案內，例如 `public/products/`，避免 App 直接依賴桌面路徑。
- `imageSrc` 應使用專案內相對路徑，例如 `/products/magic-so-burning-body.jpg`。
- 原始中文檔名可保留在資料來源章節，但正式專案檔名建議改成穩定英文 slug。
- 若同一品項有不同包裝，例如魚油排裝 / 罐裝，應在資料中標記 `variant` 或 `imageAliases`。
- 若圖片檔名與商品名不一致，例如 `閃電油切` vs `閃澱油切`，先建立對照，不直接改原始檔。

### 已確認命名對照

- `D.jpg` 對應 `YouthFountain 青春源-汰淨 Delete`
- `R.jpg` 對應 `YouthFountain 青春源-煥活 Reborn`
- `P.jpg` 對應 `YouthFountain 青春源-倍護 Protect`
- `閃電油切.jpg` 對應正式品名 `Magic So 閃澱油切`
- `葉黃素.jpg` 對應正式品名 `超易視晶彩葉黃素`

### 待補型錄資料

以下品項目前有圖片或出現在裔甯配置清單中，但尚未從 `COLORFUL_CATALOG_2026.pdf` 萃取到完整三欄資料。後續需要補齊：

| 品項 | 需要補的型錄資料 |
|---|---|
| 可可蛋白粉 | 已補：DoubleS 科技營養餐 經典濃醇可可；每包 35g，10 包 / 盒；輕卡路里代餐、每份 15g 蛋白質、飽足感、熱量控制 |
| 海鮮濃湯蛋白粉 | 已補：DoubleS 科技營養餐 日式海鮮濃湯；每包 35g，10 包 / 盒；輕卡路里代餐、每份 15g 蛋白質、飽足感、鹹口味替代餐 |
| 衛樂寧 | 已補：0.5 公克 / 粒，60 粒 / 盒；消化道保養、維持黏膜健康、餐後消化與代謝支持 |

補齊後即可納入 `products`：

```ts
{
  id: string;
  name: string;
  specification: string;
  primaryBenefits: string;
  imageSrc?: string;
  isAvailable: boolean;
}
```

### DoubleS 產品線備註

`可可蛋白粉` 與 `海鮮濃湯蛋白粉` 建議在正式資料中視為同一產品線 `DoubleS 科技營養餐` 的兩個口味變體，而不是完全獨立的兩種資料模型。

```ts
type ProductVariant = {
  id: string;
  productId: string;
  flavor: string;
  imageSrc?: string;
  featureIngredients?: string[];
};
```

建議呈現方式：

- 型錄頁可以顯示為兩張產品卡，讓學生容易選。
- 資料模型上可用同一個 `series` 或 `productLine` 標記為 `DoubleS 科技營養餐`。
- 共通功效：輕卡路里代餐、每份 15g 蛋白質、飽足感、熱量控制。
- 差異重點：經典濃醇可可是甜口味；日式海鮮濃湯是鹹口味。
