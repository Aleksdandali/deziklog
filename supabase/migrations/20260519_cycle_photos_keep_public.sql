-- Revert public=false from 20260518 — cycle-photos must remain public.
-- Admin panel reads photos via getPublicUrl; mobile uses createSignedUrl
-- with a getPublicUrl fallback. Photo paths embed UUIDs (user_id +
-- session_id), so URLs are effectively unguessable to outsiders.
--
-- RLS policies from 20260518 still restrict client INSERT/UPDATE/DELETE
-- to each user's own folder, which is the actual abuse vector.

UPDATE storage.buckets SET public = true WHERE id = 'cycle-photos';
