-- Theory votes and "Called it" confirmations.
-- The theories feed keeps its current order if these objects are missing.
-- Safe to run more than once. Do not apply from the app.

create table if not exists public.theory_votes (
  user_id uuid not null references auth.users (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index if not exists theory_votes_post_idx on public.theory_votes (post_id);

create table if not exists public.theory_calls (
  post_id uuid primary key references public.posts (id) on delete cascade,
  called_by uuid not null references auth.users (id) on delete cascade,
  called_at timestamptz not null default now()
);

alter table public.theory_votes enable row level security;
alter table public.theory_calls enable row level security;

drop policy if exists "Anyone can read theory votes" on public.theory_votes;
create policy "Anyone can read theory votes"
  on public.theory_votes for select
  to anon, authenticated
  using (true);

drop policy if exists "Members cast their own theory votes" on public.theory_votes;
create policy "Members cast their own theory votes"
  on public.theory_votes for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Members change their own theory votes" on public.theory_votes;
create policy "Members change their own theory votes"
  on public.theory_votes for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Members remove their own theory votes" on public.theory_votes;
create policy "Members remove their own theory votes"
  on public.theory_votes for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Anyone can read called-it marks" on public.theory_calls;
create policy "Anyone can read called-it marks"
  on public.theory_calls for select
  to anon, authenticated
  using (true);

create or replace function public.vote_theory(target uuid, direction smallint)
returns table(score integer, mine smallint)
language plpgsql
security invoker
set search_path = public
as $$
declare
  post_kind text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if direction is null or direction not in (-1, 0, 1) then
    raise exception 'Invalid vote';
  end if;
  select kind into post_kind from public.posts where id = target;
  if post_kind is distinct from 'theory' then
    raise exception 'Only theories can be voted';
  end if;
  if direction = 0 then
    delete from public.theory_votes where user_id = auth.uid() and post_id = target;
  else
    insert into public.theory_votes (user_id, post_id, value)
    values (auth.uid(), target, direction)
    on conflict (user_id, post_id) do update set value = excluded.value, created_at = now();
  end if;
  return query
    select coalesce(sum(v.value), 0)::integer,
           coalesce(max(v.value) filter (where v.user_id = auth.uid()), 0)::smallint
    from public.theory_votes v
    where v.post_id = target;
end;
$$;

create or replace function public.theory_scores(targets uuid[])
returns table(post_id uuid, score integer, upvotes integer, downvotes integer, mine smallint)
language sql
stable
security invoker
set search_path = public
as $$
  select p.id,
         coalesce(sum(v.value), 0)::integer,
         coalesce(count(*) filter (where v.value = 1), 0)::integer,
         coalesce(count(*) filter (where v.value = -1), 0)::integer,
         coalesce(max(v.value) filter (where v.user_id = auth.uid()), 0)::smallint
  from unnest(coalesce(targets, array[]::uuid[])) as p(id)
  left join public.theory_votes v on v.post_id = p.id
  group by p.id;
$$;

create or replace function public.call_theory(target uuid, confirmed boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  author uuid;
  allowed boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  select p.author into author from public.posts p where p.id = target and p.kind = 'theory';
  if author is null then
    raise exception 'Theory not found';
  end if;
  if author = auth.uid() then
    allowed := true;
  else
    begin
      allowed := coalesce(public.is_moderator(), false);
    exception when undefined_function then
      allowed := false;
    end;
  end if;
  if not allowed then
    raise exception 'Only the author or a moderator can confirm a theory';
  end if;
  if confirmed then
    insert into public.theory_calls (post_id, called_by)
    values (target, auth.uid())
    on conflict (post_id) do update set called_by = excluded.called_by, called_at = now();
  else
    delete from public.theory_calls where post_id = target;
  end if;
  return confirmed;
end;
$$;

create or replace function public.top_theories(
  p_series text,
  p_medium text,
  page_number integer,
  limit_count integer
)
returns setof public.posts
language sql
stable
security invoker
set search_path = public
as $$
  select p.*
  from public.posts p
  left join (
    select post_id, coalesce(sum(value), 0) as score
    from public.theory_votes
    group by post_id
  ) v on v.post_id = p.id
  where p.kind = 'theory'
    and p.status = 'approved'
    and (p_series is null or p_series = '' or p.series = p_series)
    and (p_medium is null or p_medium = '' or p.medium = p_medium)
  order by coalesce(v.score, 0) desc, p.created_at desc, p.id
  offset greatest(coalesce(page_number, 0), 0) * least(greatest(coalesce(limit_count, 24), 1), 50)
  limit least(greatest(coalesce(limit_count, 24), 1), 50);
$$;

create or replace function public.called_it_count(target uuid)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::integer
  from public.theory_calls c
  join public.posts p on p.id = c.post_id
  where p.author = target and p.status = 'approved';
$$;

revoke all on function public.vote_theory(uuid, smallint) from public;
revoke all on function public.call_theory(uuid, boolean) from public;
grant execute on function public.vote_theory(uuid, smallint) to authenticated;
grant execute on function public.call_theory(uuid, boolean) to authenticated;
grant execute on function public.theory_scores(uuid[]) to anon, authenticated;
grant execute on function public.top_theories(text, text, integer, integer) to anon, authenticated;
grant execute on function public.called_it_count(uuid) to anon, authenticated;
grant select on public.theory_votes, public.theory_calls to anon, authenticated;
