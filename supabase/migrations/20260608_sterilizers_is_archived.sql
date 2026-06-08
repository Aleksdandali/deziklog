-- Soft-delete / archive support for sterilizers.
-- A sterilizer referenced by existing sterilization_sessions cannot be hard-deleted
-- (FK sterilization_sessions.sterilizer_id -> sterilizers.id). Instead of failing
-- silently, the app archives it: hidden from the cabinet list and the new-cycle
-- selector, while the journal keeps the denormalized sterilizer_name intact.

ALTER TABLE public.sterilizers
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

-- Existing RLS policies (auth.uid() = user_id for select/update/delete) already
-- cover this column; no additional policy needed.
