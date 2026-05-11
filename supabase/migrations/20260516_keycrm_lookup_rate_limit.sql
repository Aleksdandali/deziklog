-- Per-user daily counter for KeyCRM buyer lookups.
-- Used by supabase/functions/lookup-keycrm-buyer to cap KeyCRM API quota.

CREATE TABLE IF NOT EXISTS public.keycrm_lookup_usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day DATE NOT NULL DEFAULT CURRENT_DATE,
  count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

ALTER TABLE public.keycrm_lookup_usage ENABLE ROW LEVEL SECURITY;

-- Atomically increment + return current count.
CREATE OR REPLACE FUNCTION public.increment_keycrm_lookup_usage(p_user_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO keycrm_lookup_usage (user_id, day, count, updated_at)
  VALUES (p_user_id, CURRENT_DATE, 1, now())
  ON CONFLICT (user_id, day) DO UPDATE
    SET count = keycrm_lookup_usage.count + 1,
        updated_at = now()
  RETURNING count INTO v_count;
  RETURN v_count;
END;
$$;
