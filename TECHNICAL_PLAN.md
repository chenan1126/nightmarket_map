# 夜市地圖：社群資料功能技術可行性勘查

更新：2026-09-18

## 結論

目前 Web 是 React + Vite 的靜態站：`npm run build` 產生 `dist`，`.openai/hosting.json` 只部署 `dist`，沒有 API、伺服器端程式、資料庫或帳號服務。現有 `public/data/night-markets.json` 是編譯時載入的唯讀快照，因此無法直接支援跨使用者投稿、表決或星評。

第一版採用 **Supabase（Postgres + Auth + Row Level Security）**。它和靜態 Vite 的邊界清楚，前端可直接使用公開的 project URL / publishable key，資料安全由資料庫 RLS 控制；投稿與投票也能用唯一約束保證「一帳號一票」與「一帳號一攤位一筆星評」。目前三個 migrations 已部署，86 筆名錄已匯入並標為 `needs_review`；Cloudflare Turnstile 與 Anonymous Sign-Ins 已在 Supabase Auth 啟用。

Firebase 是可行的第二選擇（Firestore Rules、Firebase Auth、App Check），但查詢提案與歷史版本時資料模型較分散；自建 API / PostgreSQL 在目前只有靜態 hosting 的條件下會增加主機、密鑰、部署與維運工作。試行規模不需要為了效能引入更複雜的架構。

## 建議資料模型

正式名錄仍可由政府快照匯入；社群資料以穩定 ID 對應既有夜市，並保留來源與歷史。建議最小表如下：

| 表 | 主要欄位與約束 | 用途 |
| --- | --- | --- |
| `markets` | `id`, `name`, `city`, `district`, `address`, `latitude`, `longitude`, `status`, `source_url`, `source_date` | 將目前 JSON 快照移入可被提案引用的正式名錄（可先唯讀匯入） |
| `stalls` | `id`, `market_id`, `name`, `location_note`, `category`, `status` | 正式攤位資料；`market_id` 外鍵連到夜市 |
| `proposals` | `id`, `kind` (`market`/`stall`), `market_id`, `payload`（或明確欄位）, `source_url NOT NULL`, `source_title`, `status`, `submitted_at`, `decided_at`, `decision_reason` | 待補資料、討論中、已採用、未採用的提案；建立時即要求一筆來源 |
| `proposal_sources` | `proposal_id`, `url`, `title`, `captured_at`, `note` | 已建立提案的補充來源；首筆必要來源不放在這張獨立表，避免匿名雙表寫入不具原子性 |
| `proposal_votes` | `proposal_id`, `user_id`, `choice` (`support`/`oppose`/`needs_evidence`), `created_at`, `updated_at`; `unique(proposal_id,user_id)` | 登入會員的一票，可修改選擇 |
| `stall_ratings` | `stall_id`, `user_id`, `stars` 1–5, `created_at`, `updated_at`; `unique(stall_id,user_id)` | 與提案表決分開的一攤一筆星評，可修改 |
| `audit_events` | `entity_type`, `entity_id`, `action`, `actor_user_id`, `before_json`, `after_json`, `reason`, `created_at` | 提案狀態、決策與正式資料修正的追溯紀錄 |
| `profiles` | `user_id`, `role` (`member`/`moderator`/`admin`), `created_at` | 管理員與在地協作者權限；不把前端傳入的 role 當成可信來源 |

`payload` 可以讓夜市和攤位共用提案表，但採用時必須由受信任的管理流程驗證欄位、去重並寫入 `markets` / `stalls`。`source_url NOT NULL`、URL 格式檢查和 `proposals` insert 必須在同一次資料庫交易中完成；第一版可讓匿名 Auth user 直接 insert `proposals`，也可改由受保護 RPC / Edge Function 以單一 transaction 建立提案與補充資料。不要讓瀏覽器先寫 `proposals` 再另寫必要來源，否則會留下沒有來源的提案。不要把任意 HTML 直接渲染為內容。

## 權限與 RLS 草案

Supabase Auth 負責會員登入（第一版可用 email magic link，之後再開 Google 等 OAuth）。Supabase 也支援 `signInAnonymously()`：訪客在沒有登入 UI 或個資的情況下取得暫時 Auth user，呼叫資料庫 API 時仍使用 `authenticated` role，JWT 的 `is_anonymous` claim 可在 RLS 區分匿名與永久會員。前端只取得 `anon` key；service role key 絕不放進 Vite bundle、`public` 或 `.openai/hosting.json`。

