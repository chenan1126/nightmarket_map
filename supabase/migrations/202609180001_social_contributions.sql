-- 夜市地圖社群資料第一版
-- 預期以 Supabase CLI / SQL editor 執行；本 repo 不在 migration 中連線外部 project。
-- 管理員採用提案、寫入 audit_events、修改 markets/stalls 的流程尚未開放給瀏覽器。

create extension if not exists pgcrypto;
create schema if not exists private;

create type public.proposal_kind as enum ('market', 'stall');
create type public.proposal_status as enum ('pending', 'discussion', 'needs_evidence', 'adopted', 'rejected');
create type public.proposal_vote_choice as enum ('support', 'oppose', 'needs_evidence');
create type public.profile_role as enum ('member', 'moderator', 'admin');

create table public.markets (
  id uuid primary key default gen_random_uuid(),
  -- Existing JSON records have stable string ids. Import them here and keep
  -- the internal UUID for foreign keys between database tables.
  external_id text unique,
  name text not null check (length(btrim(name)) between 1 and 200),
  aliases text[] not null default '{}',
  city text not null check (length(btrim(city)) between 1 and 100),
  district text,
  address text,
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  status text not null default 'active' check (status in ('active', 'closed', 'relocated', 'needs_review')),
  source_url text,
  source_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stalls (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 200),
  location_note text,
  category text,
  status text not null default 'active' check (status in ('active', 'closed', 'relocated', 'needs_review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.profile_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  kind public.proposal_kind not null,
  market_id uuid references public.markets(id) on delete restrict,
  adopted_stall_id uuid references public.stalls(id) on delete set null,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  payload jsonb not null default '{}'::jsonb,
  -- The first source is on this row so a browser insert is atomic and cannot
  -- leave a proposal without its required evidence.
  source_url text not null check (source_url ~* '^https?://[^[:space:]]+$'),
  source_title text,
  status public.proposal_status not null default 'pending',
  support_count integer not null default 0 check (support_count >= 0),
  oppose_count integer not null default 0 check (oppose_count >= 0),
  needs_evidence_count integer not null default 0 check (needs_evidence_count >= 0),
  decision_reason text,
  decided_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint proposals_kind_market_check check (
    (kind = 'market' and market_id is null) or
    (kind = 'stall' and market_id is not null)
  ),
  constraint proposals_pending_decision_fields_check check (
    status <> 'pending'
    or (decision_reason is null and decided_by is null and decided_at is null)
  )
);

create table public.proposal_sources (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  url text not null check (url ~* '^https?://[^[:space:]]+$'),
  title text,
  note text,
  captured_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.proposal_votes (
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  choice public.proposal_vote_choice not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (proposal_id, user_id)
);

create table public.stall_ratings (
  stall_id uuid not null references public.stalls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (stall_id, user_id)
);

-- This view intentionally exposes only an aggregate; it never exposes voter IDs.
create view public.stall_rating_summaries
as
select stall_id, round(avg(stars)::numeric, 2) as average_stars, count(*)::integer as rating_count
from public.stall_ratings group by stall_id;

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('market', 'stall', 'proposal', 'proposal_source')),
  entity_id uuid not null,
  action text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  before_json jsonb,
  after_json jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index proposals_public_status_idx on public.proposals (status, submitted_at desc);
create index proposals_market_idx on public.proposals (market_id, submitted_at desc);
create index proposal_sources_proposal_idx on public.proposal_sources (proposal_id);
create index stalls_market_idx on public.stalls (market_id);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger markets_set_updated_at
before update on public.markets
for each row execute function private.set_updated_at();

create trigger stalls_set_updated_at
before update on public.stalls
for each row execute function private.set_updated_at();

create trigger proposals_set_updated_at
before update on public.proposals
for each row execute function private.set_updated_at();

create trigger proposal_votes_set_updated_at
before update on public.proposal_votes
for each row execute function private.set_updated_at();

create trigger stall_ratings_set_updated_at
before update on public.stall_ratings
for each row execute function private.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

-- The role column has no client write policy. This trigger creates only the
-- safe default; promotion to moderator/admin must happen outside the browser.
create or replace function private.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace function private.refresh_proposal_vote_counts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_proposal_id uuid;
begin
  target_proposal_id := case when tg_op = 'DELETE' then old.proposal_id else new.proposal_id end;
  update public.proposals p
  set support_count = (select count(*) from public.proposal_votes v where v.proposal_id = target_proposal_id and v.choice = 'support'),
      oppose_count = (select count(*) from public.proposal_votes v where v.proposal_id = target_proposal_id and v.choice = 'oppose'),
      needs_evidence_count = (select count(*) from public.proposal_votes v where v.proposal_id = target_proposal_id and v.choice = 'needs_evidence')
  where p.id = target_proposal_id;
  return null;
end;
$$;

create trigger proposal_votes_refresh_counts
after insert or update or delete on public.proposal_votes
for each row execute function private.refresh_proposal_vote_counts();

-- SECURITY INVOKER keeps the caller's authenticated role and RLS checks. The
-- explicit checks make the permanent-member and target-state requirements
-- clear even when this function is called outside the browser.
create or replace function public.cast_proposal_vote(
  p_proposal_id uuid,
  p_choice public.proposal_vote_choice
)
returns public.proposal_votes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result_row public.proposal_votes;
begin
  if auth.uid() is null or (auth.jwt() ->> 'is_anonymous') <> 'false' then
    raise exception 'permanent member authentication required';
  end if;
  if not exists (
    select 1 from public.proposals
    where id = p_proposal_id and status in ('pending', 'discussion', 'needs_evidence')
  ) then
    raise exception 'proposal is not open for voting';
  end if;

  insert into public.proposal_votes (proposal_id, user_id, choice)
  values (p_proposal_id, auth.uid(), p_choice)
  on conflict (proposal_id, user_id) do update
    set choice = excluded.choice
  returning * into result_row;
  return result_row;
end;
$$;

create or replace function public.rate_adopted_stall(
  p_stall_id uuid,
  p_stars smallint
)
returns public.stall_ratings
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result_row public.stall_ratings;
begin
  if auth.uid() is null or (auth.jwt() ->> 'is_anonymous') <> 'false' then
    raise exception 'permanent member authentication required';
  end if;
  if p_stars < 1 or p_stars > 5 then
    raise exception 'stars must be between 1 and 5';
  end if;
  if not exists (
    select 1
    from public.stalls s
    join public.proposals p on p.adopted_stall_id = s.id
    where s.id = p_stall_id and s.status = 'active' and p.status = 'adopted'
  ) then
    raise exception 'stall is not an adopted active stall';
  end if;

  insert into public.stall_ratings (stall_id, user_id, stars)
  values (p_stall_id, auth.uid(), p_stars)
  on conflict (stall_id, user_id) do update
    set stars = excluded.stars
  returning * into result_row;
  return result_row;
end;
$$;

create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function private.handle_new_user_profile();

revoke all on schema private from public, anon, authenticated;
revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.handle_new_user_profile() from public, anon, authenticated;
revoke all on function private.refresh_proposal_vote_counts() from public, anon, authenticated;
revoke all on function public.cast_proposal_vote(uuid, public.proposal_vote_choice) from public, anon;
revoke all on function public.rate_adopted_stall(uuid, smallint) from public, anon;

alter table public.markets enable row level security;
alter table public.stalls enable row level security;
alter table public.profiles enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_sources enable row level security;
alter table public.proposal_votes enable row level security;
alter table public.stall_ratings enable row level security;
alter table public.audit_events enable row level security;

-- Remove broad defaults before adding the deliberately small grants below.
revoke all on public.markets, public.stalls, public.profiles, public.proposals,
  public.proposal_sources, public.proposal_votes, public.stall_ratings,
  public.audit_events from anon, authenticated;

grant select on public.markets, public.stalls, public.proposals, public.proposal_sources to anon, authenticated;
grant select on public.profiles, public.proposal_votes, public.stall_ratings to authenticated;
grant select on public.stall_rating_summaries to anon, authenticated;
grant insert (kind, market_id, submitted_by, payload, source_url, source_title, status)
  on public.proposals to authenticated;
grant insert (proposal_id, user_id, choice), update (choice)
  on public.proposal_votes to authenticated;
grant insert (stall_id, user_id, stars), update (stars)
  on public.stall_ratings to authenticated;
grant execute on function public.cast_proposal_vote(uuid, public.proposal_vote_choice) to authenticated;
grant execute on function public.rate_adopted_stall(uuid, smallint) to authenticated;

create policy markets_public_read on public.markets
for select to anon, authenticated using (true);

create policy stalls_public_read on public.stalls
for select to anon, authenticated using (true);

create policy proposals_public_read on public.proposals
for select to anon, authenticated using (true);

create policy proposal_sources_public_read on public.proposal_sources
for select to anon, authenticated using (true);

-- Both permanent and anonymous Auth users may submit, but every direct client
-- insert is forced to pending and must carry the caller's own user id.
create policy proposals_submit_pending on public.proposals
for insert to authenticated
with check (
  submitted_by = (select auth.uid())
  and status = 'pending'
  and source_url is not null
  and (select auth.jwt() ->> 'is_anonymous') in ('true', 'false')
);

create policy profiles_read_own on public.profiles
for select to authenticated
using (user_id = (select auth.uid()));

-- Permanent members only: anonymous Auth users use authenticated role, so the
-- JWT claim must be checked explicitly in both USING and WITH CHECK.
create policy proposal_votes_read_own on public.proposal_votes
for select to authenticated
using (
  user_id = (select auth.uid())
  and (select auth.jwt() ->> 'is_anonymous') = 'false'
);

create policy proposal_votes_insert_permanent on public.proposal_votes
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select auth.jwt() ->> 'is_anonymous') = 'false'
  and exists (select 1 from public.proposals p where p.id = proposal_id and p.status in ('pending', 'discussion', 'needs_evidence'))
);

