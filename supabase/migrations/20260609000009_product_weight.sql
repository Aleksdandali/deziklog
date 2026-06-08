-- K7: sync-products-to-keycrm hardcoded weight=0.5kg for every product, so
-- KeyCRM computed wrong Nova Poshta shipping for heavier items (sterilizers).
-- Add an optional per-product weight; the edge function already falls back to
-- 0.5 when it's null/0, so this is a no-op until weights are filled in.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS weight NUMERIC;

COMMENT ON COLUMN public.products.weight IS
  'Shipping weight in kg, pushed to KeyCRM. NULL → sync falls back to 0.5kg.';