- `markets`、`stalls`：公開讀取；只有管理員/協作者可新增、採用後更新或標記停業。
- `proposals`：公開讀取已公開狀態；匿名 Auth user 或受保護 RPC 可 `insert`，且資料庫檢查 `source_url IS NOT NULL`；一般會員可補充自己提交的資料或新增補充來源；協作者/管理員可改狀態、決策理由與正式資料。若直接讓匿名 Auth user insert，需以 `is_anonymous = true` 的 restrictive RLS policy 限制欄位與頻率。
- `proposal_sources`：公開讀取；只作為已建立提案的補充來源。匿名投稿的第一筆來源隨 `proposals.source_url` 原子寫入；後續補充來源由協作者或永久會員透過 policy / RPC 新增，來源不能被一般會員任意刪除，改動寫入 `audit_events`。
- `proposal_votes`：只允許 `is_anonymous` 為 false 的 authenticated user 寫入自己的 `user_id`，並依資料庫唯一鍵 upsert；匿名 Auth user 明確禁止表決。使用者可讀寫自己的票，公開彙總票數可透過 view 或安全 RPC 提供，避免暴露不必要的帳號資料。
- `stall_ratings`：只允許 `is_anonymous` 為 false 的 authenticated user 寫入自己的 `user_id`、`stars` 1–5；唯一鍵確保一攤一筆；匿名 Auth user 明確禁止星評，公開只提供平均值與人數的彙總。
- `audit_events`：一般使用者不可修改或刪除；由 trigger / RPC / 受保護的管理流程寫入，協作者可讀取相關紀錄。

表決票數不應直接在瀏覽器累加後寫回提案。用資料庫 view 聚合，或由受保護 RPC 在狀態變更時重新計算；自動通過門檻暫不設定，先呈現票型、來源和異議給協作者決定。

## 免登入投稿的身分與濫用控制

建議採用 Supabase Anonymous Sign-Ins 作為第一版的「免登入」投稿身分：使用者不必看到登入或填寫個資，但前端在送出前呼叫 `supabase.auth.signInAnonymously()`，把暫時 user ID 和投稿綁定。官方文件指出匿名 user 會使用 `authenticated` role，並可用 `auth.jwt()->>'is_anonymous'` 在 RLS 中區分；這比完全沒有 session 的 `anon` key 更容易限制投稿者自己的資料。它不是可恢復帳號：登出、清除瀏覽資料或換裝置後，使用者無法取回該匿名 user。因此提案仍須是公開可查的，若要管理自己的提案應提供轉為 email/OAuth 身分的流程。表決和星評一律要求 `is_anonymous = false`。

免登入仍是低門檻入口，匿名 user 也可以被大量建立，不能把 Auth user ID 當成人類驗證；建議按成本由低到高逐步加入：

1. 前端與資料庫端都驗證名稱、位置描述、來源 URL、文字長度與 `kind`；來源必填，拒絕空白、非 HTTP(S) 或明顯腳本內容。
2. 開啟 Anonymous Sign-Ins 時使用已啟用的 Cloudflare Turnstile，前端取得 token，交由 Supabase Auth 在匿名登入時於伺服器端驗證。已登入匿名身分持續投稿時不會重新觸發登入驗證，須觀察濫用情況。
3. 資料庫已限制每個匿名身分每小時最多 3 筆提案。此限制無法阻止同一人建立多個匿名身分；若實際濫用出現，再評估 IP hash、提交 token、來源網域與時間窗等控制。IP hash 需設定保存期限，並在隱私政策說明用途。
4. 對相同夜市、相似名稱與鄰近位置做去重提示，保留 `duplicate_of` 或合併標記，避免重複建檔。
5. 新投稿進入 `pending`，不可直接出現在正式地圖；提供檢舉、暫停與管理員封鎖來源的能力。疑似垃圾內容只顯示給審核者或進入待補資料。

這些措施只能降低垃圾投稿，不能證明來源真實。來源查證與採用理由仍由公開提案頁和協作者流程負責。Supabase 官方也提醒 Anonymous Sign-Ins 要搭配 CAPTCHA 防止濫用，且匿名 user 與一般會員同樣受 RLS 保護；本計畫的關鍵是額外檢查 `is_anonymous`，避免把匿名 user 誤當成可表決會員。

