-- Avenix Overseas — requested Admin hiring fields
-- Safe to run after the existing job foundation migration.
ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS estimated_salary text;
ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS opportunity_type text;
ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS posting_date date;
UPDATE public.career_jobs SET estimated_salary = salary WHERE estimated_salary IS NULL AND salary IS NOT NULL;
UPDATE public.career_jobs SET posting_date = created_at::date WHERE posting_date IS NULL AND created_at IS NOT NULL;
ALTER TABLE public.career_jobs ALTER COLUMN posting_date SET DEFAULT CURRENT_DATE;
UPDATE public.career_jobs SET posting_date = CURRENT_DATE WHERE posting_date IS NULL;
CREATE INDEX IF NOT EXISTS career_jobs_posting_date_idx ON public.career_jobs (posting_date DESC);


-- Refresh PostgREST's schema cache after DDL so new columns are immediately visible.
NOTIFY pgrst, 'reload schema';
