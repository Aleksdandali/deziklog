-- Track KeyCRM sync status for retry logic
ALTER TABLE orders ADD COLUMN IF NOT EXISTS keycrm_sync_status TEXT DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS keycrm_sync_error TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS keycrm_sync_attempts INTEGER DEFAULT 0;

-- Index for retry queries
CREATE INDEX IF NOT EXISTS idx_orders_sync_status
  ON orders(keycrm_sync_status) WHERE keycrm_sync_status IN ('pending', 'failed');
