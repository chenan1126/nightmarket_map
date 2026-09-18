-- 管理審核流程 MVP
-- Only moderator/admin profiles may change a proposal's review state. The
-- browser receives a narrow result and cannot write proposals directly.

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
  reason text := nullif(btrim(p_decision_reason), '');
begin
  if actor is null or (auth.jwt() ->> 'is_anonymous') <> 'false' then
    raise exception 'permanent member authentication required';
  end if;

  if not exists (
    select 1 from public.profiles
    where user_id = actor and role in ('moderator', 'admin')
  ) then
    raise exception 'moderator or admin role required';
  end if;

  if p_status in ('needs_evidence', 'rejected') and reason is null then
    raise exception 'decision reason is required for this status';
  end if;

  select * into current_row
  from public.proposals
  where public.proposals.id = p_proposal_id
  for update;

  if not found then
    raise exception 'proposal not found';
  end if;

  update public.proposals
  set status = p_status,
      decision_reason = reason,
      decided_by = actor,
      decided_at = now()
  where public.proposals.id = p_proposal_id;

  insert into public.audit_events (
    entity_type, entity_id, action, actor_user_id,
    before_json, after_json, reason
  )
  select
    'proposal', p_proposal_id, 'moderate', actor,
    to_jsonb(current_row), to_jsonb(public.proposals), reason
  from public.proposals
  where public.proposals.id = p_proposal_id;

  return query
  select public.proposals.id, public.proposals.status,
         public.proposals.decision_reason, public.proposals.decided_by,
         public.proposals.decided_at
  from public.proposals
  where public.proposals.id = p_proposal_id;
end;
$$;

revoke all on function public.moderate_proposal(uuid, public.proposal_status, text) from public, anon;
grant execute on function public.moderate_proposal(uuid, public.proposal_status, text) to authenticated;

-- A decision reason is safe public context for a proposal's review state.
grant select (decision_reason) on public.proposals to anon, authenticated;
