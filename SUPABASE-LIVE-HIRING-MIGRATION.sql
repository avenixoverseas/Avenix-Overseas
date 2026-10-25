-- Avenix Overseas — Live Hiring status
-- Safe/idempotent migration for the existing career_jobs table.
-- Run this in the SAME Supabase project used by Work Opportunity.
-- IMPORTANT: this migration does NOT automatically mark old posts as live.

ALTER TABLE public.career_jobs
  ADD COLUMN IF NOT EXISTS is_hiring_live boolean NOT NULL DEFAULT false;

ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS estimated_salary text;
ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS opportunity_type text;
ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS posting_date date;
UPDATE public.career_jobs SET estimated_salary = salary WHERE estimated_salary IS NULL AND salary IS NOT NULL;
UPDATE public.career_jobs SET posting_date = created_at::date WHERE posting_date IS NULL AND created_at IS NOT NULL;
ALTER TABLE public.career_jobs ALTER COLUMN posting_date SET DEFAULT CURRENT_DATE;
UPDATE public.career_jobs SET posting_date = CURRENT_DATE WHERE posting_date IS NULL;

ALTER TABLE public.career_jobs
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT true;

UPDATE public.career_jobs
SET is_published = COALESCE(is_active, true)
WHERE is_published IS DISTINCT FROM COALESCE(is_active, true);

CREATE INDEX IF NOT EXISTS career_jobs_live_idx
ON public.career_jobs (is_hiring_live)
WHERE is_hiring_live = true;

SELECT id, job_title, is_active, is_published, is_hiring_live
FROM public.career_jobs
ORDER BY created_at DESC;
