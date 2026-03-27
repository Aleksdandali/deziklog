-- Database webhook: auto-sync new orders to KeyCRM on INSERT
-- Safety net — if client-side sync fails, DB trigger catches it.

CREATE OR REPLACE FUNCTION public.trigger_sync_order_to_keycrm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://csshbetufyocutdislkn.supabase.co/functions/v1/sync-order-to-keycrm',
    body := jsonb_build_object(
      'order_id', NEW.id,
      'user_id', NEW.user_id
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_order_insert_sync_keycrm ON orders;
CREATE TRIGGER on_order_insert_sync_keycrm
  AFTER INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_sync_order_to_keycrm();
