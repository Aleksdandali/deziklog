-- Add role field to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'owner';
-- Valid values: 'owner', 'staff'

-- Add notification preferences to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notification_cycle_done boolean NOT NULL DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notification_cycle_idle boolean NOT NULL DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notification_order_status boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN profiles.role IS 'User role: owner (salon owner) or staff (master/worker)';
COMMENT ON COLUMN profiles.notification_cycle_done IS 'Notify when sterilization cycle completes';
COMMENT ON COLUMN profiles.notification_cycle_idle IS 'Notify when no cycles for extended period';
COMMENT ON COLUMN profiles.notification_order_status IS 'Notify when order status changes';
