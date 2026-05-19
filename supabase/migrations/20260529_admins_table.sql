-- H1-followup: move admin entitlements from a hardcoded ADMIN_EMAILS array
-- in the (planned) admin panel to a DB-side membership table.
--
-- Why a separate table instead of profiles.role:
--   profiles.role is 'owner' | 'staff' — salon-facing. Platform admin is a
--   different concept (cross-tenant access to all data) that shouldn't share
--   an enum or get conflated in queries that filter by salon role.
--
-- Threat closed: the previous design embedded the admin whitelist in the
-- admin panel's middleware. Adding/removing an admin required a code push;
-- a stolen build artefact would reveal the admin list. With a DB table,
-- entitlement is a single SQL statement and reads are gated by RLS.
--
-- Reads from clients are forbidden — only service_role (server-side admin
-- panel) and SECURITY DEFINER functions can see the table. The
-- `is_admin()` helper exposes only a boolean answer.

CREATE TABLE IF NOT EXISTS public.admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT
);

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

-- No client policies on purpose: authenticated/anon get zero rows. The admin
-- panel reads via service_role which bypasses RLS; the is_admin() helper
-- below is SECURITY DEFINER and can read regardless.

-- Boolean entitlement check. SECURITY DEFINER so RLS doesn't apply.
-- Stable so PostgREST can call it in policies efficiently.
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admins WHERE user_id = p_user_id);
$$;

-- Let any authenticated client call the helper for their own uid (e.g. mobile
-- could conditionally show admin links). anon doesn't need this — auth.uid()
-- returns NULL there, which always yields false.
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;

-- Seed the bootstrap admin (idempotent). This is the same email that lived
-- in the gitignored ADMIN-PANEL-PROMPT whitelist. Future grants are plain
-- INSERTs run with service_role.
DO $$
DECLARE
  v_uid UUID;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = 'gloss.odessa@gmail.com' LIMIT 1;
  IF v_uid IS NOT NULL THEN
    INSERT INTO public.admins (user_id, note)
    VALUES (v_uid, 'Bootstrap admin (developer)')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;
