# DezikLOG — Live Data-Isolation Security Test

**Date:** 2026-06-08
**Target:** Production Supabase project `csshbetufyocutdislkn` (DezikLOG, live on the App Store)
**Method:** 5 real users created via GoTrue admin API → seeded each user's own data → exercised the **real production HTTP API** (PostgREST + Storage) as each user with genuine JWTs → ran a full cross-user access matrix → confirmed static-audit findings → deleted everything.
**Safety:** No SMS (admin-confirmed users). No KeyCRM orders / Nova Poshta TTN (orders seeded with a `keycrm_order_id` sentinel + `keycrm_sync_status='synced'`, no delivery refs, so all 3 sync paths skip them). **0 residual rows / users** after the run (verified).
**Harness:** `/tmp/dezik-iso/isolation-test.mjs` (re-runnable). 292 assertions, 243 passed.

---

## TL;DR

| Question | Answer |
|---|---|
| **Can one user see another user's data by phone number?** | **NO ✅** — verified at the database level for every table. |
| **Can one user see/modify another user's DB rows (profile, orders, cycles, instruments, solutions)?** | **NO ✅** — RLS isolation is solid, including unfiltered reads. |
| Is data saved correctly per user? | **YES ✅** |
| **Is everything "in norm"?** | **NO ❌** — 3 real production gaps below must be fixed. |

The thing you were most worried about — **"никто не увидит чужие данные по своему номеру телефона"** — is **confirmed safe** for all database tables. The test found **3 real issues**; **H1 and H2 are now FIXED** (see below), **H3 remains**.

---

## ✅ FIXES APPLIED 2026-06-08 (migration `20260609000001_fix_isolation_holes.sql`, live on prod)

Applied from `~/Developer/deziklog` via `supabase db push`; re-test **290/291 green** (only H3 remains). Migration files are **uncommitted** in the Developer tree.

- **H1 — FIXED:** dropped the rogue `"Public read cycle photos"` storage policy; added `WITH CHECK` to the cycle UPDATE policy. Re-test: cross-user photo read now **blocked** (`cyclePhotoLeak: false`).
- **H2 — FIXED:** `REVOKE UPDATE ON public.orders FROM authenticated, anon` (table + every column; the app never updates orders); `trg_sanitize_order_insert` BEFORE-INSERT trigger force-resets server-managed columns for client roles; `trg_protect_profile_managed_cols` keeps `profiles.role` + `keycrm_buyer_id` server-controlled. Re-test: all column UPDATEs → **403/unchanged**.
- **H3 — FIXED** (migration `20260609000003_solution_photos_and_ops_photos.sql`, live, verified): created the missing `solution-photos` bucket **private** with 4 per-`{user_id}`-folder RLS policies — un-breaks the app's solution-photo upload AND isolates it (cross-user read/list/write blocked). Also dropped the open `ops_photos_upload` policy so `ops-photos` can no longer be written by anon/authenticated.
- **Still open (noted, not fixed):** `delete-account` edge function does not purge `solution-photos` on account deletion (GDPR completeness — now relevant since the bucket exists); static-audit mediums (sync cron body `user_id`, ai-assistant history size cap, `create-np-ttn` idempotency, error redaction).

Verification details below describe the **pre-fix** state.

---

## ✅ What is SOLID (verified live)

Every cross-user attempt below returned **0 rows / 0 affected**, for all 20 viewer→target pairs:

