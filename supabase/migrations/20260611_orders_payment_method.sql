-- Payment method chosen at checkout (app key: 'nalozhka' = накладений платіж,
-- 'rozrahunok' = розрахунковий рахунок). Synced to the KeyCRM order as a payment
-- line (sync-logic resolves the KeyCRM payment_method_id by name).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method TEXT;
