-- Spoiler progress already lives on series_follows.progress.
-- This helper lets the app save "caught up through chapter/episode N"
-- without guessing column defaults. FictionCom keeps working if this
-- function is missing: the client updates series_follows directly.
-- Safe to run more than once. Do not apply from the app.

create or replace function public.set_series_progress(
  p_series text,
  p_medium text,
  p_progress integer
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if p_medium not in ('anime', 'manga') then
    raise exception 'Invalid format';
  end if;
  if p_series is null or length(trim(p_series)) < 1 or length(p_series) > 120 then
    raise exception 'Invalid series';
  end if;
  if p_progress is null or p_progress < 0 or p_progress > 100000 then
    raise exception 'Invalid progress';
  end if;
  insert into public.series_follows (user_id, series, medium, progress)
  values (auth.uid(), trim(p_series), p_medium, p_progress)
  on conflict (user_id, medium, series) do update
    set progress = excluded.progress;
end;
$$;

revoke all on function public.set_series_progress(text, text, integer) from public;
grant execute on function public.set_series_progress(text, text, integer) to authenticated;