create policy proposal_votes_update_own_permanent on public.proposal_votes
for update to authenticated
using (
  user_id = (select auth.uid())
  and (select auth.jwt() ->> 'is_anonymous') = 'false'
  and exists (select 1 from public.proposals p where p.id = proposal_id and p.status in ('pending', 'discussion', 'needs_evidence'))
)
with check (
  user_id = (select auth.uid())
  and (select auth.jwt() ->> 'is_anonymous') = 'false'
  and exists (select 1 from public.proposals p where p.id = proposal_id and p.status in ('pending', 'discussion', 'needs_evidence'))
);

create policy stall_ratings_read_own on public.stall_ratings
for select to authenticated
using (
  user_id = (select auth.uid())
  and (select auth.jwt() ->> 'is_anonymous') = 'false'
  and exists (select 1 from public.stalls s join public.proposals p on p.adopted_stall_id = s.id where s.id = stall_id and s.status = 'active' and p.status = 'adopted')
);

create policy stall_ratings_insert_permanent on public.stall_ratings
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select auth.jwt() ->> 'is_anonymous') = 'false'
  and exists (select 1 from public.stalls s join public.proposals p on p.adopted_stall_id = s.id where s.id = stall_id and s.status = 'active' and p.status = 'adopted')
);

create policy stall_ratings_update_own_permanent on public.stall_ratings
for update to authenticated
using (
  user_id = (select auth.uid())
  and (select auth.jwt() ->> 'is_anonymous') = 'false'
  and exists (select 1 from public.stalls s join public.proposals p on p.adopted_stall_id = s.id where s.id = stall_id and s.status = 'active' and p.status = 'adopted')
)
with check (
  user_id = (select auth.uid())
  and (select auth.jwt() ->> 'is_anonymous') = 'false'
  and exists (select 1 from public.stalls s join public.proposals p on p.adopted_stall_id = s.id where s.id = stall_id and s.status = 'active' and p.status = 'adopted')
);

-- There are intentionally no client grants or policies for updates to
-- markets, stalls, proposals, profiles.role, proposal_sources, or audit_events.
-- Adoption and audit writes must later use a reviewed server-side process.
