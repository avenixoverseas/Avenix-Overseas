import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public anonymous review submissions do not use cookies/credentials, so wildcard CORS
// avoids failures when the same site is opened from www/non-www or a preview domain.
const origin = "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const BUCKET = "site-images";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT = 2500;
const allowedServices = new Set([
  "Study Visa", "Work Opportunity", "Overseas Careers", "Business Visa",
  "Tourist Visa", "Free International Resume", "Document Verification",
  "Offer Letter Check", "Agency / Employer Check", "Consultation", "Other",
]);
const allowedImageTypes = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif",
]);

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function clean(value: unknown, max: number) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function safeFileName(name: string) {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.slice(-80) || "review-image";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);

  let uploadedPath: string | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("submit-review: missing Supabase server configuration");
      return json({ ok: false, error: "Review service is not configured." }, 500);
    }

    const contentType = req.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      return json({ ok: false, error: "Review form data is invalid." }, 400);
    }

    const form = await req.formData();
    const client_name = clean(form.get("client_name"), 120);
    const place = clean(form.get("place"), 120);
    const service = clean(form.get("service"), 80);
    const review_text = clean(form.get("review_text"), MAX_TEXT);
    const rating = Number(form.get("rating"));
    const imageValue = form.get("image");
    const image = imageValue instanceof File ? imageValue : null;

    if (!client_name || !service || !allowedServices.has(service) || !review_text) {
      return json({ ok: false, error: "Please provide valid review details." }, 400);
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
      return json({ ok: false, error: "Please select a rating from 1 to 10." }, 400);
    }
    if (review_text.split(/\s+/).filter(Boolean).length < 10) {
      return json({ ok: false, error: "Please write at least 10 words about your experience." }, 400);
    }
    if (image) {
      if (!allowedImageTypes.has(image.type) || image.size > MAX_IMAGE_BYTES) {
        return json({ ok: false, error: "Image must be PNG, JPEG, WebP or GIF and no larger than 5 MB." }, 400);
      }
    }

    const db = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let image_url: string | null = null;
    if (image) {
      uploadedPath = `reviews/${crypto.randomUUID()}-${safeFileName(image.name)}`;
      const bytes = await image.arrayBuffer();
      const upload = await db.storage.from(BUCKET).upload(
        uploadedPath,
        new Blob([bytes], { type: image.type }),
        { contentType: image.type, cacheControl: "3600", upsert: false },
      );
      if (upload.error) {
        console.error("submit-review: image upload failed", upload.error.message);
        return json({ ok: false, error: "Image upload failed. Please check Supabase Storage configuration." }, 500);
      }
      image_url = db.storage.from(BUCKET).getPublicUrl(uploadedPath).data.publicUrl;
    }

    const { data: review, error: insertError } = await db
      .from("reviews")
      .insert({
        client_name,
        place: place || null,
        service,
        rating,
        review_text,
        image_url,
        is_visible: true,
        admin_reply: null,
      })
      .select("id,client_name,place,service,rating,review_text,image_url,is_visible,admin_reply,created_at")
      .single();

    if (insertError || !review) {
      if (uploadedPath) await db.storage.from(BUCKET).remove([uploadedPath]);
      console.error("submit-review: review insert failed", insertError?.message);
      return json({ ok: false, error: "Review could not be saved to Supabase." }, 500);
    }

    return json({ ok: true, review });
  } catch (error) {
    console.error("submit-review: unexpected error", error);
    return json({ ok: false, error: "Review could not be saved to Supabase." }, 500);
  }
});
