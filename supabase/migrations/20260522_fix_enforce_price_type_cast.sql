-- HOTFIX: checkout fails with PG error
--   "operator does not exist: uuid = text"
-- inside enforce_order_item_price() at `WHERE id = NEW.product_id`.
--
-- The two columns drifted in type at some point (products.id vs
-- order_items.product_id) and the bare equality no longer resolves an
-- operator. Cast both sides to TEXT — IDs are unique either as UUID or as
-- KeyCRM SKU strings, so text comparison still uniquely identifies the row.
-- This unblocks checkout without requiring a client release or a column
-- type migration (which would also need to migrate every existing
-- order_items row).

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
   WHERE id::text = NEW.product_id::text;

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

  NEW.price_at_order := v_price;
  NEW.product_name   := v_name;
  RETURN NEW;
END;
$$;
