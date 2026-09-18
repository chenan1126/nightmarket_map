-- 採用攤位提案時，以單一 moderator-only transaction 建立正式攤位。
-- 夜市提案暫不支援自動採用，避免把未查核提案寫入 markets。

create unique index if not exists stalls_market_name_unique
on public.stalls (market_id, lower(btrim(name)));

drop function if exists public.moderate_proposal(uuid, public.proposal_status, text);

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
  adopted_stall public.stalls;
  reason text := nullif(btrim(p_decision_reason), '');
  stall_name text;
  stall_location_note text;
  stall_category text;
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

  if p_status = 'adopted' and current_row.kind = 'market' then
    raise exception 'market proposal adoption requires a separate market onboarding workflow';
  end if;

  if p_status = 'adopted' and current_row.kind = 'stall' then
    if current_row.market_id is null then
      raise exception 'stall proposal must reference a market';
    end if;

    stall_name := nullif(btrim(current_row.payload ->> 'name'), '');
    stall_location_note := nullif(btrim(current_row.payload ->> 'location_note'), '');
    stall_category := nullif(btrim(current_row.payload ->> 'category'), '');
    if stall_name is null then
      raise exception 'stall proposal is missing a name';
    end if;

    insert into public.stalls (market_id, name, location_note, category, status)
    values (current_row.market_id, stall_name, stall_location_note, stall_category, 'active')
    on conflict do nothing;

    select s.* into adopted_stall
    from public.stalls as s
    where s.market_id = current_row.market_id
      and lower(btrim(s.name)) = lower(stall_name)
    order by s.created_at asc
    limit 1
    for update;

    if not found then
      raise exception 'formal stall could not be created';
    end if;
  end if;

  update public.proposals as p
  set status = p_status,
      adopted_stall_id = case
        when p_status = 'adopted' and current_row.kind = 'stall' then adopted_stall.id
        else p.adopted_stall_id
      end,
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

  if p_status = 'adopted' and current_row.kind = 'stall' then
    insert into public.audit_events (
      entity_type, entity_id, action, actor_user_id,
      before_json, after_json, reason
    ) values (
      'stall', adopted_stall.id, 'created_from_adopted_proposal', actor,
      null, to_jsonb(adopted_stall), reason
    );
  end if;

  return query select updated_row.id, updated_row.status,
    updated_row.decision_reason, updated_row.decided_by, updated_row.decided_at;
end;
$$;

revoke all on function public.moderate_proposal(uuid, public.proposal_status, text) from public, anon;
grant execute on function public.moderate_proposal(uuid, public.proposal_status, text) to authenticated;
