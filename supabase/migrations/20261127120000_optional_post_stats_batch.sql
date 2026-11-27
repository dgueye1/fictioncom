-- Optional feed helper. FictionCom keeps working against production without this
-- function: the client calls post_stats_batch and, if it is missing or returns
-- an unexpected shape, falls back to one post_stats call per post.
-- Safe to run more than once. Does not change existing tables or policies.

create or replace function public.post_stats_batch(targets uuid[])
returns table(post_id uuid, stats jsonb)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  t uuid;
  payload jsonb;
begin
  if targets is null then
    return;
  end if;
  foreach t in array targets loop
    payload := null;
    begin
      execute 'select to_jsonb(x) from public.post_stats($1) as x' into payload using t;
    exception when others then
      begin
        execute 'select public.post_stats($1)::jsonb' into payload using t;
      exception when others then
        payload := null;
      end;
    end;
    if payload is null or jsonb_typeof(payload) = 'null' then
      continue;
    end if;
    post_id := t;
    stats := payload;
    return next;
  end loop;
end;
$$;

revoke all on function public.post_stats_batch(uuid[]) from public;
grant execute on function public.post_stats_batch(uuid[]) to anon, authenticated;
