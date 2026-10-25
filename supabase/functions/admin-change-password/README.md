# Avenix Admin Password Edge Function

Function name:

`admin-change-password`

This function is the server-side password management endpoint for the Avenix Admin Panel.

## Authorisation

Only `affysiddiqui98@gmail.com` can call the function successfully.

The Admin can change passwords for:

- `affysiddiqui98@gmail.com`
- `avenixoverseas@gmail.com`
- `avenixoverseas1@gmail.com`
- `contact@avenixoverseas.com`

When changing the Admin password itself, the current Admin password is verified first.

## Secrets

The Supabase service-role key is used only inside the Edge Function. It must never be placed in frontend JavaScript.

Supabase provides `SUPABASE_URL` and `SUPABASE_ANON_KEY` to the Edge Function runtime. Configure `SUPABASE_SERVICE_ROLE_KEY` as an Edge Function secret.

## Deployment

Deploy this directory using the function name `admin-change-password`.

With the Supabase CLI:

```bash
supabase functions deploy admin-change-password --no-verify-jwt
```

Set the secret securely:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
```

In the Supabase Dashboard, keep **Verify JWT with legacy secret** OFF for this function because the function performs its own token validation with `auth.getUser()`.
