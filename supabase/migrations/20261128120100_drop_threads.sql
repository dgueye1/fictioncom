-- Chapter / episode drop threads and follower notices.
-- The app still lists reviews from posts when these objects are missing.
-- Safe to run more than once. Do not apply from the app.

create table if not exists public.drop_threads (
  id uuid primary key default gen_random_uuid(),
  series text not null,
  medium text not null check (medium in ('anime', 'manga')),
  number integer not null check (number between 1 and 100000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (series, medium, number)
);

create table if not exists public.drop_notices (
  id uuid primary key default gen_random_uuid(),
  recipient uuid not null references auth.users (id) on delete cascade,
  actor uuid references auth.users (id) on delete set null,
  series text not null,
  medium text not null check (medium in ('anime', 'manga')),
  number integer not null check (number between 1 and 100000),
  thread_id uuid references public.drop_threads (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists drop_notices_recipient_idx
  on public.drop_notices (recipient, created_at desc);

alter table public.drop_threads enable row level security;
alter table public.drop_notices enable row level security;

drop policy if exists "Anyone can read drop threads" on public.drop_threads;
create policy "Anyone can read drop threads"
  on public.drop_threads for select
  to anon, authenticated
  using (true);

drop policy if exists "Members read their drop notices" on public.drop_notices;
create policy "Members read their drop notices"
  on public.drop_notices for select
  to authenticated
  using (auth.uid() = recipient);

drop policy if exists "Members mark their drop notices read" on public.drop_notices;
create policy "Members mark their drop notices read"
  on public.drop_notices for update
  to authenticated
  using (auth.uid() = recipient)
  with check (auth.uid() = recipient);

create or replace function public.open_drop_thread(
  p_series text,
  p_medium text,
  p_number integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  thread_id uuid;
  clean text := trim(coalesce(p_series, ''));
begin
  if actor is null then
    raise exception 'Sign in required';
  end if;
  if p_medium not in ('anime', 'manga') or p_number is null or p_number < 1 or p_number > 100000 or clean = '' or length(clean) > 120 then
    raise exception 'Invalid chapter or episode';
  end if;

  insert into public.drop_threads (series, medium, number, created_by)
  values (clean, p_medium, p_number, actor)
  on conflict (series, medium, number) do nothing
  returning id into thread_id;

  if thread_id is null then
    select id into thread_id
    from public.drop_threads
    where series = clean and medium = p_medium and number = p_number;
  end if;

  if thread_id is not null
     and not exists (select 1 from public.drop_notices where thread_id = thread_id)
     and exists (
       select 1 from public.posts
       where series = clean and medium = p_medium and episode = p_number
         and kind = 'reaction' and status = 'approved'
     ) then
    insert into public.drop_notices (recipient, actor, series, medium, number, thread_id)
    select f.user_id, actor, clean, p_medium, p_number, thread_id
    from public.series_follows f
    where f.series = clean and f.medium = p_medium and f.user_id <> actor;
  end if;

  return thread_id;
end;
$$;

create or replace function public.drop_thread_from_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind = 'reaction'
     and new.episode is not null
     and new.series is not null
     and new.medium in ('anime', 'manga')
     and new.status = 'approved' then
    perform public.open_drop_thread(new.series, new.medium, new.episode);
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists posts_open_drop_thread on public.posts;
create trigger posts_open_drop_thread
  after insert or update of status, episode, kind, series, medium
  on public.posts
  for each row
  execute function public.drop_thread_from_post();

revoke all on function public.open_drop_thread(text, text, integer) from public;
grant execute on function public.open_drop_thread(text, text, integer) to authenticated;

grant select on public.drop_threads to anon, authenticated;
grant select, update on public.drop_notices to authenticated;
