-- SECURITY: prevent client-side price manipulation.
-- Before this migration, lib/api.ts createOrder() let the client set
-- price_at_order and total_amount directly. An attacker could intercept the
-- request and set price_at_order = 0, then receive products for free.
--
-- After this migration:
--   1. BEFORE INSERT on order_items overwrites price_at_order with the current
--      products.price, and rejects out-of-stock products.
--   2. AFTER INSERT/UPDATE/DELETE on order_items recomputes orders.total_amount
--      as SUM(price_at_order * quantity). Client-supplied total_amount is
--      silently overridden.

-- ── 1. Force price_at_order to authoritative products.price ──────────────────
CREATE OR REPLACE FUNCTION public.enforce_order_item_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_price NUMERIC;
  v_in_stock BOOLEAN;
  v_name TEXT;
BEGIN
  SELECT price, in_stock, name
    INTO v_price, v_in_stock, v_name
    FROM products
   WHERE id = NEW.product_id;

  IF v_price IS NULL THEN
    RAISE EXCEPTION 'Product % does not exist', NEW.product_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_in_stock IS NOT TRUE THEN
    RAISE EXCEPTION 'Product "%" is out of stock', v_name
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.quantity IS NULL OR NEW.quantity < 1 THEN
    RAISE EXCEPTION 'Quantity must be >= 1'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Authoritative price + name come from the DB, not the client.
  NEW.price_at_order := v_price;
  NEW.product_name   := v_name;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_item_price ON public.order_items;
CREATE TRIGGER trg_enforce_order_item_price
  BEFORE INSERT OR UPDATE OF product_id, quantity ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_order_item_price();

-- ── 2. Recompute orders.total_amount from authoritative line items ───────────
CREATE OR REPLACE FUNCTION public.recompute_order_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_total NUMERIC;
BEGIN
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);

  SELECT COALESCE(SUM(price_at_order * quantity), 0)
    INTO v_total
    FROM order_items
   WHERE order_id = v_order_id;

  UPDATE orders SET total_amount = v_total WHERE id = v_order_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_order_total ON public.order_items;
CREATE TRIGGER trg_recompute_order_total
  AFTER INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.recompute_order_total();
