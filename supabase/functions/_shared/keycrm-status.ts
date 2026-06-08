/**
 * Single source of truth for KeyCRM ↔ app status mapping.
 *
 * Used by:
 *   - keycrm-order-webhook (real-time push from KeyCRM)
 *   - poll-keycrm-statuses (cron fallback, every 5 min)
 *
 * Previously each function had its own partial map. The webhook only knew
 * pending/confirmed/canceled; the poller only knew pending/processing/
 * delivered. So a webhook for "processing" wrote a raw "8" into orders.status,
 * and a poller never picked up confirmed/canceled. This file fixes that —
 * both code paths now agree on the full set of statuses.
 *
 * If you add a new status_id in KeyCRM, add it here once and both paths see it.
 */

/** App-side order status values. Mirror of the orders.status check constraint. */
export type AppOrderStatus =
  | 'pending'
  | 'processing'
  | 'confirmed'
  | 'delivered'
  | 'canceled';

/**
 * KeyCRM status_id → app status. Keys are the numeric IDs from THIS KeyCRM
 * tenant's funnel (verified live via GET /order/status):
 *   1 new · 4 Ожидаем оплату · 8 🚚Передан на сборку · 10 💳наложка ·
 *   12 completed · 19 canceled · 22 Підтверджено ботом.
 * (The old 2/3 ids did NOT exist in this tenant — confirmations/cancellations
 * via 22/19 were silently dropped before this fix.)
 */
export const KEYCRM_STATUS_MAP: Record<number, AppOrderStatus> = {
  1: 'pending',      // new
  4: 'confirmed',    // 💲 Ожидаем оплату
  8: 'processing',   // 🚚 Передан на сборку
  10: 'confirmed',   // 💳 наложка
  12: 'delivered',   // completed
  19: 'canceled',    // canceled
  22: 'confirmed',   // Підтверджено ботом
};

/** Webhook may send status as a string name instead of an id. */
const STATUS_NAME_MAP: Record<string, AppOrderStatus> = {
  new: 'pending',
  pending: 'pending',
  confirmed: 'confirmed',
  processing: 'processing',
  shipped: 'processing',
  delivered: 'delivered',
  completed: 'delivered',
  canceled: 'canceled',
  cancelled: 'canceled',
};

/** Ukrainian labels for push notifications. */
export const STATUS_LABELS: Record<AppOrderStatus, string> = {
  pending: 'отримано',
  processing: 'передано на збірку',
  confirmed: 'підтверджено',
  delivered: 'доставлено',
  canceled: 'скасовано',
};

/**
 * Normalize whatever KeyCRM gave us (number id, numeric string, or name)
 * into our internal status. Returns undefined if the value is unknown —
 * callers should ignore the update rather than write garbage into the DB.
 */
export function mapKeyCRMStatus(raw: unknown): AppOrderStatus | undefined {
  if (raw == null) return undefined;

  // Numeric id (poll path uses kcOrder.status_id which is a number).
  if (typeof raw === 'number') return KEYCRM_STATUS_MAP[raw];

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    // Numeric string id (webhook payloads often arrive as strings).
    if (/^\d+$/.test(trimmed)) return KEYCRM_STATUS_MAP[Number(trimmed)];
    // Status name.
    return STATUS_NAME_MAP[trimmed.toLowerCase()];
  }

  return undefined;
}
