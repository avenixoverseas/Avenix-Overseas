-- Avenix Overseas — FINAL DATABASE FIX / MIGRATION
-- Run once in the SAME Supabase project used by this website.
-- Safe to re-run. It preserves existing records and does not alter website backgrounds,
-- Forminit, WhatsApp, Lara configuration, or existing contact details.

BEGIN;

-- Work / Hiring fields
ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS position text;
ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS sector text;
ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS salary_period text;
ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS positions integer;
ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS experience text;
ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS interview_required boolean NOT NULL DEFAULT false;
ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS estimated_salary text;
ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS opportunity_type text;
ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS posting_date date DEFAULT CURRENT_DATE;
ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT true;
ALTER TABLE public.career_jobs ADD COLUMN IF NOT EXISTS is_hiring_live boolean NOT NULL DEFAULT false;

UPDATE public.career_jobs SET city = location WHERE (city IS NULL OR trim(city)='') AND location IS NOT NULL;
UPDATE public.career_jobs SET position = employment_type WHERE (position IS NULL OR trim(position)='') AND employment_type IS NOT NULL;
UPDATE public.career_jobs SET estimated_salary = salary WHERE estimated_salary IS NULL AND salary IS NOT NULL;
UPDATE public.career_jobs SET posting_date = created_at::date WHERE posting_date IS NULL AND created_at IS NOT NULL;
UPDATE public.career_jobs SET is_published = COALESCE(is_active,true) WHERE is_published IS DISTINCT FROM COALESCE(is_active,true);
UPDATE public.career_jobs SET interview_required = true WHERE interview_required = false AND (requirements ILIKE 'Interview: Yes%' OR employer = 'Interview:Yes');

CREATE INDEX IF NOT EXISTS career_jobs_public_idx ON public.career_jobs (is_published, is_hiring_live, country, created_at DESC);
CREATE INDEX IF NOT EXISTS career_jobs_posting_date_idx ON public.career_jobs (posting_date DESC);

-- Review video field
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS video_url text;

-- Keep the existing public review behaviour. New reviews are published automatically.
ALTER TABLE public.reviews ALTER COLUMN is_visible SET DEFAULT true;

-- Shared public media bucket used by the existing site.
INSERT INTO storage.buckets (id, name, public)
VALUES ('site-images','site-images',true)
ON CONFLICT (id) DO UPDATE SET public=true;

DROP POLICY IF EXISTS "Avenix public image read" ON storage.objects;
CREATE POLICY "Avenix public image read"
ON storage.objects FOR SELECT TO public
USING (bucket_id='site-images');

DROP POLICY IF EXISTS "Avenix public review uploads" ON storage.objects;
CREATE POLICY "Avenix public review uploads"
ON storage.objects FOR INSERT TO anon
WITH CHECK (
  bucket_id='site-images'
  AND name LIKE 'reviews/%'
);

-- Review INSERT policy accepts the new video URL while preserving the old image path.
DROP POLICY IF EXISTS "public_submit_reviews" ON public.reviews;
CREATE POLICY "public_submit_reviews"
ON public.reviews FOR INSERT TO anon
WITH CHECK (
  is_visible=true
  AND admin_reply IS NULL
  AND char_length(trim(client_name)) BETWEEN 1 AND 120
  AND char_length(trim(service)) BETWEEN 1 AND 80
  AND char_length(trim(review_text)) BETWEEN 10 AND 2500
  AND rating BETWEEN 1 AND 10
  AND service IN (
    'Study Visa','Work Opportunity','Overseas Careers','Business Visa','Tourist Visa',
    'Free International Resume','Document Verification','Offer Letter Check',
    'Agency / Employer Check','Consultation','Other'
  )
  AND (image_url IS NULL OR image_url LIKE '%/storage/v1/object/public/site-images/reviews/%')
  AND (video_url IS NULL OR video_url LIKE '%/storage/v1/object/public/site-images/reviews/videos/%')
);

GRANT SELECT, INSERT ON public.reviews TO anon;

COMMIT;

-- Ask PostgREST to refresh its schema cache after the ALTER TABLE operations.
NOTIFY pgrst, 'reload schema';

-- IMPORTANT: Existing live/closed values are preserved. This migration never turns old
-- jobs into live hiring automatically.
