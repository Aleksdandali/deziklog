# Dezik SteriLOG — Pre-Production Security Audit (2026-06-08)

**Scope:** full pre-launch review of the production app (Expo RN + Supabase, App Store ID 6760411959),
focused on protecting **client PII** — phones, names, salon names, delivery addresses, emails,
orders, sterilization journals, and photos.

**Method:**
1. **Live isolation test against production** (`/tmp/dezik-iso/isolation-test.mjs`) — 5 real GoTrue
   users, full cross-user matrix over the real PostgREST + Storage API, self-cleaning. **291/291 passed.**
2. **Static multi-agent audit** — 7 senior-security-engineer reviewers fanned out across attack
   surfaces; **every finding independently adversarially verified** by a second engineer (33 agents total).

---

## Bottom line

> **The thing you actually care about — one client reading or modifying another client's data — is closed, and it's proven against the live prod DB, not just by reading code.**

- **No critical or high findings.** No cross-user PII read/write, no unauthenticated data access, no
  privilege escalation, no leaked secrets, no SSRF/open-proxy, no SQL injection.
- The 3 holes from the 2026-06-08 isolation test (cycle-photo cross-read, ineffective column locks,
  missing solution-photos bucket) are **confirmed fixed live**.
- What remains is **defense-in-depth + 2 compliance items** — none block launch on a data-safety
  basis, but two deserve attention before/at launch (privacy-policy accuracy, on-device cache hygiene).

---

## Live-verified SOLID (production, 2026-06-08)

| Control | Result |
|---|---|
| Row isolation across all user tables, incl. **lookup by phone number** | ✅ 0 leaks / 240+ probes |
| `orders` / `order_items` RLS enabled in prod | ✅ |
| Cross-user profile overwrite / order delete | ✅ blocked |
| **cycle-photos** cross-user read & list (prior real leak H1) | ✅ isolated (HTTP 400) |
| cycle-photos readable by **anonymous** | ✅ blocked |
| **Server-managed column locks** — `role`, `total_amount`, `status`, `keycrm_order_id`, `np_ttn`, `keycrm_sync_status`, `keycrm_buyer_id` | ✅ all enforced (orders→403; profile→trigger) |
| `enforce_order_phone` (order phone forced to auth phone) | ✅ |
| Buckets: cycle-photos / solution-photos / instructions **private**; product-images / ops-photos public (catalog only, open INSERT closed) | ✅ |

This **definitively retires** the prior false-positive: the earlier per-column `REVOKE` (20260517/20/21)
was a no-op; the new table-level `REVOKE UPDATE … + per-column loop + sanitize/protect triggers`
(20260609000001) genuinely closes it — verified by real HTTP 403/204 responses.

---

## Findings (all verified; ranked by adjusted severity)

### 🟠 MEDIUM — worth fixing before / shortly after launch

**M1 · PII-1 — KeyCRM/Nova Poshta keep a full PII copy that account-deletion never erases, and the privacy policy denies third-party sharing.**
`delete-account` wipes the entire Supabase side correctly (all tables + both private buckets + usage rows + auth user), but issues **no KeyCRM delete/anonymize**. After "account deletion," the user's name/phone/email/addresses persist in KeyCRM (buyer card) and in the Nova Poshta counterparty indefinitely.
Compounding it: `app/legal/privacy.tsx §3` states *"Ми не продаємо і не передаємо ваші персональні дані третім особам … виключно для роботи додатку"* — which is **false** given KeyCRM + Nova Poshta + SMSFly egress, and the in-app delete dialog promises irreversible total deletion.
This is a **GDPR Art.17 + Apple §5.1.1(v) / privacy-label** exposure, not a technical access break.
- *Fix:* in `delete-account`, read `profile.keycrm_buyer_id` and best-effort (try/catch) DELETE/anonymize the KeyCRM buyer before deleting the profile; disclose KeyCRM/Nova Poshta/SMSFly as sub-processors in the privacy policy with an erasure SLA. Align the App Store privacy label with what is actually collected (phone, name, email, address, photos).
- *Location:* `supabase/functions/delete-account/index.ts:64-97`; egress `_shared/sync-logic.ts:135,151,176-189`; `app/legal/privacy.tsx`.

