-- Optional interest memory for Explore "For you".
-- FictionCom keeps working if this is not applied: dwell time stays in
-- localStorage and record_interest is ignored when the function is missing.
-- Safe to run more than once.

create table if not exists public.interest_signals (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('series', 'type', 'tag', 'author')),
  key text not null,
  dwell_ms bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, key)
);

alter table public.interest_signals enable row level security;

drop policy if exists "Members read their own interest signals" on public.interest_signals;
create policy "Members read their own interest signals"
  on public.interest_signals for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Members insert their own interest signals" on public.interest_signals;
create policy "Members insert their own interest signals"
  on public.interest_signals for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Members update their own interest signals" on public.interest_signals;
create policy "Members update their own interest signals"
  on public.interest_signals for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.record_interest(signals jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  row jsonb;
  signal_kind text;
  signal_key text;
  signal_ms bigint;
begin
  if auth.uid() is null or signals is null or jsonb_typeof(signals) <> 'array' then
    return;
  end if;
  for row in select value from jsonb_array_elements(signals) loop
    signal_kind := row->>'kind';
    signal_key := left(coalesce(row->>'key', ''), 120);
    signal_ms := least(greatest(coalesce((row->>'dwell_ms')::bigint, 0), 0), 3600000);
    if signal_kind not in ('series', 'type', 'tag', 'author') or signal_key = '' or signal_ms < 1000 then
      continue;
    end if;
    insert into public.interest_signals (user_id, kind, key, dwell_ms)
    values (auth.uid(), signal_kind, signal_key, signal_ms)
    on conflict (user_id, kind, key) do update
      set dwell_ms = public.interest_signals.dwell_ms + excluded.dwell_ms,
          updated_at = now();
  end loop;
end;
$$;
