-- Character and arc tags.
-- Create still publishes if these tables are missing; tag pages then
-- search captions instead.
-- Safe to run more than once. Do not apply from the app.

create table if not exists public.fandom_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('character', 'arc')),
  series text not null default '',
  normalized text not null,
  created_at timestamptz not null default now(),
  unique (kind, normalized, series)
);

create table if not exists public.post_fandom_tags (
  post_id uuid not null references public.posts (id) on delete cascade,
  tag_id uuid not null references public.fandom_tags (id) on delete cascade,
  primary key (post_id, tag_id)
);

create index if not exists post_fandom_tags_tag_idx on public.post_fandom_tags (tag_id);

alter table public.fandom_tags enable row level security;
alter table public.post_fandom_tags enable row level security;

drop policy if exists "Anyone can read fandom tags" on public.fandom_tags;
create policy "Anyone can read fandom tags"
  on public.fandom_tags for select
  to anon, authenticated
  using (true);

drop policy if exists "Members create fandom tags" on public.fandom_tags;
create policy "Members create fandom tags"
  on public.fandom_tags for insert
  to authenticated
  with check (char_length(name) between 1 and 40 and char_length(series) <= 120);

drop policy if exists "Anyone can read post tags" on public.post_fandom_tags;
create policy "Anyone can read post tags"
  on public.post_fandom_tags for select
  to anon, authenticated
  using (true);

drop policy if exists "Authors tag their posts" on public.post_fandom_tags;
create policy "Authors tag their posts"
  on public.post_fandom_tags for insert
  to authenticated
  with check (exists (
    select 1 from public.posts p
    where p.id = post_id and p.author = auth.uid()
  ));

drop policy if exists "Authors remove tags from their posts" on public.post_fandom_tags;
create policy "Authors remove tags from their posts"
  on public.post_fandom_tags for delete
  to authenticated
  using (exists (
    select 1 from public.posts p
    where p.id = post_id and p.author = auth.uid()
  ));

create or replace function public.suggest_fandom_tags(q text, p_series text)
returns table(id uuid, name text, kind text, series text)
language sql
stable
security invoker
set search_path = public
as $$
  select t.id, t.name, t.kind, t.series
  from public.fandom_tags t
  where (q is null or q = '' or t.normalized like lower(trim(q)) || '%')
    and (p_series is null or p_series = '' or t.series = '' or t.series = p_series)
  order by (t.series = coalesce(p_series, '')) desc, t.name
  limit 8;
$$;

create or replace function public.attach_post_tags(target uuid, tags jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  row jsonb;
  tag_name text;
  tag_kind text;
  tag_series text;
  tag_norm text;
  tag_id uuid;
begin
  if auth.uid() is null or tags is null or jsonb_typeof(tags) <> 'array' then
    return;
  end if;
  if not exists (select 1 from public.posts p where p.id = target and p.author = auth.uid()) then
    raise exception 'You can only tag your own post';
  end if;
  for row in select value from jsonb_array_elements(tags) loop
    tag_name := left(trim(coalesce(row->>'name', '')), 40);
    tag_kind := row->>'kind';
    tag_series := left(trim(coalesce(row->>'series', '')), 120);
    tag_norm := lower(regexp_replace(tag_name, '\s+', ' ', 'g'));
    if tag_kind not in ('character', 'arc') or tag_norm = '' then
      continue;
    end if;
    insert into public.fandom_tags (name, kind, series, normalized)
    values (tag_name, tag_kind, tag_series, tag_norm)
    on conflict (kind, normalized, series) do update set name = public.fandom_tags.name
    returning id into tag_id;
    if tag_id is null then
      select id into tag_id from public.fandom_tags
      where kind = tag_kind and normalized = tag_norm and series = tag_series;
    end if;
    insert into public.post_fandom_tags (post_id, tag_id)
    values (target, tag_id)
    on conflict do nothing;
  end loop;
end;
$$;

grant select on public.fandom_tags, public.post_fandom_tags to anon, authenticated;
grant insert on public.fandom_tags to authenticated;
grant insert, delete on public.post_fandom_tags to authenticated;
grant execute on function public.suggest_fandom_tags(text, text) to anon, authenticated;
grant execute on function public.attach_post_tags(uuid, jsonb) to authenticated;
