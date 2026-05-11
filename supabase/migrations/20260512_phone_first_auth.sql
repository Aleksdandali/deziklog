-- Phone+SMS OTP auth migration.
-- After this migration: auth.users.phone is the canonical identifier.
-- email column on profiles is optional (populated from KeyCRM or manual entry).

-- Ensure email column exists (nullable). Idempotent.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;
-- If it already existed with NOT NULL, relax it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'email' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE profiles ALTER COLUMN email DROP NOT NULL;
  END IF;
END $$;

-- Auto-create a profile row when a user signs up via phone OTP.
-- Closes the race where SIGNED_IN fires before any profile exists and RLS
-- query returns empty.
CREATE OR REPLACE FUNCTION public.handle_new_user_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, phone, created_at, updated_at)
  VALUES (NEW.id, NEW.phone, NOW(), NOW())
  ON CONFLICT (id) DO UPDATE SET phone = EXCLUDED.phone, updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_phone();
