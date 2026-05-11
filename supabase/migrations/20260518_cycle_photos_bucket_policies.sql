-- Pin the cycle-photos bucket policies in version control.
-- Path pattern: {user_id}/{session_id}/{type}.{ext}, so isolation is by
-- the first folder segment matching auth.uid().
--
-- Originally created via the Supabase dashboard; this migration makes the
-- expected policy set authoritative and idempotent.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cycle-photos',
  'cycle-photos',
  false,  -- signed URLs only
  10485760,  -- 10 MiB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
) ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Users can read only their own folder.
DROP POLICY IF EXISTS "Users read own cycle photos" ON storage.objects;
CREATE POLICY "Users read own cycle photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'cycle-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can upload only into their own folder.
DROP POLICY IF EXISTS "Users insert own cycle photos" ON storage.objects;
CREATE POLICY "Users insert own cycle photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'cycle-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can replace their own files (upload uses upsert: true).
DROP POLICY IF EXISTS "Users update own cycle photos" ON storage.objects;
CREATE POLICY "Users update own cycle photos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'cycle-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete their own files (delete-account also does it via service_role).
DROP POLICY IF EXISTS "Users delete own cycle photos" ON storage.objects;
CREATE POLICY "Users delete own cycle photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'cycle-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
