-- Sterilizers can now have a photo (taken in-app or picked from gallery).
-- Stored in the existing `cycle-photos` bucket under path
-- `{user_id}/sterilizer/{sterilizer_id}.{ext}`.

ALTER TABLE public.sterilizers
  ADD COLUMN IF NOT EXISTS image_path TEXT;
