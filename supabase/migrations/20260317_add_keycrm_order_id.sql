-- Add KeyCRM order ID reference to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS keycrm_order_id INTEGER;
