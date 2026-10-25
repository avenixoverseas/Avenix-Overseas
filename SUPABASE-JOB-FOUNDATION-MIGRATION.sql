-- Avenix Overseas — Job foundation / public visibility migration
-- Run this once in the SAME Supabase project used by the website.
-- Safe to re-run. Existing active listings are preserved as published;
-- this migration does NOT automatically mark them as live hiring.

ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS position text;
ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS sector text;
ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS salary_period text;
ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS positions integer;
ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS experience text;
ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS interview_required boolean NOT NULL DEFAULT false;
ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS benefits text;
ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS accommodation text;
ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS application_information text;
ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS estimated_salary text;
ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS opportunity_type text;
ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS posting_date date;

UPDATE public.career_jobs SET estimated_salary = salary WHERE estimated_salary IS NULL AND salary IS NOT NULL;
UPDATE public.career_jobs SET posting_date = created_at::date WHERE posting_date IS NULL AND created_at IS NOT NULL;
ALTER TABLE public.career_jobs ALTER COLUMN posting_date SET DEFAULT CURRENT_DATE;
UPDATE public.career_jobs SET posting_date = CURRENT_DATE WHERE posting_date IS NULL;

-- Keep older application_info data available when that legacy column exists.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='career_jobs' AND column_name='application_info') THEN
    EXECUTE 'UPDATE public.career_jobs SET application_information = application_info WHERE (application_information IS NULL OR trim(application_information) = '''') AND application_info IS NOT NULL';
  END IF;
END $$;
ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT true;
ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS is_hiring_live boolean NOT NULL DEFAULT false;

-- Preserve the current public state: legacy is_active becomes is_published.
UPDATE public.career_jobs
SET is_published = COALESCE(is_active, true)
WHERE is_published IS DISTINCT FROM COALESCE(is_active, true);

-- Migrate legacy location into city only when city is empty.
UPDATE public.career_jobs
SET city = location
WHERE (city IS NULL OR trim(city) = '') AND location IS NOT NULL;

-- Migrate the old position representation only when the new field is empty.
UPDATE public.career_jobs
SET position = employment_type
WHERE (position IS NULL OR trim(position) = '') AND employment_type IS NOT NULL;

-- Preserve interview information encoded by the older implementation.
UPDATE public.career_jobs
SET interview_required = true
WHERE interview_required = false
  AND (requirements ILIKE 'Interview: Yes%' OR employer = 'Interview:Yes');

-- Do not silently make old jobs live. Existing true values are preserved.
CREATE INDEX IF NOT EXISTS career_jobs_public_idx
ON public.career_jobs (is_published, is_hiring_live, country, created_at DESC);

SELECT id, job_title, country, city, position, estimated_salary, opportunity_type, posting_date,
       is_published, is_hiring_live, interview_required
FROM public.career_jobs
ORDER BY created_at DESC;


-- Refresh PostgREST's schema cache after DDL so new columns are immediately visible.
NOTIFY pgrst, 'reload schema';
