# WayForPay Integration Plan — DezikLOG

**Date:** 2026-06-08 · Status: plan only (no code changes made)

> ### ⚠️ Read first — live-test addendum (2026-06-08)
> The live security test ([SECURITY-ISOLATION-TEST-2026-06-08.md](./SECURITY-ISOLATION-TEST-2026-06-08.md)) proved that the existing `REVOKE UPDATE(col)` column locks on `orders`/`profiles` are **NOT effective** in production (table-level `GRANT UPDATE` overrides them). This plan repeatedly relies on "only the server may write `payment_status`/`status`". **That guarantee does not exist today.** So a prerequisite for safe payments is fixing H2 first: `REVOKE UPDATE ON orders FROM authenticated` then `GRANT UPDATE (<allowed cols>)` back, and the same for any new `payment_*` columns. Do **not** ship payments until a client can no longer self-mark an order paid. Current order flow is **Cash-on-Delivery only** (no payment columns exist).

---

## (A) Direct safety verdict

**Yes — it is safe to add WayForPay, and your codebase is structured better than most for it.** You can stay in **PCI scope SAQ-A** (card data never touches your client or servers — WayForPay hosts the payment page/widget). The safety depends on enforcing the 7 invariants below. The two that will break you if you get them wrong:

1. **The merchant SecretKey must never leave Supabase edge-function secrets.** The app ships `EXPO_PUBLIC_*` vars, which are **bundled into the client binary and fully public** — anyone can `strings` your IPA/APK. A leaked SecretKey lets an attacker forge "Approved" callbacks and mark any order paid for free. SecretKey goes in `supabase secrets`, full stop.
2. **Order/payment status is written ONLY by the signed `serviceUrl` callback, server-side** — the client must never be trusted to say "I paid." (And per the addendum, the column-lock that enforces this must actually be applied.)

The single biggest behavioral change: today KeyCRM sync + Nova Poshta TTN fire **immediately and asynchronously on INSERT** (3 paths). For prepaid you **must defer all of that until payment is confirmed**, or you'll create real KeyCRM orders + shipping labels for orders that never get paid.

WayForPay's model that makes SAQ-A possible: card data is entered on `secure.wayforpay.com` (redirect or hosted widget); you only ever send/receive an HMAC-MD5-signed order summary. ([Purchase](https://wiki.wayforpay.com/en/view/852102))

---

## (B) Architecture

```
RN CLIENT (app/cart.tsx)
  1. handleOrder(): stock check → createOrder() (status 'pending', payment_status 'init',
     payment_method 'wfp')   ← NO client sync invoke anymore
  2. invoke('wfp-create-payment', { order_id })   ← JWT-auth, NO amount sent
  3. receive { payUrl }
  4. open WayForPay hosted page in in-app browser  ← card entered on WFP domain (SAQ-A)
  5. returnUrl → deep link → poll wfp-payment-status(order_id) for UI
        │ (no SecretKey on client)
        ▼
EDGE wfp-create-payment                         WayForPay (secure.wayforpay.com)
  • verify JWT, load order                        - hosts card page (PCI SAQ-A)
  • assert order.user_id == JWT                   - charges card
  • RE-READ orders.total_amount + items           - POST serviceUrl (signed)
    = AUTHORITATIVE amount                         - redirect returnUrl
  • build merchantSignature (SecretKey)                  │ signed callback (HMAC_MD5)
  • set payment_status='pending', wfp_order_reference    ▼
  • return payUrl                          EDGE wfp-service-callback (PUBLIC, no JWT)
                                             • verify incoming HMAC_MD5 (timingSafeEqual)
                                             • lookup order by wfp_order_reference
                                             • idempotent status-transition guard
                                             • on Approved: payment_status='paid', paid_at (service_role)
                                             • return signed ack {orderReference,status:accept,time,signature}
                                             • THEN invoke('sync-order-to-keycrm')  ← KeyCRM + TTN now
```

The `on_order_insert_sync_keycrm` AFTER-INSERT trigger (`20260332`) and the client fire-and-forget `invoke('sync-order-to-keycrm')` (`lib/api.ts:484`) are **removed/gated** for `payment_method='wfp'`; sync is driven by the **payment callback** instead.

---

## (C) New edge functions

