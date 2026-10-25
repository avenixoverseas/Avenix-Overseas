# Avenix Overseas — Website upgrade notes

This bundle upgrades the existing website while preserving the existing visual background/image selections and the existing Forminit, WhatsApp, phone, Supabase configuration and other core internal details.

## Added
- Work Opportunity search, country/sector/status filters.
- Published vs Currently Hiring separation.
- Structured job fields in Admin.
- Shareable job detail URLs.
- Job-specific Forminit enquiry context.
- Job-specific WhatsApp enquiry using the existing WhatsApp number.
- Request-new-job-updates WhatsApp shortcut.
- Country Explorer search.
- Country comparison tool based on the website's destination directory (no ranking).
- Pathway Guidance checker.
- Scam Awareness center.
- Verification Guidance workflow.
- FAQ center.
- Lara quick-action buttons.
- Admin dashboard hiring/review counters.

## Reviews — only requested additions
- Optional client video upload.
- Image/video selection previews.
- Trash buttons for removing selected review media before saving/submitting.
- Admin video preview support.

## Database migration
Run `SUPABASE-JOB-FOUNDATION-MIGRATION.sql` before using the new Admin job fields. It is designed to preserve existing public state and does not automatically turn old listings into live hiring.

Run the updated `SUPABASE-REVIEW-SETUP.sql` to add the optional `video_url` field.

## Existing integrations preserved
- Forminit: `https://forminit.com/f/53t1pftz4qh`
- Avenix WhatsApp: `+91 80063 55135`
- Avenix mobile: `+91 74519 44446`
- Existing hero/background image selections on the original pages are unchanged.
- Existing Lara endpoint/client flow is not replaced by a different provider in this static bundle.
