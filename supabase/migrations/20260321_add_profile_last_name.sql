-- Add last_name field to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name text;

COMMENT ON COLUMN profiles.last_name IS 'User last name (surname)';
