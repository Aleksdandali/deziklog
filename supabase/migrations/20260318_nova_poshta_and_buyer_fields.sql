-- Add buyer name and Nova Poshta shipping fields to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS city_ref TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS city_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS warehouse_ref TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS warehouse_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS np_ttn TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS np_delivery_cost NUMERIC;
