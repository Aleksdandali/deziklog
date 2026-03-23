-- 1. Profile delivery enhancements
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS delivery_type TEXT DEFAULT 'warehouse';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address_street TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address_building TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address_apartment TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS keycrm_buyer_id INTEGER;

-- 2. Order: separate buyer vs recipient + address delivery
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_first_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_last_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_type TEXT DEFAULT 'warehouse';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS address_street TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS address_building TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS address_apartment TEXT;

-- 3. Backfill: existing orders = buyer is recipient
UPDATE orders SET
  recipient_first_name = first_name,
  recipient_last_name = last_name,
  recipient_phone = phone
WHERE recipient_first_name IS NULL;
