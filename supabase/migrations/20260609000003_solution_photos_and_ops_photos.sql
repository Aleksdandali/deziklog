-- =====================================================================
-- H3 + ops-photos hardening (follow-up to the 2026-06-08 isolation test).
-- =====================================================================

-- ── H3: create the missing `solution-photos` bucket ──────────────────
-- app/solution/add.tsx uploads to `${userId}/${solutionId}/photo.${ext}` and
-- app/solution/[id].tsx reads via createSignedUrl — but the bucket never
-- existed (uploads 404'd). Create it PRIVATE with per-{user_id}-folder RLS,
-- mirroring cycle-photos (20260518). Fixes the broken feature AND isolates it.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('solution-photos', 'solution-photos', false, 10485760,
        ARRAY['image/jpeg','image/png','image/webp','image/heic'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users read own solution photos" ON storage.objects;
CREATE POLICY "Users read own solution photos" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'solution-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users insert own solution photos" ON storage.objects;
CREATE POLICY "Users insert own solution photos" ON storage.objects FOR INSERT TO public
  WITH CHECK (bucket_id = 'solution-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users update own solution photos" ON storage.objects;
CREATE POLICY "Users update own solution photos" ON storage.objects FOR UPDATE TO public
  USING      (bucket_id = 'solution-photos' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'solution-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users delete own solution photos" ON storage.objects;
CREATE POLICY "Users delete own solution photos" ON storage.objects FOR DELETE TO public
  USING (bucket_id = 'solution-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ── ops-photos: remove the open public INSERT policy ─────────────────
-- The `ops-photos` bucket (public-read) had `ops_photos_upload` allowing the
-- `public` role to INSERT with no auth and no folder check — anyone could
-- upload arbitrary files to it. No app code references ops-photos, so dropping
-- the open INSERT closes the abuse vector. Legitimate writes (admin/ops via
-- service_role) bypass RLS and are unaffected. Public read is left intact.
DROP POLICY IF EXISTS "ops_photos_upload" ON storage.objects;
