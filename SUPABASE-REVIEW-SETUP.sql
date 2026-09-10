-- Avenix Overseas — Review page setup / repair
-- Run this in the SAME Supabase project used by Work Opportunity.
-- It is safe to run more than once. It does not modify Admin functionality.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name text NOT NULL,
  place text,
  service text NOT NULL,
  rating integer NOT NULL DEFAULT 10 CHECK (rating BETWEEN 1 AND 10),
  review_text text NOT NULL,
  image_url text,
  is_visible boolean NOT NULL DEFAULT true,
  admin_reply text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS client_name text;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS place text;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS service text;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS rating integer DEFAULT 10;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS review_text text;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS is_visible boolean DEFAULT true;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS admin_reply text;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

UPDATE public.reviews SET is_visible = true WHERE is_visible IS NULL;
UPDATE public.reviews SET created_at = now() WHERE created_at IS NULL;

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_visible_reviews" ON public.reviews;
CREATE POLICY "public_read_visible_reviews"
ON public.reviews FOR SELECT TO anon, authenticated
USING (is_visible = true);

GRANT SELECT ON public.reviews TO anon, authenticated;

-- Public clients may submit only a newly-published review. They cannot update
-- or delete reviews, and they cannot create an admin reply. The browser still
-- uses the same Supabase project as Work Opportunity.
GRANT INSERT, SELECT ON public.reviews TO anon;
DROP POLICY IF EXISTS "public_submit_reviews" ON public.reviews;
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
REVOKE UPDATE, DELETE ON public.reviews FROM anon;

-- Create the existing shared image bucket if it does not already exist.
INSERT INTO storage.buckets (id, name, public)
VALUES ('site-images', 'site-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Avenix public image read" ON storage.objects;
CREATE POLICY "Avenix public image read"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'site-images');

-- Direct client uploads are limited to the reviews/ folder. The page itself
-- validates PNG/JPEG/WebP/GIF and a 5 MB maximum before uploading.
DROP POLICY IF EXISTS "Avenix public review uploads" ON storage.objects;
CREATE POLICY "Avenix public review uploads"
ON storage.objects FOR INSERT TO anon
WITH CHECK (bucket_id = 'site-images' AND name LIKE 'reviews/%');

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

-- The Review page now prefers direct Supabase INSERT + Storage upload, so no Edge
-- Function deployment is required. The existing submit-review function remains as
-- a compatibility fallback for older deployments.
