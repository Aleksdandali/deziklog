-- Add pouch_size column to sterilization_sessions
-- Stores the selected pouch size label (e.g. '75×150 мм') or 'none' for no pouch
ALTER TABLE sterilization_sessions
  ADD COLUMN IF NOT EXISTS pouch_size text;

COMMENT ON COLUMN sterilization_sessions.pouch_size IS 'Pouch size label, e.g. 75×150 мм, or none';
