-- Remove all Microstop sterilizers from the catalog (per business decision).
-- order_items.product_id is ON DELETE SET NULL (create_orders.sql), so existing
-- order history is preserved — the line item keeps its denormalized data and only
-- the product foreign key is nulled out. Idempotent: re-running deletes 0 rows.
DELETE FROM public.products WHERE name ILIKE '%Мікростоп%';
