# Avenix Overseas — Supabase Setup

## Project

The website uses the same Supabase project for both Work Opportunity and Reviews:

`https://nfkndcvoxkjxhoiabmdl.supabase.co`

The public publishable/anon key is in `js/supabase-config.js`. This key is intended for browser use; never place the service-role key there.

## Existing data tables

The site expects these existing tables:

- `career_jobs` — admin-created hiring/work opportunities
- `reviews` — client reviews

The public Work Opportunity page reads `career_jobs` where `is_active = true`.
The public Reviews page reads `reviews` where `is_visible = true`.

## Storage

Create/keep a public bucket named:

`site-images`

Review images are stored under:

`reviews/<uuid>-filename.ext`

Hiring images are stored under:

`careers/<...>`

The public website only needs read access to published images. Review visitors do not upload directly to Storage.

## Review submission

The review page uses the same Supabase project and calls the `submit-review` Edge Function. The browser sends the review fields to the same Supabase project used by Work Opportunity. It uploads an optional image to `site-images/reviews/` and inserts the review directly, so client publishing does not depend on an Edge Function being deployed.

The Edge Function:

1. Validates the review.
2. Uploads the optional image to `site-images/reviews/` with the service role.
3. Saves the resulting public image URL in the same `reviews` row.
4. Inserts `is_visible = true` and `admin_reply = null` itself.
5. Returns the newly created review to the browser.

The page immediately renders the returned database row at the top of the review list. It also subscribes to Supabase Realtime so reviews published from another browser/session can appear without a manual refresh.

This design avoids the anonymous Storage RLS error shown by the previous implementation.

## Required SQL

Run `SUPABASE-ADMIN-SECURITY.sql` in the Supabase SQL Editor. If the Reviews table, bucket, read policy, or Realtime publication needs repair without touching the rest of the setup, `SUPABASE-REVIEW-SETUP.sql` is provided as an idempotent focused repair script.

## Edge Function secret

Set this secret in Supabase Edge Functions:

`SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY`

Do not put that value in HTML, CSS or frontend JavaScript.

Optional:

`SITE_ORIGIN=https://avenixoverseas.com`

## Deploy review function

```bash
supabase functions deploy submit-review --no-verify-jwt
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
```

The function intentionally has JWT verification disabled because public visitors submit reviews anonymously. It validates the payload itself and uses the server-side service role only for the Storage upload and database insert.

## Forminit

General website enquiry/contact forms continue to use:

`https://forminit.com/f/53t1pftz4qh`

Reviews are not dependent on Forminit; they must be stored in Supabase together with their optional image.
