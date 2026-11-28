-- Optional overlay JSON for video posts and stories.
-- Do not apply this automatically. The app keeps working without the column:
-- it retries the insert without media_overlays and bakes text and stickers
-- into the video poster when the column is missing.
-- Safe to run more than once.

alter table public.posts add column if not exists media_overlays jsonb;

comment on column public.posts.media_overlays is
  'Map of media storage path to overlay objects. Positions, scale and rotation are normalized. Photos are flattened in the image instead.';
