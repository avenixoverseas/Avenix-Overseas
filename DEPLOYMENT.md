# Avenix Overseas — production deployment

## 1. Static website
Upload the contents of this folder to the hosting public web root. Keep the directory structure unchanged.

The site is mobile-first static HTML/CSS/JS. No build step is required. The public Supabase publishable key in `js/supabase-config.js` is intentionally client-visible; never place service-role or AI secrets there.

## 2. Supabase
Keep the existing project and four authorised admin accounts:
- `affysiddiqui98@gmail.com` — primary Admin/Owner
- `avenixoverseas@gmail.com`
- `avenixoverseas1@gmail.com`
- `contact@avenixoverseas.com`

Run `SUPABASE-ADMIN-SECURITY.sql` in the Supabase SQL Editor.

## 3. Lara database setup
Run `LARA-SUPABASE-SETUP.sql` in the Supabase SQL Editor. It creates the secure `lara_leads` table. Anonymous browsers have no direct access to this table; the Lara Edge Function writes leads server-side with the service-role key.

## 4. Edge Functions
From the project directory:
```bash
supabase login
supabase link --project-ref nfkndcvoxkjxhoiabmdl

supabase functions deploy lara-chat --no-verify-jwt
supabase functions deploy admin-change-password
supabase functions deploy submit-review --no-verify-jwt
```

Set secrets in Supabase; never put these in the website:
```bash
supabase secrets set GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
supabase secrets set GEMINI_MODEL="gemini-3.6-flash"
supabase secrets set SITE_ORIGIN="https://avenixoverseas.com"
```

`SUPABASE_URL` is supplied automatically to Edge Functions.

## 5. Gemini
Create a Gemini API key in Google AI Studio and ensure the Gemini API is enabled for the associated project. The included Lara function uses Gemini 2.5 Flash. Free-tier eligibility and quotas are controlled by Google and can change.

## 6. Authentication URLs
In Supabase Authentication → URL Configuration, set the production HTTPS Site URL and redirect URL for the deployed domain.

## 7. Local testing
```bash
python -m http.server 3000
```
Then test:
- `http://localhost:3000/`
- `http://localhost:3000/reviews.html`
- `http://localhost:3000/work-opportunity.html`
- `http://localhost:3000/admin.html`

## 8. Security notes
- No Gemini or service-role secret is included in this ZIP.
- Lara receives only published jobs/reviews from the server.
- Public reviews use the `submit-review` Edge Function. Anonymous visitors can submit reviews and optional images; the function validates, uploads to `site-images/reviews/`, inserts the review, and returns the new row. Admins retain full management access.
- Admin content changes are protected by Supabase RLS and the four-account allowlist.
- Password changes are performed server-side and only the primary Admin can invoke them.
- Admin inactivity logout is 60 seconds; page/visibility leave handling and `pageshow` authentication checks protect against common back/forward-cache paths.

## Review Supabase deployment check

Before publishing the website, run `SUPABASE-REVIEW-SETUP.sql` (or `SUPABASE-ADMIN-SECURITY.sql`) in the same Supabase project. The public Reviews page uses the same project as Work Opportunity, publishes validated client submissions immediately, uploads optional images to `site-images/reviews/`, and subscribes to Supabase Realtime for newly inserted/updated published reviews. The existing `submit-review` Edge Function remains as a compatibility fallback and is not required for the primary browser submission path.
