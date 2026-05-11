-- Per-user daily counter for AI assistant calls.
-- Used by supabase/functions/ai-assistant to cap Claude API spend per user.

CREATE TABLE IF NOT EXISTS public.ai_chat_usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day DATE NOT NULL DEFAULT CURRENT_DATE,
  count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

ALTER TABLE public.ai_chat_usage ENABLE ROW LEVEL SECURITY;

-- Only service role writes/reads — no client-facing policies needed.

-- Atomically increment + return current count.
CREATE OR REPLACE FUNCTION public.increment_ai_chat_usage(p_user_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO ai_chat_usage (user_id, day, count, updated_at)
  VALUES (p_user_id, CURRENT_DATE, 1, now())
  ON CONFLICT (user_id, day) DO UPDATE
    SET count = ai_chat_usage.count + 1,
        updated_at = now()
  RETURNING count INTO v_count;
  RETURN v_count;
END;
$$;
