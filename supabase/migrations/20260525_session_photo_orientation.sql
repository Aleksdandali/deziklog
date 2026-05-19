-- Store EXIF Orientation for cycle photos so the client can render them upright.
-- React Native's <Image> ignores EXIF, so iPhone portrait shots (Orientation=6,
-- i.e. 90° CW rotation needed) display sideways unless the client rotates them
-- via a CSS transform. We persist the value at capture so every screen that
-- shows the photo (cycle detail, story share, etc.) can apply the same rotation.
--
-- Allowed values mirror the EXIF standard: 1 (normal), 3 (180°), 6 (90° CW), 8 (270° CW).
-- NULL = unknown / treat as no rotation (matches old rows pre-migration).

ALTER TABLE public.sterilization_sessions
  ADD COLUMN IF NOT EXISTS photo_before_orientation smallint,
  ADD COLUMN IF NOT EXISTS photo_after_orientation smallint;
