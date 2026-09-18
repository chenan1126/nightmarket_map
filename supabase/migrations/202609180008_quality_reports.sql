-- 資料品質回報 MVP：先支援正式攤位，後續可擴充至夜市與提案。
create type public.quality_report_reason as enum (
  'incorrect', 'duplicate', 'relocated', 'closed', 'inappropriate'
);

create type public.quality_report_status as enum (
  'pending', 'in_review', 'needs_evidence', 'confirmed', 'rejected'
);

create table public.quality_reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null default 'stall' check (target_type = 'stall'),
  stall_id uuid not null references public.stalls(id) on delete restrict,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  reason public.quality_report_reason not null,
  description text not null check (length(btrim(description)) between 1 and 2000),
  source_url text not null check (source_url ~* '^https?://[^[:space:]]+$'),
  status public.quality_report_status not null default 'pending',
  decision_reason text,
  decided_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint quality_reports_pending_decision_fields_check check (
    status in ('pending', 'in_review')
    or (decided_by is not null and decided_at is not null)
  )
);

create index quality_reports_stall_idx on public.quality_reports (stall_id, submitted_at desc);
create index quality_reports_status_idx on public.quality_reports (status, submitted_at asc);
create index quality_reports_submitter_idx on public.quality_reports (submitted_by, submitted_at desc);

create trigger quality_reports_set_updated_at
before update on public.quality_reports
for each row execute function private.set_updated_at();

alter table public.audit_events drop constraint if exists audit_events_entity_type_check;
alter table public.audit_events add constraint audit_events_entity_type_check
  check (entity_type in ('market', 'stall', 'proposal', 'proposal_source', 'quality_report'));

alter table public.quality_reports enable row level security;
revoke all on public.quality_reports from anon, authenticated;

grant select (id, target_type, stall_id, reason, description, source_url, status,
  decision_reason, submitted_at, decided_at)
  on public.quality_reports to authenticated;

create policy quality_reports_member_read_own on public.quality_reports
for select to authenticated
using (
  submitted_by = (select auth.uid())
  and (select auth.jwt() ->> 'is_anonymous') = 'false'
);

create policy quality_reports_moderator_read_all on public.quality_reports
for select to authenticated
using (
  exists (
    select 1 from public.profiles pr
    where pr.user_id = (select auth.uid())
      and pr.role in ('moderator', 'admin')
  )
);

-- The browser may only create a report through the validation and rate-limit
-- RPC below. No direct insert or update policy is granted.
create or replace function public.submit_quality_report(
  p_stall_id uuid,
  p_reason public.quality_report_reason,
  p_description text,
  p_source_url text
)
returns table (id uuid, status public.quality_report_status, submitted_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  description_value text := nullif(btrim(p_description), '');
  source_value text := nullif(btrim(p_source_url), '');
  recent_count integer;
  inserted_row public.quality_reports;
begin
  if actor is null then
    raise exception 'authentication required';
  end if;
  if description_value is null or length(description_value) > 2000 then
    raise exception 'description is required and must be at most 2000 characters';
  end if;
  if source_value is null or source_value !~* '^https?://[^[:space:]]+$' then
    raise exception 'a valid source URL is required';
  end if;
  if not exists (
    select 1 from public.stalls s
    where s.id = p_stall_id and s.status = 'active'
  ) then
    raise exception 'stall is not an active public stall';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor::text, 18008)
  );
  select count(*)::integer into recent_count
  from public.quality_reports qr
  where qr.submitted_by = actor
    and qr.submitted_at >= now() - interval '1 hour';
  if recent_count >= (
    case when (auth.jwt() ->> 'is_anonymous') = 'true' then 5 else 20 end
  ) then
    raise exception 'quality report rate limit exceeded; try again later';
  end if;

  insert into public.quality_reports (
    stall_id, submitted_by, reason, description, source_url
  ) values (
    p_stall_id, actor, p_reason, description_value, source_value
  ) returning * into inserted_row;

  return query select inserted_row.id, inserted_row.status, inserted_row.submitted_at;
end;
$$;

create or replace function public.moderate_quality_report(
  p_report_id uuid,
  p_status public.quality_report_status,
  p_decision_reason text default null
)
returns table (
  id uuid, status public.quality_report_status, decision_reason text,
  decided_by uuid, decided_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  current_row public.quality_reports;
  updated_row public.quality_reports;
  reason text := nullif(btrim(p_decision_reason), '');
begin
  if actor is null or (auth.jwt() ->> 'is_anonymous') <> 'false' then
    raise exception 'permanent member authentication required';
  end if;
  if not exists (
    select 1 from public.profiles pr
    where pr.user_id = actor and pr.role in ('moderator', 'admin')
  ) then
    raise exception 'moderator or admin role required';
  end if;
  if p_status in ('needs_evidence', 'confirmed', 'rejected') and reason is null then
    raise exception 'decision reason is required for this status';
  end if;
  select qr.* into current_row from public.quality_reports qr
  where qr.id = p_report_id for update;
  if not found then raise exception 'quality report not found'; end if;

  update public.quality_reports qr
  set status = p_status,
      decision_reason = reason,
      decided_by = case when p_status in ('pending', 'in_review') then null else actor end,
      decided_at = case when p_status in ('pending', 'in_review') then null else now() end
  where qr.id = p_report_id
  returning qr.* into updated_row;

  insert into public.audit_events (
    entity_type, entity_id, action, actor_user_id,
    before_json, after_json, reason
  ) values (
    'quality_report', p_report_id, 'moderate', actor,
    to_jsonb(current_row), to_jsonb(updated_row), reason
  );

  return query select updated_row.id, updated_row.status,
    updated_row.decision_reason, updated_row.decided_by, updated_row.decided_at;
end;
$$;

revoke all on function public.submit_quality_report(uuid, public.quality_report_reason, text, text) from public, anon;
grant execute on function public.submit_quality_report(uuid, public.quality_report_reason, text, text) to authenticated;
revoke all on function public.moderate_quality_report(uuid, public.quality_report_status, text) from public, anon;
grant execute on function public.moderate_quality_report(uuid, public.quality_report_status, text) to authenticated;
