import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const ADMIN_EMAIL = "affysiddiqui98@gmail.com";
const STAFF_EMAILS = [
  "avenixoverseas@gmail.com",
  "avenixoverseas1@gmail.com",
  "contact@avenixoverseas.com",
];
const ALLOWED_EMAILS = new Set([ADMIN_EMAIL, ...STAFF_EMAILS]);

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ ok: false }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error("Missing server configuration.");
      return json({ ok: false }, 500);
    }

    const token = authHeader.slice(7).trim();
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error: userError } = await authClient.auth.getUser(token);
    const callerEmail = user?.email?.toLowerCase() || "";
    if (userError || callerEmail !== ADMIN_EMAIL) return json({ ok: false }, 403);

    let payload: {
      target_email?: unknown;
      new_password?: unknown;
      current_admin_password?: unknown;
    };
    try {
      payload = await req.json();
    } catch {
      return json({ ok: false }, 400);
    }

    const target = String(payload.target_email ?? "").trim().toLowerCase();
    const newPassword = String(payload.new_password ?? "");
    const currentAdminPassword = String(payload.current_admin_password ?? "");

    if (!ALLOWED_EMAILS.has(target) || newPassword.length < 8) {
      return json({ ok: false }, 400);
    }

    // When changing the Admin account itself, require verification of the
    // current Admin password. Staff password changes do not require it.
    if (target === ADMIN_EMAIL) {
      if (!currentAdminPassword) return json({ ok: false }, 400);

      const passwordClient = createClient(supabaseUrl, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { error: passwordError } = await passwordClient.auth.signInWithPassword({
        email: ADMIN_EMAIL,
        password: currentAdminPassword,
      });
      if (passwordError) return json({ ok: false }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let targetUser: { id: string; email?: string | null } | null = null;
    for (let page = 1; page <= 20 && !targetUser; page++) {
      const { data, error } = await adminClient.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (error) {
        console.error("Unable to locate target account.");
        return json({ ok: false }, 500);
      }
      targetUser = data.users.find(
        (candidate) => (candidate.email || "").toLowerCase() === target,
      ) || null;
      if (data.users.length < 1000) break;
    }

    if (!targetUser) return json({ ok: false }, 404);

    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      targetUser.id,
      { password: newPassword },
    );

    if (updateError) {
      console.error("Password update failed.");
      return json({ ok: false }, 500);
    }

    return json({ ok: true });
  } catch (error) {
    console.error("Unexpected password function error.", error);
    return json({ ok: false }, 500);
  }
});
