# Avenix Overseas — Review Fix & Light Brand Update

This package preserves the existing website and Admin Panel while fixing the public Reviews flow and applying the new light Avenix visual system.

## Review deployment requirement
The browser Review page uses the same Supabase project/configuration as Work Opportunity. Anonymous submission now prefers a tightly-scoped direct Supabase INSERT and `site-images/reviews/` upload, with the existing `submit-review` Edge Function retained as a compatibility fallback.

Before testing client submissions:

```bash
supabase link --project-ref nfkndcvoxkjxhoiabmdl
supabase functions deploy submit-review --no-verify-jwt
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
```

Then run `SUPABASE-ADMIN-SECURITY.sql` in the same project. If only the Reviews database/storage/realtime setup needs repair, run `SUPABASE-REVIEW-SETUP.sql`.

## What was changed
- Public Reviews loading made more tolerant of older/missing optional columns.
- Client reviews are submitted directly to Supabase and appear immediately; older deployments can fall back to `submit-review`.
- New reviews are inserted into the page immediately after a successful submission.
- Supabase Realtime subscription added for published review inserts/updates from other sessions.
- Realtime publication setup added to the SQL.
- Edge Function CORS made safe for production/preview/non-www origins because the public endpoint does not use credentialed browser cookies.
- Public pages use Ivory, Soft Beige, Deep Navy, Royal Blue and Champagne Gold.
- Public headings use Cormorant Garamond with Allura script accents; body text remains highly readable with DM Sans.
- A light-background transparent logo variant was added and used on public pages. Admin retains its original logo/font styling.
- About Avenix presentation was refined for the new light luxury palette.
- Review submit button inline styling was replaced with a reusable CSS class.

## Intentionally unchanged
- Admin Panel functionality and authentication
- Hiring / Work Opportunity business logic
- Existing Supabase project and admin accounts
- Existing Lara functionality
- Existing navigation and other page business logic