| Function | Auth | Responsibility |
|---|---|---|
| **`wfp-create-payment`** | User JWT (model on `create-np-ttn`) | Verify caller owns `order_id`. **Re-read** `orders.total_amount` server-side (never trust client amount). Build WayForPay Purchase payload + `merchantSignature` (HMAC-MD5, SecretKey from secrets). Set `payment_status='pending'`, write `wfp_order_reference`. Return hosted-page `payUrl`. |
| **`wfp-service-callback`** | **Public, no JWT** (WayForPay can't send your JWT). Authenticity = HMAC. | Verify incoming `merchantSignature` with `timingSafeEqual`. Resolve order by `wfp_order_reference`. Idempotent transition guard. On `Approved` → `payment_status='paid'`, `paid_at` (service_role). Return required ack JSON `{orderReference,status:"accept",time,signature}` (signed). Then invoke `sync-order-to-keycrm` only on first transition to paid. |
| **`wfp-payment-status`** | User JWT | Client polls its own order's `payment_status`. Returns only the caller's order. (Don't trust `returnUrl` query params — attacker-controllable.) |
| *(later)* **`wfp-refund`** | service/admin | Calls WayForPay REFUND; the resulting `Refunded` callback flips `payment_status='refunded'`. |

### Signature recipes (verbatim field order from docs)

**Purchase request `merchantSignature`** — HMAC-MD5 over `;`-joined:
```
merchantAccount;merchantDomainName;orderReference;orderDate;amount;currency;
productName[0..n];productCount[0..n];productPrice[0..n]
```

**Incoming callback `merchantSignature`** (you VERIFY) — HMAC-MD5 over:
```
merchantAccount;orderReference;amount;currency;authCode;cardPan;transactionStatus;reasonCode
```

**Your ack `signature`** (you RETURN) — HMAC-MD5 over `orderReference;status;time`. Body: `{"orderReference":"…","status":"accept","time":<unix>,"signature":"<hmac_md5>"}`.

**HMAC-MD5 in Deno:** WebCrypto has no MD5 — use a vetted impl (`npm:js-md5` + manual HMAC, or `npm:crypto-js`). Validate against the doc's worked example before trusting it. Put it in `_shared/wfp-sign.ts` with a unit test.

**`transactionStatus` map:** `Approved`→`paid`; `Refunded`→`refunded`; `Declined`/`Expired`→`failed`; `InProcessing`/`Pending`/`WaitingAuthComplete`→keep `pending`. ([statuses](https://wiki.wayforpay.com/en/view/1736786), [codes](https://wiki.wayforpay.com/en/view/852131))

---

## (D) DB migration sketch

```sql
-- 2026XXXX_wfp_payment_columns.sql
ALTER TABLE public.orders
  ADD COLUMN payment_method         text NOT NULL DEFAULT 'cod',   -- 'cod' | 'wfp'
  ADD COLUMN payment_status         text NOT NULL DEFAULT 'init',  -- see CHECK
  ADD COLUMN payment_provider       text,
  ADD COLUMN wfp_order_reference    text,
  ADD COLUMN wfp_transaction_status text,
  ADD COLUMN wfp_reason_code        integer,
  ADD COLUMN wfp_auth_code          text,
  ADD COLUMN paid_at                timestamptz,
  ADD COLUMN payment_amount         numeric(12,2),
  ADD COLUMN payment_currency       text DEFAULT 'UAH';

CREATE UNIQUE INDEX uq_orders_wfp_order_reference
  ON public.orders (wfp_order_reference) WHERE wfp_order_reference IS NOT NULL;

ALTER TABLE public.orders ADD CONSTRAINT chk_payment_status
  CHECK (payment_status IN ('init','pending','paid','failed','expired','refunded','voided'));

-- ⚠️ Per the live-test addendum: column-level REVOKE alone is INEFFECTIVE here
-- (table-level GRANT UPDATE overrides it). Do it the working way:
REVOKE UPDATE ON public.orders FROM authenticated, anon;
GRANT  UPDATE (delivery_address, recipient_phone /*, other client-editable cols */)
  ON public.orders TO authenticated;
-- payment_* columns are intentionally NOT in the grant-back list → server-only.
```

**KeyCRM/NP gating:** rewrite `trigger_sync_order_to_keycrm` to `RETURN NEW` early when `NEW.payment_method='wfp'` (COD keeps firing on insert). Invoke `sync-order-to-keycrm` from `wfp-service-callback` only after `payment_status='paid'`. Reuse the existing `claim_order_for_keycrm_sync` CAS lock + `uq_orders_keycrm_order_id` — no duplicate orders/labels. In `_shared/sync-logic.ts`, set TTN `PaymentMethod` to prepaid semantics for `wfp` orders (currently hardcoded `'Cash'`, ~line 228).

---

## (E) Client changes (`app/cart.tsx`, `lib/api.ts`)

1. `createOrder` (`api.ts:419`): add `payment_method:'wfp'`. **Remove** the fire-and-forget `invoke('sync-order-to-keycrm')` (`api.ts:484`) for the prepaid path.
2. `handleOrder` (`cart.tsx` ~262): after `createOrder()`, call `invoke('wfp-create-payment',{order_id})`. **Send no amount.** Get `payUrl`.
3. Open `payUrl` via `expo-web-browser` (`openAuthSessionAsync` with your deep-link `returnUrl`). Card entry on WFP domain → SAQ-A.
4. On return, **don't trust return params** — call `wfp-payment-status(order_id)`; show success only when `payment_status==='paid'`. While `pending`, show "Очікуємо підтвердження оплати" and keep polling.
5. Secrets: `supabase secrets set WFP_MERCHANT_SECRET=… WFP_MERCHANT_ACCOUNT=… WFP_MERCHANT_DOMAIN=…`. **Never** `EXPO_PUBLIC_*`, never `eas.json`.

---

## (F) Rollout / sandbox plan

WayForPay provides **test merchant creds** (`test_merch_n1`) + test cards. Order:
1. **First** fix H2 column-locks + gate `on_order_insert_sync_keycrm` for `wfp` and remove the client invoke. Verify a `wfp` order INSERT creates **no** KeyCRM order / TTN.
2. Build + unit-test `_shared/wfp-sign.ts` against the doc's worked example.
3. Apply the migration (`SEND_SMS_HOOK_SECRET="v1,whsec_…" supabase db push --linked`).
4. Deploy `wfp-create-payment` (test creds); verify the hosted page shows the **server-computed** amount.
5. Deploy `wfp-service-callback`; set merchant `serviceUrl`. Test: valid `Approved` → paid + signed ack + sync fires once; **forged/altered** callback → rejected, status unchanged; **replay** `Approved` twice → no-op; `Declined`/`Expired` → no sync.
6. TestFlight end-to-end with a test card; verify deep-link + polling.
7. Refund from WFP panel → `Refunded` callback flips status.
8. Switch to live creds in `supabase secrets`; ship behind a `payment_method` feature flag; small cohort first; keep COD in parallel.

---

## (G) Security checklist

- [ ] `WFP_MERCHANT_SECRET` only in `supabase secrets` — grep repo + `eas.json` for any `EXPO_PUBLIC_WFP*`.
- [ ] Amount sent to WFP re-read from `orders.total_amount` server-side; client amount ignored.
- [ ] `merchantSignature` built only in `wfp-create-payment`; client never signs.
- [ ] `wfp-service-callback` verifies incoming HMAC-MD5 with `timingSafeEqual` before any write.
- [ ] Callback re-checks `amount`+`currency` against the stored order.
- [ ] Idempotent transition guard: only `pending→paid` / `paid→refunded`; re-delivered `Approved` is a no-op (`uq_orders_wfp_order_reference` backstop).
- [ ] KeyCRM sync + NP TTN invoked only on first `paid`, reusing `claim_order_for_keycrm_sync`.
- [ ] **Payment columns server-only via the table-level REVOKE + grant-back pattern (NOT column-only REVOKE).**
- [ ] Client renders "paid" only from `wfp-payment-status`, never from `returnUrl` params.
- [ ] Card data never reaches client/servers (hosted page) → SAQ-A.
- [ ] Optional: IP allowlist on `wfp-service-callback` (signature is primary control).
- [ ] `serviceUrl` always returns the signed ack (even on duplicate) so WFP stops retrying.

---

## (H) Open questions for you

1. **Hosted redirect vs embedded widget?** (Redirect via `expo-web-browser` is simplest for SAQ-A.)
2. **COD or prepaid-only?** Keep Cash-on-Delivery as a dual option, or move fully to prepaid? (Decides whether the insert trigger keeps firing for COD.)
3. **TTN payment for prepaid:** who pays Nova Poshta delivery — sender or recipient on pickup? (Changes `PaymentMethod`/`PayerType` in `sync-logic.ts`.)
4. **Recurring/tokenized payments** (`recToken`) or one-off only?
5. **Refunds:** automated `wfp-refund` function, or manual from the WFP panel?
6. **`merchantDomainName`** registered on the WayForPay account?
7. **Currency:** UAH only, or also USD/EUR?

### Sources
- [Accept payment (Purchase)](https://wiki.wayforpay.com/en/view/852102) · [Check Status](https://wiki.wayforpay.com/en/view/852117) · [transactionStatus list](https://wiki.wayforpay.com/en/view/1736786) · [reasonCode](https://wiki.wayforpay.com/en/view/852131) · [Charge (host2host)](https://wiki.wayforpay.com/en/view/852194)
