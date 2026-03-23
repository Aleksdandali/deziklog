-- Add Nova Poshta delivery fields to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS city_ref TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS warehouse_ref TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS warehouse_name TEXT;
