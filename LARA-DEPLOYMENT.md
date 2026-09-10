# Lara AI — Avenix Overseas deployment

The current website already contains the Lara chat interface and the `lara-chat` Supabase Edge Function. Lara uses Gemini server-side and never exposes the Gemini or service-role secrets to the browser.

## 1. Run the SQL

In Supabase SQL Editor, run:

`LARA-SUPABASE-SETUP.sql`

This creates the `lara_leads` table and protects it with RLS. The public browser cannot read or write leads directly.

## 2. Create the Gemini API key

Create a Gemini API key in Google AI Studio. Free-tier availability and quotas are controlled by Google and can change.

Do not put the key into `js/`, HTML, CSS, or the website source.

## 3. Link Supabase CLI

```bash
supabase login
supabase link --project-ref nfkndcvoxkjxhoiabmdl
```

## 4. Set server-side secrets

```bash
supabase secrets set GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
supabase secrets set GEMINI_MODEL="gemini-2.5-flash"
supabase secrets set SITE_ORIGIN="https://avenixoverseas.com"
```

Never put `SUPABASE_SERVICE_ROLE_KEY` in the website.

## 5. Deploy Lara

From the folder containing `supabase/`:

```bash
supabase functions deploy lara-chat --no-verify-jwt
```

The function also contains a fallback: if Google Search grounding is unavailable for the account/model, it retries the Gemini request without grounding.

## 6. What Lara can do

- Understand greetings, typos, stretched words and casual conversation.
- Automatically reply in the user's language/style, including English, Urdu, Roman Urdu and Hindi.
- Answer general AI/general-knowledge questions.
- Explain who Lara is and the reason for her name.
- Answer Avenix-specific questions from verified website/public Supabase data.
- Use current web grounding for current/latest questions when Gemini makes that tool available.
- Give useful education, jobs, business, tourism, documentation and visa guidance without guaranteeing outcomes.
- Offer lead collection only after clear service interest or a detailed service/pathway question.
- Save leads securely through the Edge Function into `lara_leads`.

## 7. Lead fields

Lara can collect:

- Full name
- WhatsApp number
- Email
- Country of residence
- Service interest
- Preferred destination
- Enquiry
- Consent to contact

Lara never asks for passwords, OTPs, card/bank details or sensitive documents.
