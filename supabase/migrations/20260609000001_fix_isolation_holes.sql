-- =====================================================================
-- Fix 3 isolation holes confirmed by the 2026-06-08 live test.
-- (docs/SECURITY-ISOLATION-TEST-2026-06-08.md)
-- =====================================================================

-- ── H1: cycle-photos cross-user READ leak ────────────────────────────
-- A blanket "Public read cycle photos" SELECT policy (roles=public,
-- USING bucket_id='cycle-photos', NO folder check) was OR-ed with the
-- correct per-folder policy, so any authenticated user could read every
-- user's cycle photos. Remove the blanket policy; keep the folder-gated one.
DROP POLICY IF EXISTS "Public read cycle photos" ON storage.objects;

-- Harden the UPDATE policy with WITH CHECK so an object cannot be relocated
-- into another user's folder (audit M finding).
DROP POLICY IF EXISTS "Users update own cycle photos" ON storage.objects;
CREATE POLICY "Users update own cycle photos" ON storage.objects FOR UPDATE TO public
  USING      (bucket_id = 'cycle-photos' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'cycle-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ── H2a: orders — remove client UPDATE entirely ──────────────────────
-- The app never UPDATEs orders (createOrder = INSERT + own-scoped DELETE +
-- SELECT only; verified in lib/api.ts). authenticated/anon held a TABLE-level
-- UPDATE grant which made the column-level REVOKEs (20260517/20260520/20260521)
-- no-ops. Revoke the table grant AND every residual column-level UPDATE grant.
-- service_role keeps its grants (sync edge fns + recompute trigger run as
-- service_role / SECURITY DEFINER).
REVOKE UPDATE ON public.orders FROM authenticated, anon;
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT column_name FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'orders'
  LOOP
    EXECUTE format('REVOKE UPDATE (%I) ON public.orders FROM authenticated, anon', c);
  END LOOP;
END $$;

-- ── H2b: orders — sanitize server-managed columns at INSERT ───────────
-- authenticated/anon also held table-level INSERT, so the same columns were
-- settable at INSERT time (e.g. status='shipped', keycrm_order_id, np_ttn).
-- A BEFORE INSERT trigger force-resets them for CLIENT roles only (service_role
-- and SECURITY DEFINER system inserts are left untouched). Mirrors the pattern
-- of enforce_order_item_price. The client legitimately sends status='pending'
-- (re-forced here) + delivery fields (untouched).
CREATE OR REPLACE FUNCTION public.sanitize_order_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER          -- must see the real caller role via current_user
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.status                 := 'pending';
    NEW.total_amount           := 0;        -- recompute_order_total fills the real value from items
    NEW.keycrm_order_id        := NULL;
    NEW.keycrm_sync_status     := 'pending';
    NEW.keycrm_sync_error      := NULL;
    NEW.keycrm_sync_started_at := NULL;
    NEW.np_ttn                 := NULL;
    NEW.np_delivery_cost       := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sanitize_order_insert ON public.orders;
CREATE TRIGGER trg_sanitize_order_insert
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.sanitize_order_insert();

-- ── H2c: profiles — keep role + keycrm_buyer_id server-controlled ─────
-- Same table-level-grant problem on profiles. The client upserts the full
-- profile object (name/salon/phone/city/address/email/expo_push_token…),
-- which is fine, but it must not change role (escalation surface) or
-- keycrm_buyer_id (server cache). A column-grant restriction would 42501 the
-- whole upsert when those keys are present in the payload, so use a trigger
-- that simply keeps those two columns server-controlled for client roles.
CREATE OR REPLACE FUNCTION public.protect_profile_managed_cols()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.role            := OLD.role;             -- cannot self-change role
      NEW.keycrm_buyer_id := OLD.keycrm_buyer_id;  -- cannot forge buyer link
    ELSIF TG_OP = 'INSERT' THEN
      NEW.role            := COALESCE(OLD.role, 'owner'); -- OLD is NULL on INSERT → default
      NEW.role            := 'owner';
      NEW.keycrm_buyer_id := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_protect_profile_managed_cols ON public.profiles;
CREATE TRIGGER trg_protect_profile_managed_cols
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_managed_cols();
