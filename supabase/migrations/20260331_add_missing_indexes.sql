-- Add missing indexes for query performance
CREATE INDEX IF NOT EXISTS idx_orders_keycrm_order_id
  ON orders (keycrm_order_id)
  WHERE keycrm_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_solutions_expires_at
  ON solutions (expires_at);

CREATE INDEX IF NOT EXISTS idx_orders_sync_status
  ON orders (keycrm_sync_status)
  WHERE keycrm_sync_status IN ('pending', 'failed');
