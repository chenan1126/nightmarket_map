-- 修復 006 上線前已被標記 adopted 的攤位提案。
-- migration 以單一 transaction 執行；既有 proposal 先鎖定，再透過
-- 006 建立的唯一索引安全重用同夜市同名攤位，最後回填關聯。

do $$
declare
  proposal_row public.proposals;
  updated_proposal public.proposals;
  stall_row public.stalls;
  stall_name text;
  stall_location_note text;
  stall_category text;
begin
  for proposal_row in
    select p.*
    from public.proposals as p
    where p.status = 'adopted'
      and p.kind = 'stall'
      and p.adopted_stall_id is null
    order by p.decided_at nulls first, p.submitted_at
    for update
  loop
    if proposal_row.market_id is null then
      raise exception 'adopted stall proposal % has no market_id', proposal_row.id;
    end if;

    stall_name := nullif(btrim(proposal_row.payload ->> 'name'), '');
    if stall_name is null then
      raise exception 'adopted stall proposal % is missing payload.name', proposal_row.id;
    end if;

    stall_location_note := nullif(btrim(proposal_row.payload ->> 'location_note'), '');
    stall_category := nullif(btrim(proposal_row.payload ->> 'category'), '');

    insert into public.stalls (market_id, name, location_note, category, status)
    values (proposal_row.market_id, stall_name, stall_location_note, stall_category, 'active')
    on conflict do nothing;

    select s.* into stall_row
    from public.stalls as s
    where s.market_id = proposal_row.market_id
      and lower(btrim(s.name)) = lower(stall_name)
    order by s.created_at asc
    limit 1
    for update;

    if not found then
      raise exception 'could not backfill stall for adopted proposal %', proposal_row.id;
    end if;

    update public.proposals as p
    set adopted_stall_id = stall_row.id,
        updated_at = now()
    where p.id = proposal_row.id
    returning p.* into updated_proposal;

    insert into public.audit_events (
      entity_type, entity_id, action, actor_user_id,
      before_json, after_json, reason
    ) values (
      'stall', stall_row.id, 'created_from_adopted_proposal_backfill', null,
      null, to_jsonb(stall_row), 'backfill adopted stall proposal'
    );

    insert into public.audit_events (
      entity_type, entity_id, action, actor_user_id,
      before_json, after_json, reason
    ) values (
      'proposal', proposal_row.id, 'backfill_adopted_stall_id', null,
      to_jsonb(proposal_row), to_jsonb(updated_proposal), 'backfill adopted stall proposal'
    );
  end loop;
end;
$$;
