-- 修正 004 管理審核 RPC 的 composite row 參照。
-- 以明確 table alias 與 PL/pgSQL row 變數寫入 audit，避免 PostgREST
-- 執行時將 public.proposals 誤解為未出現在 FROM 的限定名稱。

create or replace function public.moderate_proposal(
  p_proposal_id uuid,
  p_status public.proposal_status,
  p_decision_reason text default null
)
returns table (
  id uuid,
  status public.proposal_status,
  decision_reason text,
  decided_by uuid,
  decided_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  current_row public.proposals;
  updated_row public.proposals;
  reason text := nullif(btrim(p_decision_reason), '');
begin
  if actor is null or (auth.jwt() ->> 'is_anonymous') <> 'false' then
    raise exception 'permanent member authentication required';
  end if;

  if not exists (
    select 1 from public.profiles as pr
    where pr.user_id = actor and pr.role in ('moderator', 'admin')
  ) then
    raise exception 'moderator or admin role required';
  end if;

  if p_status in ('needs_evidence', 'rejected') and reason is null then
    raise exception 'decision reason is required for this status';
  end if;

  select p.* into current_row
  from public.proposals as p
  where p.id = p_proposal_id
  for update;

  if not found then
    raise exception 'proposal not found';
  end if;

  update public.proposals as p
  set status = p_status,
      decision_reason = reason,
      decided_by = actor,
      decided_at = now()
  where p.id = p_proposal_id
  returning p.* into updated_row;

  insert into public.audit_events (
    entity_type, entity_id, action, actor_user_id,
    before_json, after_json, reason
  ) values (
    'proposal', p_proposal_id, 'moderate', actor,
    to_jsonb(current_row), to_jsonb(updated_row), reason
  );

  return query select updated_row.id, updated_row.status,
    updated_row.decision_reason, updated_row.decided_by, updated_row.decided_at;
end;
$$;

revoke all on function public.moderate_proposal(uuid, public.proposal_status, text) from public, anon;
grant execute on function public.moderate_proposal(uuid, public.proposal_status, text) to authenticated;
