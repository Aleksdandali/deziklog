-- Add Expo Push Token to profiles for server-side push notifications
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS expo_push_token text;

-- Index for efficient token lookups when sending pushes
CREATE INDEX IF NOT EXISTS idx_profiles_push_token
  ON profiles (expo_push_token)
  WHERE expo_push_token IS NOT NULL;
