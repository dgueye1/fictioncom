-- Optional crop and video-poster metadata for posts.
-- Do not apply this automatically. The app keeps working without these columns:
-- it retries the insert without them and still plays video from the file itself.
-- Safe to run more than once.

alter table public.posts add column if not exists media_ratio text;
alter table public.posts add column if not exists media_posters jsonb;

alter table public.posts drop constraint if exists posts_media_ratio_check;
alter table public.posts
  add constraint posts_media_ratio_check
  check (media_ratio is null or media_ratio in ('original', '1:1', '4:5', '16:9'));

comment on column public.posts.media_ratio is 'Composer crop: original, 1:1, 4:5, or 16:9.';
comment on column public.posts.media_posters is 'Map of video storage path to JPEG poster path in community-media.';
