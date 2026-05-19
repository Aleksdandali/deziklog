-- Per-user daily counter for KeyCRM order-history fetches.
-- Used by supabase/functions/get-keycrm-history to cap KeyCRM API quota.
-- Mirrors keycrm_lookup_usage (see 20260516_keycrm_lookup_rate_limit.sql).

CREATE TABLE IF NOT EXISTS public.keycrm_history_usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day DATE NOT NULL DEFAULT CURRENT_DATE,
  count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

ALTER TABLE public.keycrm_history_usage ENABLE ROW LEVEL SECURITY;

-- Atomically increment + return current count.
CREATE OR REPLACE FUNCTION public.increment_keycrm_history_usage(p_user_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO keycrm_history_usage (user_id, day, count, updated_at)
  VALUES (p_user_id, CURRENT_DATE, 1, now())
  ON CONFLICT (user_id, day) DO UPDATE
    SET count = keycrm_history_usage.count + 1,
        updated_at = now()
  RETURNING count INTO v_count;
  RETURN v_count;
END;
$$;
