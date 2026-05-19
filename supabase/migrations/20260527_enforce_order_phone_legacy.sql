-- M5: close phone-spoofing gap for legacy email-only accounts.
--
-- The 20260521 enforce_order_phone trigger overwrites orders.phone with
-- auth.users.phone when the latter is set. For legacy users created before
-- the phone-OTP migration (20260512), auth.users.phone is NULL — the trigger
-- silently lets them submit ANY phone, which then drives KeyCRM buyer
-- attribution and the Nova Poshta TTN. A malicious legacy client could ship
-- to a victim and bill them.
--
-- Fix: block the insert/update outright when auth phone is missing.
-- These users must add a phone via the standard phone-OTP flow before
-- placing orders.

CREATE OR REPLACE FUNCTION public.enforce_order_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_auth_phone text;
BEGIN
  SELECT phone INTO v_auth_phone FROM auth.users WHERE id = NEW.user_id;
  IF v_auth_phone IS NULL OR v_auth_phone = '' THEN
    -- Surfaced to the client as the order error message.
    RAISE EXCEPTION 'Додайте номер телефону у профілі перед оформленням замовлення'
      USING ERRCODE = 'P0001';
  END IF;
  -- Supabase stores phone without leading '+'; normalize to E.164 for orders.
  NEW.phone := CASE
    WHEN v_auth_phone LIKE '+%' THEN v_auth_phone
    ELSE '+' || v_auth_phone
  END;
  RETURN NEW;
END;
$$;
