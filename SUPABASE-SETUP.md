# Avenix Overseas — Supabase setup

The website uses the existing Supabase project for Work Opportunity, Reviews, Admin and Lara.

## Career jobs
`public.career_jobs` is the source for Work Opportunity listings.

Run `SUPABASE-JOB-FOUNDATION-MIGRATION.sql` to add the structured fields used by the upgraded Admin and public job directory. The migration preserves existing active/public state and does **not** automatically mark old posts as currently hiring.

The public website treats:
- `is_published = true` as publicly visible;
- `is_hiring_live = true` as currently open for enquiries;
- `is_published = true` + `is_hiring_live = false` as a published/closed post.

The Admin panel controls these independently.

## Reviews
Run `SUPABASE-REVIEW-SETUP.sql` for the existing review table, storage and Realtime setup. It now includes `video_url` for optional client video reviews. Existing image review behaviour is preserved.

## Lara
The existing Lara deployment remains separate from the static website bundle. When updating the Lara Edge Function, use the structured `career_jobs` fields and the Published/Currently Hiring distinction described above.

## Security
Keep Supabase service-role keys server-side. The browser should only use the existing public Supabase configuration. Admin permissions remain enforced by Supabase RLS/auth policies.