**M2 · CAUTH-1 — logout / account-delete leave PII-bearing caches in plaintext AsyncStorage.**
`signOut()` only clears Supabase auth keys; the app purges nothing. Surviving on disk: `dezik_cache_profile_<uid>` (name, phone, email, full address), `dezik_cart`, `ai_chat_sessions`. `dezik_cart` + `ai_chat_sessions` are **not namespaced per user** → on a shared salon device the next user sees the previous user's cart/AI chat. Profile-cache residue is also extractable from a device backup after logout, and survives GDPR deletion (client side).
- *Fix:* add a `clearUserCaches()` (enumerate `dezik_cache_*` via `getAllKeys` + `multiRemove` of `dezik_cart`, `ai_chat_sessions`, `ai_chat_consent_v1`, `active_timer`) invoked from the single signOut wrapper in `lib/api.ts:15` and after `delete-account`; namespace cart + chat keys by `userId`.
- *Location:* `lib/cache.ts` (no clear); `app/(tabs)/profile.tsx:289,341`; `lib/cart-context.tsx:6`; `app/ai-chat.tsx:37`.

**M3 · EDGE-1 — `create-np-ttn` has no idempotency guard (duplicate Nova Poshta labels).**
Orphaned standalone function (no client caller; live TTN path is `sync-order-to-keycrm`), but **deployed and gateway-reachable** by any authenticated user for their **own** order. Each call mints a new billable NP TTN and clobbers the stored `np_ttn`; bare `fetch` with no timeout. Self-scoped (no cross-user impact) → cost/operational abuse.
- *Fix:* delete the orphan, **or** add `if (order.np_ttn) return …` at the top and switch to `fetchWithRetry(...,{timeoutMs:8000,retries:0})` to match the hardened `sync-logic.ts` path.
- *Location:* `supabase/functions/create-np-ttn/index.ts:65-147`.

### 🟡 LOW — hardening / housekeeping