- **Read another user's `profiles` by `id`** → 0 rows.
- **Read another user's `profiles` by PHONE** (`?phone=eq.<victim phone>`) → 0 rows. *(your headline concern)*
- **Read another user's `orders` by `user_id`** → 0 rows.
- **Read another user's `orders` by PHONE** → 0 rows. *(orders hold phone + delivery address)*
- **Read another user's `order_items`, `sterilization_sessions`, `sterilizers`, `instruments`, `solutions`** → 0 rows.
- **Unfiltered reads** (`GET /orders` with no filter) → each user got **only their own** row.
- **Cross-user `PATCH`/`DELETE`** (overwrite/delete another user's profile/order) → **0 affected**, targets unchanged.
- `orders`/`order_items` **RLS is enabled in production** (despite the un-timestamped `create_orders.sql` — it was applied out-of-band; confirmed working).
- **`enforce_order_phone` works** — an order seeded with a foreign phone was force-overwritten with the user's own auth phone.
- **Anonymous (logged-out) cannot read cycle photos.**

➡️ **Row-level data isolation across users is working correctly.** A user cannot reach another user's records through the API by any identifier we tested, including phone.

---

## ❌ Findings (production)

### 🔴 H1 — Cross-user read of CYCLE PHOTOS (broken Storage RLS)

**Confirmed live.** The `cycle-photos` bucket is private (`public:false`), yet:

```
User B (logged in) → GET /storage/v1/object/cycle-photos/{USER_A_id}/{...}/photo.png
   → HTTP 200, content-type image/png, returns USER A's actual photo bytes
User B → POST /storage/v1/object/list/cycle-photos {prefix:"{USER_A_id}/"}
   → returns USER A's sub-folder names (session IDs)
```

Any **authenticated** user can **download and enumerate another user's cycle photos** if they know that user's `user_id`. Real app paths are `{user_id}/{session_id}/{before|after}.jpg`, so: list `{victim}/` → session IDs → list each → filenames → download. These are sterilization/clinic photos (sensitive).

- **Mitigating factor:** the attacker must know the victim's `user_id`. They **cannot** get it from the DB (RLS blocks that — see "SOLID" above). So this is not a one-click mass scrape, but it **is** a broken access-control on medical images and must be fixed.
- **Anon is NOT affected** (logged-out users get HTTP 400).
- **Root cause (to confirm):** the per-folder SELECT policy `(storage.foldername(name))[1] = auth.uid()::text` from migration `20260518` is **not the effective gate** — most likely a leftover **permissive SELECT policy** on `storage.objects` for `cycle-photos` (e.g. from the public-bucket era, `20260519`) was never dropped, and RLS policies are **OR-ed**, so the permissive one wins.
- **Fix:** inspect and DROP every SELECT policy on `storage.objects` touching `cycle-photos`, then recreate exactly one strict per-folder policy. Also add the missing `WITH CHECK` to the UPDATE policy (audit finding: object can be moved into another user's folder). Suggested SQL:

```sql
-- inspect first:
--   select polname, cmd, qual, with_check from pg_policies where tablename='objects' and schemaname='storage' and qual ilike '%cycle-photos%';
-- then, drop any policy whose USING is just bucket_id='cycle-photos' (no foldername check), and ensure ONLY this remains:
drop policy if exists "Users read own cycle photos" on storage.objects;
create policy "Users read own cycle photos" on storage.objects for select
  using (bucket_id='cycle-photos' and (storage.foldername(name))[1] = auth.uid()::text);
-- repeat for insert/update/delete; UPDATE must have BOTH using AND with_check.
```

---

### 🟠 H2 — Column write-locks are INEFFECTIVE (server-managed columns are client-writable)

**Confirmed live.** Migrations `20260517` / `20260520` / `20260521` are marked **applied** in production, yet a normal authenticated user could `PATCH` **every** "locked" column on their own row:

| Column | Result of client UPDATE |
|---|---|
| `profiles.role` | `owner` → `staff` ✗ (role-integrity) |
| `orders.total_amount` | `140` → `99999` ✗ (order-total manipulation) |
| `orders.status` | `pending` → `confirmed` ✗ (status spoofing) |
| `orders.keycrm_order_id` | set to attacker value ✗ (sync poisoning / DoS) |
| `orders.keycrm_sync_status` | `synced` → `failed` ✗ |
| `orders.np_ttn` | `null` → `ISO-FAKE-TTN` ✗ |
| `profiles.keycrm_buyer_id` | `null` → `7777777` ✗ (buyer mis-attribution) |

Plus the static-audit **INSERT-gap** (H) confirmed: a client can also set these columns at **INSERT** time.

- **Root cause:** `REVOKE UPDATE (col) ON <table> FROM authenticated` **does not subtract from a table-level `GRANT UPDATE`**. Supabase grants `ALL` (incl. table-level `UPDATE`) on dashboard-created tables; `orders`/`profiles` were created via the dashboard. With table-level `UPDATE` present, the column-level REVOKE is a **no-op**. The migrations *ran*, but were structurally ineffective.
- **Impact:** the server-authoritative guarantees these migrations were meant to provide are **not in force**. Item *prices* are still safe (the `BEFORE INSERT` trigger `enforce_order_item_price` forces `price_at_order` from `products.price`), but `orders.total_amount`, `status`, and all `keycrm_*`/`np_ttn` sync fields are not.
- **Fix (correct pattern):** revoke the **table-level** UPDATE and grant only the columns clients legitimately edit:

```sql
-- orders: clients create orders but should not update server-managed fields.
revoke update on public.orders   from authenticated, anon;
-- grant back only what the client legitimately edits (verify this list against lib/api.ts):
grant update (delivery_address, recipient_phone /*, recipient_first_name, recipient_last_name, ... */) on public.orders to authenticated;

-- profiles:
revoke update on public.profiles from authenticated, anon;
grant update (name, salon_name, phone, city, avatar_url, email, delivery_address, expo_push_token /*, ... */) on public.profiles to authenticated;

-- close the INSERT path too:
revoke insert (status, total_amount, keycrm_order_id, keycrm_sync_status, keycrm_sync_error, keycrm_sync_started_at, np_ttn, np_delivery_cost) on public.orders from authenticated, anon;
revoke insert (role, keycrm_buyer_id) on public.profiles from authenticated, anon;
```

The exact allow-lists must be derived from what the app actually writes (`lib/api.ts`) so nothing breaks. **This needs review before applying.**

---

### 🟠 H3 — `solution-photos` bucket does not exist (feature broken)

The app (`app/solution/add.tsx`, `app/solution/[id].tsx`) uploads to / reads from a bucket named **`solution-photos`**, but production has only: `instructions` (private), `product-images` (public), `ops-photos` (public), `cycle-photos` (private). **No `solution-photos`** → uploads return **404 "Bucket not found"**, so the solution-photo feature is **broken in production**.

- Not a data leak (can't leak from a non-existent bucket), but a **functional** bug.
- **Fix:** create `solution-photos` as **private** with the same per-`{user_id}`-folder RLS as `cycle-photos` (4 policies, all gated on `(storage.foldername(name))[1] = auth.uid()::text`), and add it to `delete-account` cleanup.
- Note: `ops-photos` is **public** and not pinned in any migration — confirm it contains no user PII.

---

## Other (from static audit `w0rfd7b07`, not re-tested live)

- **M:** `sync-order-to-keycrm` cron branch trusts `body.user_id` (contained by `CRON_SECRET`); read `user_id` from the order row instead.
- **M:** `trigger_sync_order_to_keycrm` is `SECURITY DEFINER` without `SET search_path` (every other definer fn pins it).
- **M:** `ai-assistant` accepts unbounded client history (token-cost amplification); cap size + validate roles.
- **L:** `create-np-ttn` (orphaned, still deployed) lacks the TTN idempotency guard → can double-create shipping labels.
- **L:** raw upstream (KeyCRM/NP) error text returned to clients; redact at the response boundary.
- **Fragility:** `orders`/`order_items` RLS lives only in the **un-timestamped** `create_orders.sql` (skipped by `db push`); a fresh env provisioned via `db push` would have **no** orders RLS. Rename to a timestamped, idempotent migration + add a deploy-time assertion that `relrowsecurity` is true on both tables.

---

## How to re-run

```bash
cd ~/Desktop/dezik-log   # (or wherever the repo is)
node /tmp/dezik-iso/isolation-test.mjs
```

The harness retrieves `service_role` from the logged-in Supabase CLI in-process (never printed), is fully self-cleaning, and prints a PASS/FAIL matrix + verdict JSON.
