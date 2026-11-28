-- Reading, watching, completed and dropped shelves, plus favorite characters.
-- Existing profile_series shelves keep working if this file is not applied.
-- Safe to run more than once. Do not apply from the app.

create table if not exists public.reading_shelves (
  user_id uuid not null references auth.users (id) on delete cascade,
  series text not null,
  medium text not null check (medium in ('anime', 'manga')),
  shelf text not null check (shelf in ('reading', 'watching', 'completed', 'dropped')),
  updated_at timestamptz not null default now(),
  primary key (user_id, series, medium)
);

create table if not exists public.favorite_characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  series text not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, series, name)
);

alter table public.reading_shelves enable row level security;
alter table public.favorite_characters enable row level security;

drop policy if exists "Anyone can read series shelves" on public.reading_shelves;
create policy "Anyone can read series shelves"
  on public.reading_shelves for select
  to anon, authenticated
  using (true);

drop policy if exists "Members add their shelves" on public.reading_shelves;
create policy "Members add their shelves"
  on public.reading_shelves for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Members update their shelves" on public.reading_shelves;
create policy "Members update their shelves"
  on public.reading_shelves for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Members remove their shelves" on public.reading_shelves;
create policy "Members remove their shelves"
  on public.reading_shelves for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Anyone can read favorite characters" on public.favorite_characters;
create policy "Anyone can read favorite characters"
  on public.favorite_characters for select
  to anon, authenticated
  using (true);

drop policy if exists "Members add favorite characters" on public.favorite_characters;
create policy "Members add favorite characters"
  on public.favorite_characters for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Members remove favorite characters" on public.favorite_characters;
create policy "Members remove favorite characters"
  on public.favorite_characters for delete
  to authenticated
  using (auth.uid() = user_id);

grant select on public.reading_shelves, public.favorite_characters to anon, authenticated;
grant insert, update, delete on public.reading_shelves to authenticated;
grant insert, delete on public.favorite_characters to authenticated;