| ID | Issue | Location | Fix |
|---|---|---|---|
| **L1 · SEC-1** | Auth session (incl. refresh token) in plaintext AsyncStorage, not Keychain/SecureStore. Single-user blast radius, needs device/backup compromise; iOS at-rest encryption + RLS + 1h access TTL bound it. | `lib/supabase.ts:13-20` | Use `expo-secure-store` (or encrypted MMKV) storage adapter + `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` backup exclusion. |
| **L2 · EAUTHZ-1** | 6 cron functions rely on the gateway default + one **shared `CRON_SECRET`**; anon-JWT-at-gateway is not a real boundary. No active bypass (in-code timing-safe check fail-closes), but one secret = all-6 blast radius. | `config.toml` + cron fns | Per-function CRON secret; pin `verify_jwt=false` explicitly; CI gate that every fn has a JWT/secret guard. (Already deferred item #6.) |
| **L3 · EAUTHZ-2** | `sync-order-to-keycrm` cron path trusts `body.user_email` (written to KeyCRM buyer). Order-ownership IS enforced; only reachable with `CRON_SECRET`. | `sync-order-to-keycrm/index.ts:33-35`; `_shared/sync-logic.ts:135,151,176` | Drop the `userEmail = body.user_email` assignment; the server-side `profiles.email` fallback already exists. |
| **L4 · EAUTHZ-3** | `delete-account`, `keycrm-order-webhook`, `send-sms-hook` return raw internal error strings (no PII, but schema/constraint detail). | `delete-account:103-107`; `keycrm-order-webhook:148-153`; `send-sms-hook:99-104` | Mirror `ai-assistant` pattern: `console.error` server-side, return generic `"Internal error"`. |
| **L5 · DBRLS-1** | `is_admin(p_user_id)` is `SECURITY DEFINER`, granted to `authenticated`, param not pinned to `auth.uid()` → admin-membership **boolean oracle**. Latent (no client caller today); no PII, no escalation. | `migrations/20260529_admins_table.sql:32-44` | Drop the param (use `auth.uid()` internally) or add a self-or-admin guard; re-grant only the self form. |
| **L6 · STOR-3** | Private-photo paths are derivable from owned row IDs (no random component) + 3600s signed-URL TTL. Defense-in-depth only — cross-user reads already blocked by RLS. | `lib/api.ts:260,295,323-332` | Shorten on-screen signed-URL TTL (300–600s); add a random filename component for new photos. |
| **L7 · CAUTH-2** | No `expo-screen-capture` / `FLAG_SECURE` on OTP / profile screens; no app-switcher privacy overlay. Same-device/physical only; OTP is user-typed + single-use. | `app/auth.tsx`, `app/(tabs)/profile.tsx`, `app.json` | Add `preventScreenCaptureAsync()` on sensitive screens + backgrounding overlay. Not launch-blocking. |
| **L8 · PII-3** | `keycrm-order-webhook` shared secret accepted via `?secret=` query (KeyCRM can't sign/header). Largely mitigated: URL never logged, timing-safe compare, dedupe + monotonic guard, no PII in response. | `keycrm-order-webhook/index.ts:35-44` | Rotate `KEYCRM_WEBHOOK_SECRET` periodically; prefer header where supported. |

### ✅ Explicitly verified clean / refuted (no action)

- **nova-poshta-proxy is NOT an open proxy / SSRF** — strict fixed method allow-list. (EDGE-3)
- **ai-assistant prompt-injection blast radius is minimal** — no tools, no secrets/PII in context, hard input/history/rate caps; sends only user-typed content to Anthropic, gated by explicit consent. (EDGE-2, PII-4)
- **PII redaction is correctly applied at all HTTP-error log sites**; `anon` role fully locked out of PII tables. (PII-5)
- **`getUser()` hot-path gotcha correctly avoided**; session config sound. (CAUTH-3)
- **No leaked secrets** — service_role never in the client bundle; `EXPO_PUBLIC_*` holds only the public URL + anon key (RLS-gated by design); `config.toml` uses `env()`.
- **Rate-limit RPCs locked to service_role** (no victim-counter-inflation IDOR); **admins table not self-grantable**; **price/total enforcement** server-authoritative at INSERT and UPDATE; KeyCRM order + NP TTN paths are **idempotent/dedup-guarded** in the live flow.
- All `SECURITY DEFINER` functions pin `search_path`.

---

## Process risks (not data holes, but fix the pattern)

- **Migration drift:** local `20260609_remove_microstop_products` + `20260610_fill_mizma_descriptions` are **not applied to prod**, and there's a remote-only `20260609`. Content-only, but the "applied-but-uncommitted / committed-but-unapplied" pattern keeps recurring → add a CI migration-drift gate.
- **Testing on prod:** the isolation harness writes to the shared prod DB. Stand up a **staging Supabase project** + check the harness into the repo + wire CI.

---

## Recommended order of work

1. **M1 privacy/GDPR** (policy text + KeyCRM erasure) — legal/App-Store risk, do before launch.
2. **M2 cache hygiene** on signOut/delete — quick, real shared-device leak.
3. **M3** delete or guard `create-np-ttn` — quick.
4. **L1 SecureStore**, **L2 per-function cron secrets**, then the rest of the LOWs as hardening.
5. Process: staging project + CI drift gate + harness in repo.

**Verdict for launch:** from a *client-data-safety* standpoint (cross-user read/write/exfiltration,
unauthenticated access, secret leakage) the app is **safe to ship** — proven live. Address **M1** for
compliance before launch; M2/M3 and the LOWs are fast follow-ups.
