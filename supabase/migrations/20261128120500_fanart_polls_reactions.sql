-- Fan art, cosplay, manga layout, review scores, weekly polls,
-- and speech-bubble reactions.
-- Create, Explore, and reviews keep working when these objects are missing.
-- Safe to run more than once. Do not apply from the app.

create table if not exists public.post_extras (
  post_id uuid primary key references public.posts (id) on delete cascade,
  post_type text not null default 'post' check (post_type in ('post', 'fanart', 'cosplay', 'poll')),
  artist_credit text,
  layout text check (layout is null or layout in ('carousel', 'manga')),
  review_score smallint check (review_score is null or review_score between 1 and 10),
  created_at timestamptz not null default now()
);

create index if not exists post_extras_type_idx on public.post_extras (post_type);

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null unique references public.posts (id) on delete cascade,
  series text,
  medium text check (medium is null or medium in ('anime', 'manga')),
  question text not null,
  options jsonb not null,
  week_start date not null,
  created_at timestamptz not null default now()
);

create index if not exists polls_series_week_idx on public.polls (series, medium, week_start desc);

create table if not exists public.poll_votes (
  poll_id uuid not null references public.polls (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  option_index smallint not null check (option_index between 0 and 7),
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

create table if not exists public.post_reactions (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null check (emoji in ('😂', '❤️', '🔥', '😭', '🤯', '👏')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, emoji)
);

alter table public.post_extras enable row level security;
alter table public.polls enable row level security;
alter table public.poll_votes enable row level security;
alter table public.post_reactions enable row level security;

drop policy if exists "Anyone can read post extras" on public.post_extras;
create policy "Anyone can read post extras"
  on public.post_extras for select to anon, authenticated using (true);

drop policy if exists "Authors write post extras" on public.post_extras;
create policy "Authors write post extras"
  on public.post_extras for insert to authenticated
  with check (exists (select 1 from public.posts p where p.id = post_id and p.author = auth.uid()));

drop policy if exists "Authors update post extras" on public.post_extras;
create policy "Authors update post extras"
  on public.post_extras for update to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and p.author = auth.uid()))
  with check (exists (select 1 from public.posts p where p.id = post_id and p.author = auth.uid()));

drop policy if exists "Anyone can read polls" on public.polls;
create policy "Anyone can read polls"
  on public.polls for select to anon, authenticated using (true);

drop policy if exists "Authors create polls" on public.polls;
create policy "Authors create polls"
  on public.polls for insert to authenticated
  with check (
    char_length(question) between 1 and 140
    and jsonb_typeof(options) = 'array'
    and jsonb_array_length(options) between 2 and 4
    and exists (select 1 from public.posts p where p.id = post_id and p.author = auth.uid())
  );

drop policy if exists "Anyone can read poll votes" on public.poll_votes;
create policy "Anyone can read poll votes"
  on public.poll_votes for select to anon, authenticated using (true);

drop policy if exists "Members vote in polls" on public.poll_votes;
create policy "Members vote in polls"
  on public.poll_votes for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Anyone can read speech reactions" on public.post_reactions;
create policy "Anyone can read speech reactions"
  on public.post_reactions for select to anon, authenticated using (true);

drop policy if exists "Members add speech reactions" on public.post_reactions;
create policy "Members add speech reactions"
  on public.post_reactions for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Members remove speech reactions" on public.post_reactions;
create policy "Members remove speech reactions"
  on public.post_reactions for delete to authenticated
  using (auth.uid() = user_id);

create or replace function public.series_score_summary(p_series text, p_medium text)
returns table(episode integer, reviews integer, average numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select p.episode,
         count(e.review_score)::integer,
         round(avg(e.review_score), 1)
  from public.posts p
  join public.post_extras e on e.post_id = p.id
  where p.series = p_series
    and p.medium = p_medium
    and p.kind = 'reaction'
    and p.status = 'approved'
    and e.review_score is not null
  group by p.episode
  order by p.episode desc;
$$;

create or replace function public.series_fans(p_series text, p_medium text)
returns table(id uuid, username text, display_name text, avatar_path text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_path
  from public.series_follows f
  join public.profiles p on p.id = f.user_id
  where f.series = p_series
    and f.medium = p_medium
    and coalesce(p.account_suspended, false) = false
  order by p.username
  limit 80;
$$;

create or replace function public.cast_poll_vote(target uuid, option_index smallint)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  poll_row public.polls%rowtype;
  counts jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  select * into poll_row from public.polls where post_id = target;
  if poll_row.id is null then
    raise exception 'Poll not found';
  end if;
  if option_index is null or option_index < 0 or option_index >= jsonb_array_length(poll_row.options) then
    raise exception 'Pick one of the choices';
  end if;
  insert into public.poll_votes (poll_id, user_id, option_index)
  values (poll_row.id, auth.uid(), option_index)
  on conflict (poll_id, user_id) do update set option_index = excluded.option_index, created_at = now();
  select coalesce(jsonb_agg(jsonb_build_object('index', option_index, 'votes', votes) order by option_index), '[]'::jsonb)
    into counts
  from (
    select v.option_index, count(*) as votes
    from public.poll_votes v
    where v.poll_id = poll_row.id
    group by v.option_index
  ) tallies;
  return jsonb_build_object('counts', counts, 'mine', option_index, 'options', poll_row.options, 'question', poll_row.question);
end;
$$;

create or replace function public.toggle_post_reaction(target uuid, picked text)
returns table(emoji text, tally integer, mine boolean)
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if picked not in ('😂', '❤️', '🔥', '😭', '🤯', '👏') then
    raise exception 'Unknown reaction';
  end if;
  if exists (
    select 1 from public.post_reactions r
    where r.post_id = target and r.user_id = auth.uid() and r.emoji = picked
  ) then
    delete from public.post_reactions r
    where r.post_id = target and r.user_id = auth.uid() and r.emoji = picked;
  else
    insert into public.post_reactions (post_id, user_id, emoji)
    values (target, auth.uid(), picked);
  end if;
  return query
    select r.emoji, count(*)::integer, bool_or(r.user_id = auth.uid())
    from public.post_reactions r
    where r.post_id = target
    group by r.emoji;
end;
$$;

grant select on public.post_extras, public.polls, public.poll_votes, public.post_reactions to anon, authenticated;
grant insert, update on public.post_extras to authenticated;
grant insert on public.polls to authenticated;
grant insert on public.poll_votes to authenticated;
grant insert, delete on public.post_reactions to authenticated;
grant execute on function public.series_score_summary(text, text) to anon, authenticated;
grant execute on function public.series_fans(text, text) to anon, authenticated;
grant execute on function public.cast_poll_vote(uuid, smallint) to authenticated;
grant execute on function public.toggle_post_reaction(uuid, text) to authenticated;
