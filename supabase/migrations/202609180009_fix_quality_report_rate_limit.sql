-- 修正 008 在 PostgreSQL PL/pgSQL 中不合法的 CASE 條件語法。
-- 008 已保留作為歷史 migration；本 migration 只重建同名 RPC。
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

revoke all on function public.submit_quality_report(uuid, public.quality_report_reason, text, text) from public, anon;
grant execute on function public.submit_quality_report(uuid, public.quality_report_reason, text, text) to authenticated;
