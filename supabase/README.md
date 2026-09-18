# Supabase schema

`migrations/202609180001_social_contributions.sql` 定義社群投稿的第一版資料表與 RLS。這個 repo 沒有連接任何 Supabase project，也沒有在瀏覽器中提供管理員採用流程。

`markets.id` 是資料庫內部 UUID；匯入目前 JSON 時，請把原本的穩定字串 `id` 放入 `markets.external_id`。`external_id` 有唯一約束，攤位和提案的外鍵仍使用內部 UUID，避免以字串 ID 直接承擔資料庫關聯。

可重複產生名錄 seed SQL（所有候選先標為 `needs_review`，不代表已驗證）：

```sh
node scripts/generate-markets-seed.mjs > supabase/seed-markets.sql
```

再於專用 staging project 執行產出的 SQL。它會以 `external_id` upsert，保留來源 URL；請先人工確認來源與座標，再由管理流程調整正式狀態。

## 執行與驗證

在設定好 Supabase CLI project link 後，執行：

```sh
supabase db reset
supabase db lint
```

至少用匿名 Auth user 和永久會員各驗證一次：

- 匿名 user 可以建立 `status = 'pending'` 且有 `source_url` 的提案。
- 匿名 user 建立 `discussion`、`adopted` 提案會被 RLS 拒絕。
- 匿名 user 對 `proposal_votes` 或 `stall_ratings` 的 insert/update 會被 RLS 拒絕。
- 會員票與星評的 RLS 必須要求 JWT `is_anonymous` 明確等於字串 `false`；claim 缺失也應被拒絕。
- 永久會員只能以自己的 `user_id` 新增或修改一筆提案票、一筆攤位星評。
- 票的更新只能改 `choice`，星評的更新只能改 `stars`；`user_id`、外鍵與 `created_at` 不可由 client 改寫。
- 前端使用 `cast_proposal_vote` 與 `rate_adopted_stall` 兩個 `SECURITY INVOKER` RPC；它們以 `auth.uid()` 寫入使用者、只在 `ON CONFLICT` 時更新 `choice` / `stars`，並再次檢查永久會員與目標狀態。一般角色沒有直接呼叫高權限流程。
- `markets`、`stalls`、`proposals.status`、`profiles.role`、`audit_events` 和 `proposal_sources` 沒有一般 client 的寫入政策。

可用 Supabase SQL editor 或受控測試 client 以不同 JWT 執行上述案例；不要把 service role key 放入前端。`supabase db reset` 會清除該本機資料庫，請只對本機或專用測試 project 執行。

真正的採用、審核與 audit 寫入流程要另行設計成受保護的 server-side 流程，不能為了讓前端先跑通而放寬這份 migration 的 RLS。
