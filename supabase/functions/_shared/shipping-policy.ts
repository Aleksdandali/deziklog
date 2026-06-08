// Single source of truth for shipping policy shared across edge functions.
//
// NOTE: the React Native client keeps its own copy of this value in
// `lib/constants.ts` (it cannot import a Deno module). The order total is
// server-authoritative (enforce_order_item_price / recompute_order_total
// triggers + REVOKE UPDATE on orders.total_amount), so the client copy is
// display-only and the server value below always decides who pays shipping.

/** Orders >= this amount (UAH) get free shipping (sender pays). */
export const FREE_SHIPPING_THRESHOLD = 2000;
