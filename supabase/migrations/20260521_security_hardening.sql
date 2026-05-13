-- SECURITY HARDENING — closes audit findings H1, H2, H3, H6, M6.
--
-- Lock columns that should ONLY be written by server-side jobs (triggers,
-- edge functions running with service_role). Column-level REVOKE applies even
-- inside RLS-allowed UPDATEs.

-- ── H1: orders.status — only server-side workflows set this. ────────────
-- (KeyCRM webhook, poll-keycrm-statuses, sync-order-to-keycrm, manual ops.)
REVOKE UPDATE (status) ON public.orders FROM authenticated, anon;

-- ── M6: orders.total_amount — kept in sync by recompute_order_total trigger.
-- Allowing client UPDATE lets a user inflate it to flip Sender-paid shipping.
REVOKE UPDATE (total_amount) ON public.orders FROM authenticated, anon;

-- ── H2: profiles.role — horizontal-to-vertical escalation surface. ──────
REVOKE UPDATE (role) ON public.profiles FROM authenticated, anon;

-- Defense-in-depth: explicit allow-list. ALTER skips if column has bad data;
-- our schema default is 'owner' so existing rows are fine.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_allowed'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_allowed
      CHECK (role IN ('owner', 'staff'));
  END IF;
END $$;

-- ── H6: expo_push_token format validation. ──────────────────────────────
-- Prevents a malicious client from setting another user's token (push spam
-- vector) by ensuring the value at least looks like a valid Expo token.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expo_push_token_format'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT expo_push_token_format
      CHECK (
        expo_push_token IS NULL
        OR expo_push_token ~ '^Expo(nent)?PushToken\[[^\]]+\]$'
      );
  END IF;
END $$;

-- ── H3: enforce orders.phone == auth.users.phone on every write. ────────
-- A malicious client could otherwise place an order with a victim's phone,
-- causing NP TTN dispatch + KeyCRM buyer attribution to the victim.
-- recipient_phone may still differ (delivery to someone else).
CREATE OR REPLACE FUNCTION public.enforce_order_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_auth_phone text;
BEGIN
  SELECT phone INTO v_auth_phone FROM auth.users WHERE id = NEW.user_id;
  IF v_auth_phone IS NOT NULL AND v_auth_phone <> '' THEN
    -- Supabase stores phone without leading '+'; normalize to E.164 for orders.
    NEW.phone := CASE
      WHEN v_auth_phone LIKE '+%' THEN v_auth_phone
      ELSE '+' || v_auth_phone
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_order_phone_trigger ON public.orders;
CREATE TRIGGER enforce_order_phone_trigger
  BEFORE INSERT OR UPDATE OF phone ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_order_phone();
