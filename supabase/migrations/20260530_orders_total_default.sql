-- Regression fix following H4 (drop client-supplied total_amount):
--
-- create_orders.sql declares `total_amount NUMERIC NOT NULL DEFAULT 0`, but
-- the production `orders` table was created earlier (before that file existed)
-- and CREATE TABLE IF NOT EXISTS never re-applied the DEFAULT. So when the
-- client stopped sending total_amount, PostgREST issued an INSERT without
-- the column and the DB rejected it with code 23502:
--   null value in column "total_amount" of relation "orders" violates
--   not-null constraint
--
-- The recompute_order_total AFTER trigger (20260514) still fills the real
-- value once order_items are inserted; DEFAULT 0 is only needed to satisfy
-- the NOT NULL check at INSERT time.
--
-- Idempotent: re-applying SET DEFAULT on a column that already has it is a
-- no-op.

ALTER TABLE public.orders
  ALTER COLUMN total_amount SET DEFAULT 0;
