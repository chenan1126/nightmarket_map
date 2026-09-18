-- CAPTCHA is checked when an anonymous Auth session is created. This trigger
-- limits the damage if a client reuses one valid anonymous session afterwards.
create or replace function private.limit_anonymous_proposals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_count integer;
begin
  if (auth.jwt() ->> 'is_anonymous') = 'true' then
    -- Serialize inserts from the same anonymous user so concurrent requests
    -- cannot both observe a count below the limit.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(auth.uid()::text, 0)
    );
    select count(*)::integer into recent_count
    from public.proposals
    where submitted_by = auth.uid()
      and submitted_at >= now() - interval '1 hour';

    if recent_count >= 3 then
      raise exception 'anonymous proposal rate limit exceeded; try again later';
    end if;
  end if;
  return new;
end;
$$;

create trigger proposals_limit_anonymous_rate
before insert on public.proposals
for each row execute function private.limit_anonymous_proposals();
