# Avenix Overseas — Deployment checklist

## 1. Preserve existing integrations
The existing Forminit endpoint remains `https://forminit.com/f/53t1pftz4qh` and the existing Avenix WhatsApp number remains `+91 80063 55135`. Do not replace either integration when deploying.

## 2. Supabase database
Run these SQL files in the same Supabase project, in this order:

1. Existing/base setup as already used by the project.
2. `SUPABASE-JOB-FOUNDATION-MIGRATION.sql` — adds the structured job fields and separates **Published** from **Currently Hiring** without automatically making old posts live.
3. `SUPABASE-REVIEW-SETUP.sql` — keeps the existing review setup and adds optional review video support.
4. `LARA-SUPABASE-SETUP.sql` if the existing Lara lead workflow is part of your deployment.

`SUPABASE-LIVE-HIRING-MIGRATION.sql` is retained as a focused/idempotent alternative for installations that only need the two visibility/status columns.

## 3. Work Opportunity
The public page now:
- shows only published jobs;
- distinguishes Currently Hiring from Hiring Closed;
- supports search, country, sector and hiring-status filters;
- creates shareable job URLs;
- passes job context into the existing Forminit consultation route;
- provides contextual WhatsApp enquiry links using the existing number;
- keeps the existing image/gallery behaviour.

## 4. Reviews
The existing review flow remains intact. Clients can additionally attach one optional video (MP4/WebM/MOV, up to 20 MB). Image/video selection previews include a trash button so media can be removed before submission. Admin review management also supports video previews and trash controls.

## 5. New public resources
- `pathway.html` — pathway guidance checker.
- `compare-countries.html` — side-by-side country directory comparison without subjective ranking.
- `scam-awareness.html` — practical scam-awareness guidance.
- `verification.html` — document/opportunity verification workflow.
- `faq.html` — frequently asked questions.

## 6. Testing
After deployment, test:
- desktop, tablet and mobile navigation;
- every existing contact form and Forminit submission;
- WhatsApp links;
- Lara open/send/close behaviour;
- Work Opportunity filters and job details;
- Admin login, job publish/live controls and image uploads;
- public review image/video submission and trash controls;
- legal pages and all new resource links.
