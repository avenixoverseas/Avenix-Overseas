-- ============================================================
-- AVENIX OVERSEAS — LARA AI + LEADS SUPABASE SETUP
-- ============================================================
-- Safe to run after the Review/Hiring SQL already applied.
-- Does NOT delete existing data or Auth users.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.lara_leads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name text NOT NULL,
    whatsapp text NOT NULL,
    email text,
    country_of_residence text,
    service_interest text NOT NULL,
    preferred_destination text NOT NULL,
    enquiry text NOT NULL,
    session_id text,
    source text NOT NULL DEFAULT 'lara',
    status text NOT NULL DEFAULT 'new',
    consent boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT lara_leads_status_check CHECK (status IN ('new','contacted','in_progress','converted','closed')),
    CONSTRAINT lara_leads_consent_check CHECK (consent = true)
);

ALTER TABLE public.lara_leads ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS lara_leads_created_at_idx
ON public.lara_leads (created_at DESC);

CREATE INDEX IF NOT EXISTS lara_leads_status_idx
ON public.lara_leads (status);

CREATE INDEX IF NOT EXISTS lara_leads_service_idx
ON public.lara_leads (service_interest);

-- No anonymous browser INSERT/SELECT/UPDATE/DELETE.
-- Lara's Edge Function uses the server-side service-role key to insert leads.
REVOKE ALL ON public.lara_leads FROM anon;
REVOKE ALL ON public.lara_leads FROM authenticated;

-- Authorized Avenix Admin accounts can read and manage leads.
DROP POLICY IF EXISTS "avenix_admin_lara_leads_all" ON public.lara_leads;

CREATE POLICY "avenix_admin_lara_leads_all"
ON public.lara_leads
FOR ALL
TO authenticated
USING (
    lower(coalesce(auth.jwt() ->> 'email', '')) IN (
        'affysiddiqui98@gmail.com',
        'avenixoverseas@gmail.com',
        'avenixoverseas1@gmail.com',
        'contact@avenixoverseas.com'
    )
)
WITH CHECK (
    lower(coalesce(auth.jwt() ->> 'email', '')) IN (
        'affysiddiqui98@gmail.com',
        'avenixoverseas@gmail.com',
        'avenixoverseas1@gmail.com',
        'contact@avenixoverseas.com'
    )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lara_leads TO authenticated;

-- Automatically maintain updated_at when an Admin changes a lead.
CREATE OR REPLACE FUNCTION public.set_lara_lead_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lara_leads_updated_at
ON public.lara_leads;

CREATE TRIGGER lara_leads_updated_at
BEFORE UPDATE ON public.lara_leads
FOR EACH ROW
EXECUTE FUNCTION public.set_lara_lead_updated_at();

-- Verification
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'lara_leads'
ORDER BY ordinal_position;

SELECT policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'lara_leads';

-- ============================================================
-- END LARA SETUP
-- ============================================================