官方依據：[Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous)、[Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)、[JWT Claims Reference](https://supabase.com/docs/guides/auth/jwt-fields)。

## 前端整合工作

可在 repo 先完成的工作：

- 建立 `src/lib/supabaseClient.js`，以 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY` 初始化；未設定時保留目前唯讀快照與清楚的功能未啟用狀態。
- 把新增夜市／攤位表單接到單一 `proposals` insert（`source_url` 必填）或受保護 RPC / Edge Function transaction；`proposal_sources` 只承接後續補充來源，以 Zod 驗證，成功後顯示提案 ID / URL 和 `pending` 狀態。
- 新增夜市或縣市的提案列表、來源、票型、討論/補證據入口，以及登入提示；提案內容不得混入正式 `markets` / `stalls`。
- 加入 Anonymous Sign-In 投稿、永久會員 magic-link 登入登出、session 載入與錯誤/逾時狀態；只有 `is_anonymous = false` 的會員可對同一提案 upsert 一票、對同一攤位 upsert 星等。
- 用彙總 query 顯示贊成、反對、需補證據、平均星數與評價人數；不在前端假設通過門檻。
- 建立管理/協作者畫面或先用 Supabase Dashboard 處理提案狀態，採用時寫入 audit；補上來源版本與決策理由。
- 為 `npm run build` 增加未設定環境變數的 fallback，並在部署前測試 mobile width、登入回跳與直接開啟提案連結。

需要使用者提供或在外部服務完成的工作：

- 驗證現有 CAPTCHA 與每身分限流下的實際匿名投稿流程。
- 決定永久會員登入方式並完成 email 寄信；目前本機 redirect URL 為 `http://localhost:5173`，正式網域尚未決定。若用 Google 等 OAuth，還需設定 OAuth provider 的 client ID/secret。
- 決定正式網域及 Supabase Auth allowed URLs；目前 hosting 設定只有靜態 `dist` 目錄，需在部署平台設定 `VITE_*` build-time environment variables。
- Turnstile site key 已放在本機未追蹤的 `.env.local`，secret key 已設於 Supabase Auth CAPTCHA；正式部署須在平台設定公開 site key，並在 Cloudflare widget 增加正式網域。
- 指派 `moderator` / `admin`，確認誰處理中壢與中原的久候、重複和爭議提案；這是營運決策，不應由前端預設。

## 部署與資料依賴

目前 `.openai/hosting.json` 可繼續部署靜態前端；它不會提供資料庫或安全後端。建置時可公開 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`，但所有資料庫權限必須由 RLS 限制。若使用 Turnstile secret、服務角色金鑰或管理匯入，必須放在 Supabase Edge Function / CI secret，不可放在 repo 或靜態檔案。

正式導入已完成一次 snapshot-to-Postgres 匯入，保留原始來源 URL、座標與穩定 `external_id`，並讓現有 JSON 仍可作為故障時的唯讀 fallback。資料庫 schema、RLS policy、seed / import script 已以 migration 形式納入 repo。

最低可行部署依賴是：email 寄信設定、hosting 平台的公開 build env（Supabase URL、publishable key、Turnstile site key）、正式網域和一名管理員。Anonymous Sign-Ins 已開啟；Turnstile 與每匿名身分每小時 3 筆的限制已配置，仍須驗證實際投稿流程與濫用風險。

## 建議試行順序

1. 在 repo 維護 schema migration、型別/驗證、前端 feature flag 與唯讀 fallback；不直接把待複核資料當成正式名錄。
2. 以永久測試帳號驗證 Auth、RLS 和提案/星評流程；目前遠端已確認 86 筆 markets、proposals 為 0，內部帳號欄位不可由公開 REST 讀取。
3. 確認 Anonymous Sign-Ins 開啟後，驗證：匿名投稿與來源一起持久保存；`is_anonymous = true` 不能投票/評星；永久會員同帳號重投只更新原票；一般會員不能改狀態或 audit。
4. 部署 staging，觀察投稿重複率、來源可查性、平均等待時間和垃圾內容，再決定表決期限與採用門檻。
5. 試行穩定後才把相同流程開放到其他縣市，並定期匯入或人工核對政府快照。

這個方案能先把靜態名錄和社群提案解耦，保留目前頁面可運作；真正的跨使用者資料、登入、票數唯一性和決策追溯則由 Supabase schema / RLS 提供。遠端 schema、seed 與公開 REST 權限已驗證；永久會員登入、投稿流程和跨瀏覽器同步仍需測試。

目前 repo 已完成前端可選整合：首頁可直接提交新增夜市，夜市頁可提交攤位提案；提案來源、狀態與資料庫維護的表決彙總會顯示在列表。星評只在管理流程將提案標為 `adopted` 並填入 `adopted_stall_id` 後出現。`scripts/generate-markets-seed.mjs` 可將現有 86 筆 JSON 以 `external_id` 產生可重複執行的 `needs_review` seed SQL。遠端已部署 migrations 與 seed；Anonymous Sign-Ins、正式 redirect 網域和永久會員跨瀏覽器驗證仍待決定或測試。
