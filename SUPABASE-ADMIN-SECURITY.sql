-- Avenix Overseas — Supabase production security for Reviews and Work Opportunity.
-- Run this in the Supabase SQL Editor for project nfkndcvoxkjxhoiabmdl.
-- The public review form uses the submit-review Edge Function, which performs
-- the Storage upload and database insert with the server-side service role.
-- The service-role key must NEVER be placed in frontend code.

ALTER TABLE IF EXISTS public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.career_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_reviews" ON public.reviews;
DROP POLICY IF EXISTS "auth_all_jobs" ON public.career_jobs;
DROP POLICY IF EXISTS "public_insert_reviews" ON public.reviews;
DROP POLICY IF EXISTS "public_submit_reviews" ON public.reviews;
DROP POLICY IF EXISTS "public_read_visible_reviews" ON public.reviews;
DROP POLICY IF EXISTS "public_read_active_jobs" ON public.career_jobs;
DROP POLICY IF EXISTS "avenix_admin_reviews_all" ON public.reviews;
DROP POLICY IF EXISTS "avenix_admin_jobs_all" ON public.career_jobs;

CREATE POLICY "avenix_admin_reviews_all"
ON public.reviews FOR ALL TO authenticated
USING (lower(coalesce(auth.jwt() ->> 'email','')) IN (
  'affysiddiqui98@gmail.com', 'avenixoverseas@gmail.com',
  'avenixoverseas1@gmail.com', 'contact@avenixoverseas.com'
))
WITH CHECK (lower(coalesce(auth.jwt() ->> 'email','')) IN (
  'affysiddiqui98@gmail.com', 'avenixoverseas@gmail.com',
  'avenixoverseas1@gmail.com', 'contact@avenixoverseas.com'
));

CREATE POLICY "avenix_admin_jobs_all"
ON public.career_jobs FOR ALL TO authenticated
USING (lower(coalesce(auth.jwt() ->> 'email','')) IN (
  'affysiddiqui98@gmail.com', 'avenixoverseas@gmail.com',
  'avenixoverseas1@gmail.com', 'contact@avenixoverseas.com'
))
WITH CHECK (lower(coalesce(auth.jwt() ->> 'email','')) IN (
  'affysiddiqui98@gmail.com', 'avenixoverseas@gmail.com',
  'avenixoverseas1@gmail.com', 'contact@avenixoverseas.com'
));

GRANT SELECT, INSERT ON public.reviews TO anon;
GRANT SELECT ON public.career_jobs TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.career_jobs TO authenticated;
REVOKE UPDATE, DELETE ON public.reviews FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.career_jobs FROM anon;

CREATE POLICY "public_read_visible_reviews"
ON public.reviews FOR SELECT TO anon, authenticated
USING (is_visible = true);

CREATE POLICY "public_submit_reviews"
ON public.reviews FOR INSERT TO anon
WITH CHECK (
  is_visible = true
  AND admin_reply IS NULL
  AND char_length(trim(client_name)) BETWEEN 1 AND 120
  AND char_length(trim(service)) BETWEEN 1 AND 80
  AND char_length(trim(review_text)) BETWEEN 10 AND 2500
  AND rating BETWEEN 1 AND 10
  AND service IN (
    'Study Visa', 'Work Opportunity', 'Overseas Careers', 'Business Visa',
    'Tourist Visa', 'Free International Resume', 'Document Verification',
    'Offer Letter Check', 'Agency / Employer Check', 'Consultation', 'Other'
  )
  AND (image_url IS NULL OR image_url LIKE '%/storage/v1/object/public/site-images/reviews/%')
);

CREATE POLICY "public_read_active_jobs"
ON public.career_jobs FOR SELECT TO anon, authenticated
USING (is_active = true);

-- Storage: visitors do not upload directly. submit-review uploads using the
-- service role. Public visitors only need read access to published images.
DROP POLICY IF EXISTS "Public can upload site images" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Avenix public review uploads" ON storage.objects;
DROP POLICY IF EXISTS "Avenix admin image uploads" ON storage.objects;
DROP POLICY IF EXISTS "Avenix public image read" ON storage.objects;
DROP POLICY IF EXISTS "Avenix admin image updates" ON storage.objects;
DROP POLICY IF EXISTS "Avenix admin image deletes" ON storage.objects;

CREATE POLICY "Avenix admin image uploads"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'site-images'
  AND (name LIKE 'careers/%' OR name LIKE 'reviews/%')
  AND lower(coalesce(auth.jwt() ->> 'email','')) IN (
    'affysiddiqui98@gmail.com', 'avenixoverseas@gmail.com',
    'avenixoverseas1@gmail.com', 'contact@avenixoverseas.com'
  )
);

CREATE POLICY "Avenix public image read"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'site-images');

CREATE POLICY "Avenix public review uploads"
ON storage.objects FOR INSERT TO anon
WITH CHECK (bucket_id = 'site-images' AND name LIKE 'reviews/%');

CREATE POLICY "Avenix admin image updates"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'site-images'
  AND lower(coalesce(auth.jwt() ->> 'email','')) IN (
    'affysiddiqui98@gmail.com', 'avenixoverseas@gmail.com',
    'avenixoverseas1@gmail.com', 'contact@avenixoverseas.com'
  )
)
WITH CHECK (bucket_id = 'site-images');

CREATE POLICY "Avenix admin image deletes"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'site-images'
  AND lower(coalesce(auth.jwt() ->> 'email','')) IN (
    'affysiddiqui98@gmail.com', 'avenixoverseas@gmail.com',
    'avenixoverseas1@gmail.com', 'contact@avenixoverseas.com'
  )
);


-- Realtime: allow the public Reviews page to receive newly published reviews
-- immediately. This is safe because the table already exposes only published
-- rows through the SELECT policy above.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'reviews'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reviews;
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;
