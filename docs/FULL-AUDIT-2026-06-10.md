# DezikLog — полный аудит приложения (10 июня 2026)

Многоагентный аудит (53 агента): 8 направлений — клиентское хранилище, edge-функции, RLS/миграции, логика стерилизации, магазин, авторизация, уведомления/надёжность, UX/комплаенс. Каждая находка severity ≥ medium прошла адверсариальную верификацию независимыми проверяющими (1 находка опровергнута и исключена). Отдельно проверен статус находок аудита 8 июня и проведена проверка полноты.

## Сводка

| Severity | Кол-во |
|---|---|
| critical | 0 |
| high | 9 |
| medium | 24 |
| low | 43 |
| info | 13 |

**Главный вывод:** критичных дыр, через которые чужие данные доступны прямо сейчас, не найдено — изоляция данных (RLS), серверные цены, приватные фото с подписанными URL работают корректно. Основные риски: (1) регуляторная логика журнала держится только на клиенте, (2) данные пользователя остаются на устройстве после выхода/удаления аккаунта, (3) ни одна из находок аудита 8 июня не была исправлена, (4) несколько реальных функциональных багов (ранний финиш цикла, 60-минутный кап таймера, двойные заказы).

## Что сделано хорошо

- **[Клиентское хранилище]** No secrets beyond the public Supabase anon key ship in the client: eas.json embeds only EXPO_PUBLIC_SUPABASE_URL and an anon-role JWT (role 'anon'); KeyCRM, Nova Poshta, SMSFly and Anthropic keys are all server-side — the client only calls supabase.functions.invoke('nova-poshta-proxy' / 'sync-order-to-keycrm' / 'ai-assistant' / 'delete-account') (lib/api.ts:387, 527; app/ai-chat.tsx:243).
- **[Клиентское хранилище]** The one script that needs the service-role key reads it strictly from env and exits if missing (scripts/migrate-product-images.ts:15-21); .gitignore excludes .env, *.key, *.p8/.p12, *.jks, *.pem and a credentials-bearing planning doc; no .env or google-services file exists in the tree or git index.
- **[Клиентское хранилище]** Logging discipline is good: auth event logs are __DEV__-gated and truncate the user id to 8 chars (lib/auth-context.tsx:51-55, 73); the Expo push token is logged only in dev and truncated to 20 chars (lib/notifications.ts:104); DebugAuthBanner requires __DEV__ AND EXPO_PUBLIC_DEBUG_AUTH=1 and masks the email even then (components/DebugAuthBanner.tsx:5, 15-18). No tokens, OTPs or phone numbers are logged anywhere.
- **[Клиентское хранилище]** iOS permission usage descriptions are present, honest and specific (camera/photos 'для фотографування індикаторів стерилізації', app.json:17-19) and every declared permission maps to real usage (expo-camera in CameraCapture, expo-image-picker gallery pick, MediaLibrary save fallback, expo-notifications for cycle alerts); no over-declaration.
- **[Edge-функции]** CORS default is secure: _shared/cors.ts sends NO Access-Control-Allow-Origin unless CORS_ORIGIN is explicitly set, blocking browser-origin abuse of authenticated JWTs while native clients (which don't enforce CORS) keep working.
- **[Edge-функции]** All secret comparisons use a constant-time check (_shared/timing-safe.ts) and it is applied consistently across every cron-secret and webhook-secret gate (notify-cycle-idle, poll/retry/sync crons, restore-product-images, keycrm-order-webhook, sync-order-to-keycrm cron branch).
- **[Edge-функции]** verify_jwt posture is pinned in source: config.toml sets ai-assistant verify_jwt=true and explicitly documents/keeps keycrm-order-webhook and send-sms-hook at verify_jwt=false (they authenticate in-code), so the auth posture is reproducible from the repo.
- **[Edge-функции]** send-sms-hook verifies the Supabase Standard Webhooks signature (standardwebhooks lib) before sending any SMS, giving real authenticity + timestamp-based replay protection.
- **[БД/RLS]** RLS is enabled on every table in the schema (profiles, sterilization_sessions, sterilizers, instruments, solutions, employees, orders, order_items, products, product_categories, ai_chat_usage, keycrm_lookup_usage, keycrm_history_usage, admins, admin_alerts, keycrm_webhook_events) - verified via grep across all migrations; no table was left RLS-disabled.
- **[БД/RLS]** Server-only tables (admins, admin_alerts, ai_chat_usage, keycrm_lookup_usage, keycrm_history_usage, keycrm_webhook_events) are correctly deny-by-default: RLS enabled with zero client policies, so authenticated/anon get no rows and only service_role (and SECURITY DEFINER helpers) can access them - the intended design, not a missing-policy bug.
- **[БД/RLS]** The team identified and fixed the subtle Postgres gotcha that table-level UPDATE grants make column-level REVOKEs no-ops: 20260609000001 revokes UPDATE on orders at the table level AND loops every column, then enforces server-managed columns via the SECURITY INVOKER sanitize_order_insert / protect_profile_managed_cols triggers gated on current_user IN ('authenticated','anon').
- **[БД/RLS]** Price and total manipulation is properly defended server-side: enforce_order_item_price overwrites price_at_order/product_name from the products table and rejects out-of-stock/zero-qty, and recompute_order_total (SECURITY DEFINER) recomputes orders.total_amount from line items, ignoring any client-supplied value (20260514).
- **[Логика стерилизации]** Double-tap completion is well defended: a synchronous savingRef re-entry guard (complete-cycle.tsx:61,143) plus an atomic optimistic-concurrency guard in updateSession that pushes `.eq('status', expectedStatus)` into the UPDATE and throws SessionConflictError when zero rows match (api.ts:217-250). A racing second device/tap loses cleanly instead of overwriting ended_at/result.
- **[Логика стерилизации]** Actual duration is recomputed at the moment of save from startedAt (complete-cycle.tsx:108-109), so a user cannot pass the minimum merely by sitting on the completion screen — real elapsed time is what counts.
- **[Логика стерилизации]** Elapsed time is derived from epoch-millisecond diffs (Date.now() - startedAt) everywhere (timer.tsx:129, ActiveTimerWidget.tsx:73, calcActualMinutes via getTime()), making the timer immune to timezone/DST shifts and surviving app kill/relaunch correctly.
- **[Логика стерилизации]** The new-cycle start path rolls back an orphaned draft session if photo upload or the status update fails (new-cycle.tsx:291-301), scoped to status='draft' so it can't delete a live cycle.
- **[Магазин]** Server-authoritative pricing closes the client price-manipulation vector end-to-end: enforce_order_item_price overwrites price_at_order + product_name from products, recompute_order_total derives total_amount from line items, and UPDATE on orders.total_amount/price_at_order is revoked from authenticated/anon (migrations 20260514, 20260521, 20260609000001). lib/api.ts createOrder deliberately refuses to accept price/total from the client.
- **[Магазин]** Robust pre-flight stock check (getProductsStockStatus) plus comprehensive Ukrainian error handling in cart.tsx that parses the trigger's PostgrestError shapes (out-of-stock, missing product, bad quantity) and surgically removes only the offending cart line instead of failing opaquely.
- **[Магазин]** Duplicate-KeyCRM-order prevention is well engineered: atomic claim_order_for_keycrm_sync RPC (UPDATE…RETURNING CAS) with stale-claim recovery, a UNIQUE partial index on keycrm_order_id, and POST /order using retries:0 so a non-idempotent call is never retried.
- **[Магазин]** keycrm_order_id is persisted immediately after the KeyCRM order is created and before the Nova Poshta TTN call, with an explicit 'order_created_unpersisted' dead-letter state, so an isolate death mid-flow cannot produce a duplicate order or orphan TTN (sync-logic.ts:252-273, 327-329).
- **[Авторизация]** App Store 5.1.1(v) guest browsing is genuinely implemented and correctly placed: guests browse the catalog ((tabs)/catalog.tsx renders fully with session=null, with an optional 'Увійти' button at line 136-141), open product details (app/product/[id].tsx has zero auth dependencies), and fill a locally persisted cart; login is forced only at checkout (cart.tsx:197-210 startCheckout), which is the compliant placement, and the alert explicitly reassures 'Товари в кошику збережуться'.
- **[Авторизация]** Account-based tabs are properly hidden from guests via href:null in app/(tabs)/_layout.tsx (removing them from both the tab bar and deep-link config), and the home tab additionally renders <Redirect href='/(tabs)/catalog' /> for guests ((tabs)/index.tsx:97-99) to handle Android hardware-back focusing the hidden first tab — a thoughtful edge case.
- **[Авторизация]** Every screen that assumes a logged-in user defensively checks the session: userId guards before all data loads (new-cycle.tsx:124, journal.tsx:75/81, orders.tsx:117, complete-cycle.tsx:65, all four cabinet/* screens, solution/*, cycle/[id], order/[id]), and write paths re-validate via useSessionGuard() which re-fetches the session from storage before declaring it dead (lib/auth-context.tsx:27-48).
- **[Авторизация]** The auth state machine handles tricky supabase-js edge cases well: a null session on TOKEN_REFRESHED is ignored rather than logging the user out (auth-context.tsx:92-97), refresh-token failure surfaces as SIGNED_OUT → status 'guest' → router.replace('/auth') which wipes authed screens from back-gesture history (app/_layout.tsx:65-71), and a 5s init watchdog plus 'font-load failure counts as ready' (app/_layout.tsx:50-53) guard against the infinite-splash launch failures that previously caused App Review rejections.
- **[Уведомления/надёжность]** lib/notifications.ts:6-45 — entire native notification setup at module load is wrapped in try/catch with a clear comment explaining that a synchronous throw there would crash cold launch outside the ErrorBoundary; channel creation and category registration each have their own .catch().
- **[Уведомления/надёжность]** scheduleCycleNotifications design (lib/notifications.ts:165-252): all cycle alerts (done, +2/+5 min nudges, 60-min overheat cap) are pre-scheduled with OS time-interval triggers at cycle START, so they fire with the app killed/locked; fixed identifiers make re-scheduling idempotent, and cancelCycleNotifications (259-270) both cancels pending and DISMISSES already-delivered banners on completion/cancel, on every exit path (timer cancel, widget cancel, complete-cycle success/conflict/not-found).
- **[Уведомления/надёжность]** supabase/functions/_shared/expo-push.ts: sendExpoPush never throws (protects webhook 200s from KeyCRM retry storms), batches are capped at 100 per Expo limits (notify-cycle-idle:125), and ticket-level DeviceNotRegistered tokens are pruned from profiles when the admin client is provided.
- **[Уведомления/надёжность]** keycrm-order-webhook/index.ts:74-111 — insert-first replay dedupe table keyed on (order, status, changed_at) plus a monotonic keycrm_status_changed_at guard on both webhook and poller; poll-keycrm-statuses uses a last_polled_at cursor so erroring orders advance instead of starving the queue (lines 75-79, 150-154).
- **[UX/полезность]** Guest browsing (App Review 5.1.1(v), the prior rejection cause) is implemented thoroughly: a dedicated guest Stack, account tabs hidden via href:null, a Redirect bouncing guests off the home tab (app/(tabs)/index.tsx:97-99), a pathname allowlist guard against deep links into account screens (app/_layout.tsx:85-95), and the guest cart persists across sign-in with a POST_AUTH_ROUTE resume back to checkout (app/cart.tsx:211, app/_layout.tsx:100-109).
- **[UX/полезность]** Account deletion (5.1.1(v)) is a visible profile entry with double confirmation and a server-side delete-account edge function call, followed by signOut (app/(tabs)/profile.tsx:296-348).
- **[UX/полезность]** iOS permission purpose strings are honest, specific, and in Ukrainian for camera/photo-library usage, matching what the app actually does (app.json:17-19 and the expo-camera/expo-image-picker plugin configs).
- **[UX/полезность]** Camera permission denial is handled properly: when canAskAgain is false the button becomes 'Відкрити Налаштування' with Linking.openSettings(), avoiding the classic 'broken button' dead end (components/CameraCapture.tsx:51-77).

## HIGH — требуют исправления (9)

### HIGH-1. "Cannot mark success under minimum time" is enforced client-side only; server permits arbitrary completion

**Файл:** `lib/api.ts:217-250` · **Область:** Логика стерилизации

The entire minimum-duration rule (the app's core regulatory promise) lives in the client: complete-cycle computes finalActualMinutes from AsyncStorage timerData and refuses to save 'success' below recommendedMinutes. The server-side updateSession only guards on status === 'in_progress' (expectedStatus). There is NO server validation that ended_at - started_at >= duration_minutes, no CHECK constraint, and no trigger (no migration touches sterilization_sessions status/result/duration logic). The RLS UPDATE policy is a bare `USING (auth.uid() = user_id)`, so a user holding their own JWT can PATCH sterilization_sessions directly (set status='completed', result='success', ended_at=anything) and bypass the check entirely. Even within the honest app, recommendedMinutes/startedAt are read from a tamperable AsyncStorage blob, so editing `active_timer` or the device clock fabricates a compliant-looking record.

**Рекомендация:** Enforce the rule at the DB: a BEFORE UPDATE trigger that rejects status->'completed' with result='success' unless ended_at - started_at >= duration_minutes (with a small tolerance), and ideally set started_at via a server default (now()) on the draft->in_progress transition rather than trusting the client. Treat the client check as UX only.

### HIGH-2. Hard-coded 60-minute cap breaks the 160°C/150-min preset and any cycle longer than 60 min

**Файл:** `app/timer.tsx:28-155` · **Область:** Логика стерилизации

MAX_CYCLE_SECONDS is hard-coded to 3600s for all modes, but the shipped preset dry_heat_160 (160°C) has duration 150 min, and custom mode accepts durations up to 480 min. For such cycles, at 60:00 the timer marks isCapped, freezes the on-screen count, and shows the red 'Завершіть цикл — 1 година / подальший нагрів може пошкодити інструменти' overheat message — even though the cycle's required minimum exposure has not been reached (isReached needs elapsed >= recommendedSeconds, e.g. 9000s). A user who follows the app's own overheat instruction and stops at 60 min then cannot mark success (actualMinutes 60 < 150) and hits the early-finish flow. So the app actively instructs under-sterilization for a mode it itself recommends. The completion math does use real elapsed, so the cycle is technically completable only if the user ignores the scary 'damage' warning and waits the full 150 min.

**Рекомендация:** Make the cap a function of the selected preset (e.g. recommendedMinutes + margin) instead of a constant, or at minimum never show isCapped/overheat before isReached. Reconcile the 480-min custom-duration validation with the cap.

### HIGH-3. Checkout confirm button has no synchronous double-tap guard — duplicate orders possible

**Файл:** `app/cart.tsx:212, 639-646` · **Область:** Магазин

handleOrder() guards re-entry only with the React state flag `ordering` (button `disabled={ordering}`). Between the first tap and the re-render that flips `disabled`, handleOrder awaits getUid() and getProductsStockStatus() before reaching createOrder — a wide window in which a second rapid tap can re-enter and create a SECOND order. Each order has its own UUID, so the KeyCRM claim-lock and the UNIQUE(keycrm_order_id) index do NOT prevent two distinct duplicate KeyCRM orders (and two Nova Poshta TTNs). The codebase already recognizes this exact race elsewhere: orders.tsx added `repeatBusyRef` precisely because 'state lags behind the second tap and lets it slip through', but cart.tsx never got the same fix.

**Рекомендация:** Add a synchronous useRef guard (e.g. `if (submittingRef.current) return; submittingRef.current = true;`) at the very top of handleOrder, mirroring repeatBusyRef in orders.tsx, and reset it in the finally block. Do not rely on the `ordering` state flag alone.

### HIGH-4. router.replace/push can fire while the root layout renders no navigator (splash/onboarding) — navigation throws in expo-router's deferred queue or is silently dropped

**Файл:** `app/_layout.tsx:65-71, 94-100, 107-109, 135-141` · **Область:** Авторизация

Two effects navigate without checking that a navigator is mounted. (1) The status==='guest' effect calls router.replace('/auth') keyed only on [status]; if INITIAL_SESSION (null) resolves before fonts load, RootNavigator is still returning <AnimatedSplash /> (line 107-109) — no navigator exists. (2) The notification cold-start path (getLastNotificationResponseAsync at line 94, documented in-code as 'the common path') calls router.push('/complete-cycle?...') while status is still 'loading'. In this expo-router version, push/replace enqueue a ROUTER_LINK action (routing.js linkTo -> routingQueue.add) that is flushed later inside useImperativeApiEmitter's useEffect, where getNavigateAction() calls assertIsReady() and throws 'Attempted to navigate before mounting the Root Layout component...' (routing.js:62-66) when no navigator has mounted. Because the throw happens in expo-router's own effect, the try/catch inside route() (lines 77-88) CANNOT catch it, and the app's ErrorBoundary sits below ExpoRoot, so the error is unhandled. Outcome is either a launch-time error/crash or, at best, a dropped navigation — meaning a master tapping the cycle-done notification on cold start lands on the home tab instead of the complete-cycle photo flow. The same applies while OnboardingScreen is rendered (lines 135-141), which also mounts no navigator. Given the App Store history of launch-failure rejections, this race deserves priority.

**Рекомендация:** Always render a navigator on first render (move the guest/authed/onboarding gating into Stack.Protected guards or a Redirect inside an index route), or gate both navigation effects on navigator readiness (useRootNavigationState() !== undefined / a 'stackMounted' flag) and re-run the pending notification navigation once status !== 'loading' and fontsReady.

### HIGH-5. Expo push token never cleared on logout — cross-user notification delivery on shared devices

**Файл:** `lib/notifications.ts:99-102` · **Область:** Уведомления/надёжность

registerPushToken() writes the device token only to the CURRENT user's profiles row, and nothing in the app clears profiles.expo_push_token on sign-out (profile.tsx:290 and :342, lib/api.ts:15, onboarding.tsx:82 all call supabase.auth.signOut() with no token cleanup). The index on expo_push_token (supabase/migrations/20260322_add_push_token.sql:6-8) is NOT unique, so after user A logs out and user B logs in on the same device, BOTH profile rows hold the same token. Server pushes targeted at user A — order status changes (poll-keycrm-statuses, keycrm-order-webhook), daily 'no sterilization today' reminders, and solution-expiry pushes that include A's solution names — are delivered to the device where user B is now signed in. Shared salon devices are a realistic scenario for this audience. Tapping A's order push also deep-links B into /order/<A's orderId> (blocked by RLS, but the notification content itself leaks A's activity).

**Рекомендация:** Before supabase.auth.signOut(), null the current user's expo_push_token (await supabase.from('profiles').update({ expo_push_token: null }).eq('id', uid)). Additionally, in registerPushToken, clear the same token from any OTHER profile row (update ... set expo_push_token=null where expo_push_token=token and id<>userId), or make the partial index UNIQUE with an upsert-style claim. Also check the returned error from the update — it is currently silently ignored.

### HIGH-6. Network failure silently renders empty journal/home/solutions AND poisons the AsyncStorage cache with []

**Файл:** `app/(tabs)/journal.tsx:90-98` · **Область:** Уведомления/надёжность

supabase-js v2 query builders resolve with { data: null, error } on network failure — they do not reject — so the surrounding try/catch in loadJournal() never fires for offline/transient errors. The code ignores `error`, coerces data to [], renders the empty state ('Записів поки немає') for the regulatory sterilization journal, and then writes [] into the persistent cache via setCache, destroying the previously cached records. The exact same pattern exists in app/(tabs)/index.tsx:66-82 (home sessions + solutions caches) and app/(tabs)/solutions.tsx:68-71. One offline app open is enough: the master sees an empty journal (alarming for a Form 257/o record) and even after restart the cache shows nothing until a successful fetch. There is no error banner and no retry affordance other than a silent pull-to-refresh.

**Рекомендация:** Destructure and check `error` from every list query. On error: keep the current/cached state, do NOT call setCache, and show an error state with a retry button (or a toast). Apply to journal.tsx, index.tsx (sessions, profile, solutions) and solutions.tsx.

### HIGH-7. Privacy policy screen exists but is unreachable from anywhere in the app

**Файл:** `app/legal/privacy.tsx:1 (whole screen); app/_layout.tsx:163,201` · **Область:** UX/полезность

app/legal/privacy.tsx is a fully built Ukrainian privacy policy, but the only references to it in the entire codebase are the two <Stack.Screen name="legal/privacy" /> registrations in app/_layout.tsx. No button, link, or menu item anywhere (profile/Кабінет, auth, onboarding, settings) navigates to it — grep for 'legal/privacy' and 'конфіденц' across app/, components/, lib/ returns only the screen itself and the stack registrations. The auth screen even says 'ви погоджуєтеся з обробкою персональних даних' (app/auth.tsx:306) with no way to read what is being agreed to. Apple requires the privacy policy to be accessible within the app (Guideline 5.1.1(i)), and this app already has a 5.1.1 rejection history per the project memory — an unreachable policy is a concrete re-rejection risk.

**Рекомендация:** Add a visible 'Політика конфіденційності' entry: (1) in the profile screen near 'Видалити акаунт', and (2) as a tappable link in the auth screen's legal hint ('Натискаючи «Отримати код»…'). Both should router.push('/legal/privacy').

### HIGH-8. Privacy policy text is factually wrong: claims email+password auth and 'no data shared with third parties'

**Файл:** `app/legal/privacy.tsx:27, 42-44` · **Область:** UX/полезность

The policy says the app collects 'Email та пароль — для автентифікації', but auth is phone-OTP via Supabase (no password exists anywhere). Worse, section 3 states 'Ми не продаємо і не передаємо ваші персональні дані третім особам', while the app demonstrably transmits personal data to third-party processors: KeyCRM (orders, buyer name/phone), Nova Poshta (delivery city/warehouse/recipient), SMSFly (phone for OTP), Anthropic (AI chat content — the chat's own consent gate admits 'Запитання обробляються зовнішнім ШІ-сервісом'), and Expo push services. An inaccurate policy is a compliance liability with both App Review (5.1.1, 5.1.2 data-sharing disclosure) and Ukrainian personal-data law, especially during a re-review after prior rejections.

**Рекомендация:** Rewrite section 1 to reflect phone-OTP auth (phone number, optional email), and section 3 to honestly list processors (KeyCRM, Nova Poshta, SMSFly, Anthropic, Expo/Supabase infrastructure) and the purpose of each transfer. Keep the App Store privacy 'nutrition label' in App Store Connect consistent with this text.

### HIGH-9. Early-finished cycle cannot be saved: save button demands an 'after' photo while the photo UI is hidden

**Файл:** `app/complete-cycle.tsx:397-403, 511` · **Область:** UX/полезность

When the master taps 'Завершити цикл' before the minimum time (canMarkSuccess === false), the screen replaces the camera placeholder with a banner explicitly saying 'фото ПІСЛЯ не потрібне. Результат: повторити стерилізацію' — so there is no UI to take a photo. But the save button's onPress unconditionally requires photoAfter (line 511) before calling handleUploadAndConfirm (whose own check at line 103 is correctly conditional: `if (canMarkSuccess && !photoAfter)`). Result: tapping 'Зберегти' always alerts 'Зробіть фото індикатора ПІСЛЯ', which the user cannot do. The 'fail' journal record for an early-terminated cycle can never be written from this screen — the only escapes are X→home (cycle stays in_progress) or cancel (status 'canceled', losing the failed-cycle record the Form 257/o journal should contain). Every master who stops a cycle early hits this trap. The adjacent 'Цикл тривав менше рекомендованого… Зберегти все одно?' branch (lines 121-137) is unreachable dead code for the same reason.

**Рекомендация:** Make the button-level guard mirror line 103: `if (canMarkSuccess && !photoAfter) { Alert…; return; }`. In the !canMarkSuccess state, pre-select/force the 'fail' result and let doSave proceed without a photo (it already supports path === null).

## MEDIUM — исправить в ближайших релизах (24)

### MEDIUM-1. Supabase access/refresh tokens persisted in plaintext AsyncStorage instead of Keychain/SecureStore

**Файл:** `lib/supabase.ts:13-19` · **Область:** Клиентское хранилище

The Supabase client persists the full session (access JWT + long-lived refresh token) via AsyncStorage, which is unencrypted file/SQLite storage in the app sandbox. expo-secure-store is not in package.json at all, so no Keychain/Keystore protection exists. On a rooted/jailbroken device, via device backups, or through any future file-disclosure bug, the refresh token grants long-term account takeover (the whole regulatory journal + orders for that user).

**Рекомендация:** Use the standard Supabase + Expo pattern: store an AES key in expo-secure-store and keep the (encrypted) session blob in AsyncStorage (aes-encrypted storage adapter), or use a SecureStore-backed storage adapter with chunking for the >2KB value. Pair with the Android backup exclusion below.

### MEDIUM-2. PII caches are never wiped on sign-out or account deletion (deletion flow promises 'all data deleted forever')

**Файл:** `app/(tabs)/profile.tsx:290, 201, 325-348` · **Область:** Клиентское хранилище

Sign-out only calls supabase.auth.signOut() and the SIGNED_OUT handler in lib/auth-context.tsx:78-82 only resets React state. There is no AsyncStorage cleanup anywhere in the codebase (zero uses of multiRemove/getAllKeys/clear). The per-user caches written via lib/cache.ts persist indefinitely: dezik_cache_profile_<uid> (name, last_name, phone, email, city, full delivery address, keycrm_buyer_id — written at profile.tsx:201), dezik_cache_journal_<uid> (full Form 257/o records incl. employee names, journal.tsx:98), dezik_cache_home_sessions_<uid>/home_profile_<uid>/home_solutions_<uid> (index.tsx:68-82), dezik_cache_solutions_<uid> (solutions.tsx:71), plus active_timer. The account-deletion dialog explicitly promises 'Всі ваші дані (журнал, замовлення, профіль) будуть видалені назавжди', yet doDeleteAccount (lines 325-348) only invokes the delete-account edge function and signOut() — phone, email and home address remain readable on the device afterwards.

**Рекомендация:** On SIGNED_OUT (lib/auth-context.tsx) run AsyncStorage.getAllKeys() and multiRemove all dezik_cache_*, active_timer and ai_chat_* keys; do the same (plus cart if desired) in doDeleteAccount before signOut so the local wipe matches the deletion promise.

### MEDIUM-3. AI chat history stored under a global, non-user-scoped key — leaks to the next account on the device and survives deletion

**Файл:** `app/ai-chat.tsx:37, 52-61` · **Область:** Клиентское хранилище

Chat sessions are persisted under the constant key 'ai_chat_sessions' with no user-id scoping (unlike the dezik_cache_* keys which are per-uid). If user A signs out (or deletes their account) and user B logs in on the same device, B sees A's full chat history on first open of the AI assistant (loaded unconditionally on mount, lines 104-113). Masters may type client- or business-sensitive questions into this chat. It is also never cleared on logout/account deletion.

**Рекомендация:** Scope the key per user (e.g. `ai_chat_sessions_${userId}`) and clear it on sign-out/account deletion alongside the other per-user keys.

### MEDIUM-4. sync-order-to-keycrm marks arbitrary users' orders as 'failed' (unscoped service_role write)

**Файл:** `supabase/functions/_shared/sync-logic.ts:106, 369-374` · **Область:** Edge-функции

In the user (non-cron) branch, sync-order-to-keycrm authenticates caller A, then calls syncOrderToKeyCRM(adminClient, orderId, A.id) with the order_id taken verbatim from the request body. Ownership is enforced only by claim_order_for_keycrm_sync (WHERE user_id = p_user_id). When A passes a victim B's order_id, the claim returns no row, the re-read with .eq('user_id', userId) also returns null, and the code falls to markFailed(adminClient, orderId, 'Order not found'). markFailed updates by .eq('id', orderId) ONLY — no user scoping — using the service_role client that bypasses RLS and column grants. So caller A writes keycrm_sync_status='failed' / keycrm_sync_error onto another user's order. The catch block in index.ts (lines 88-91) is unscoped the same way. No data is disclosed and duplicate KeyCRM orders are prevented (claim/retry both require keycrm_order_id IS NULL), so blast radius is corruption of two status columns; practical exploitation needs the victim's random order UUID.

**Рекомендация:** Scope every service_role write in this path by user as well: markFailed should .eq('id', orderId).eq('user_id', userId), and the index.ts catch update likewise. Pass userId into markFailed. Alternatively, look up the order's real user_id once and refuse to touch rows the caller doesn't own.

### MEDIUM-5. create-np-ttn has no existing-TTN guard or rate limit — duplicate paid shipping labels

**Файл:** `supabase/functions/create-np-ttn/index.ts:65-119, 141-147` · **Область:** Edge-функции

create-np-ttn (verify_jwt defaults true; in-code user auth, order scoped by user_id so no IDOR) calls Nova Poshta InternetDocument.save unconditionally whenever the order has warehouse_ref/city_ref. Unlike _shared/sync-logic.ts (which guards with `if (!ttn && ...)`), this function never checks `order.np_ttn` before creating a new TTN, and it overwrites np_ttn each call. Any authenticated user can POST their own order_id repeatedly and mint unlimited TTNs; for orders >= FREE_SHIPPING_THRESHOLD PayerType is 'Sender', so each duplicate label is billed to the business. There is also no rate limiting.

**Рекомендация:** Return the existing TTN early if order.np_ttn is already set (mirror sync-logic.ts), and gate the operation to appropriate order states / admins. Add a per-user or per-order rate limit so repeated calls can't generate paid duplicate labels.

### MEDIUM-6. started_at and ended_at are client-clock timestamps (device clock / AsyncStorage), not server time

**Файл:** `app/new-cycle.tsx:266-271` · **Область:** Логика стерилизации

started_at is set from the device clock at cycle start and ended_at from the device clock at completion; both are written directly to the regulatory record. Elapsed is also derived from `startedAt: Date.now()` persisted in AsyncStorage. A user can move the device clock or edit the AsyncStorage `active_timer` blob to manufacture any duration and any start/end wall-clock time, and the journal/PDF will present those fabricated values as the official exposure window. This is the mechanism that makes the client-only minimum-duration check (separate finding) trivially defeatable and undermines the trustworthiness of Form 257/о fields.

**Рекомендация:** Stamp started_at with a DB default (now()) when transitioning to in_progress, and set ended_at server-side on completion. Compute and store actual duration server-side. Do not trust client epoch values for a record meant to evidence compliance.

### MEDIUM-7. Early-finish save is a dead end: the Save button always requires an after-photo, contradicting the no-photo early-finish design

**Файл:** `app/complete-cycle.tsx:502-519` · **Область:** Логика стерилизации

When a cycle is completed before the minimum time (canMarkSuccess === false), the UI deliberately hides the camera/placeholder and shows 'фото ПІСЛЯ не потрібне. Результат: повторити стерилізацію' (lines 397-403). handleUploadAndConfirm and doSave correctly allow saving without a photo in that case (`if (canMarkSuccess && !photoAfter)`). But the primary button's inline onPress unconditionally does `if (!photoAfter) { Alert('Зробіть фото...'); return; }` before ever calling handleUploadAndConfirm. Since no camera is reachable when canMarkSuccess is false, the user can select 'Ні, не змінився' (fail) but can never save it — the button loops on the photo alert. The intended early-finish 'fail' record cannot be created through this screen (only escape is to go back and cancel the cycle).

**Рекомендация:** Make the button's inline guard mirror handleUploadAndConfirm: require photoAfter only when canMarkSuccess. Also disable the Save button consistently with the same condition.

### MEDIUM-8. Completed regulatory records are fully editable and deletable by their owner (no append-only audit lock)

**Файл:** `supabase/migrations/20260326_enable_rls_all_tables.sql:35-41` · **Область:** Логика стерилизации

RLS grants the owner unconditional UPDATE and DELETE on sterilization_sessions, including rows already in 'completed'/'failed'. For a journal whose purpose is to evidence sterilization compliance, there is no immutability: a master (or anyone with the JWT) can alter a completed record's result/timestamps or delete an inconvenient 'failed' entry after the fact. There is no status-transition guard preventing completed -> anything, and no soft-delete/audit trail. (Mitigated only by the app's own note that the paper journal is the legal original.)

**Рекомендация:** Add a trigger forbidding UPDATE/DELETE once status IN ('completed','failed') (or restrict to a short correction window), or move finalized records to an append-only table. At minimum block status downgrades and result changes post-completion.

### MEDIUM-9. Journal PDF 'Тривалість' column prints the planned duration, not the actual elapsed time

**Файл:** `lib/pdf-export.ts:121` · **Область:** Логика стерилизации

generateJournalPDF (the Form 257/о table) fills the 'Тривалість' column from c.duration_minutes, which is the PLANNED/minimum duration chosen at cycle creation, not the actual sterilization time (started_at -> ended_at). The Початок/Кінець columns are real, so the printed duration can disagree with the printed start/end span. The single-cycle PDF (generateCyclePDF) does it correctly by computing actual = ended-started and labelling 'actual (рекомендовано X)'. For a regulatory journal the documented exposure time should be the actual one.

**Рекомендация:** Compute actual minutes from started_at/ended_at (use calcActualMinutes) for the journal table, optionally showing recommended in parentheses, to match the single-cycle protocol and the real Початок/Кінець values.

### MEDIUM-10. Starting a second cycle overwrites the active timer and orphans the first in_progress session

**Файл:** `app/new-cycle.tsx:231-289` · **Область:** Логика стерилизации

startCycle never checks whether an active_timer already exists. If a user starts a new cycle while one is in progress (e.g. forgot to finish, or two devices), createSession makes a new row and AsyncStorage.setItem overwrites the single ACTIVE_TIMER_KEY, replacing the previous cycle's tracking data. The first session stays status='in_progress' in the DB forever — invisible (the journal only lists completed/failed, the widget/timer only track the one in AsyncStorage), never completable, and its pre-scheduled notifications still fire pointing at a session the user can no longer reach normally.

**Рекомендация:** Before creating a new session, check for an existing active_timer / an in_progress session and either resume it or require the user to finish/cancel it first.

### MEDIUM-11. Stale cart price shown to user vs server-recomputed price actually charged

**Файл:** `app/cart.tsx:306-308` · **Область:** Магазин

The cart persists a full Product snapshot (including price) in AsyncStorage, and `total` is computed from those frozen prices (cart-context.tsx:106). The server BEFORE-INSERT trigger overwrites price_at_order with the CURRENT products.price, and recompute_order_total derives total_amount from that. So if a product's price changes between add-to-cart and checkout, the checkout summary, the free-shipping label, and the success screen (`setConfirmedTotal(total)`) all show the stale client price, while the order/KeyCRM/TTN use the new server price. The pre-flight check getProductsStockStatus() already round-trips to the products table but only selects id/name/in_stock — it has the perfect opportunity to detect price drift and does not.

**Рекомендация:** In getProductsStockStatus also select `price`, compare to the cached cart price, and if any item drifted show the user the new price and require re-confirmation before createOrder. At minimum, display the server-authoritative total_amount on the success screen rather than the client-computed `confirmedTotal`.

### MEDIUM-12. No quantity-vs-available-stock check and no max-quantity cap — overselling possible

**Файл:** `supabase/migrations/20260522_fix_enforce_price_type_cast.sql:38-41` · **Область:** Магазин

Stock is modeled as a boolean (products.in_stock). The order_items trigger only rejects quantity < 1; it never compares requested quantity to KeyCRM available quantity. The client also imposes no upper bound: product/[id].tsx increments qty with `setQty(qty + 1)` unbounded, and cart-context updateQuantity has no cap. A user can therefore order 9999 units of an item that has 1 in stock; the order syncs to KeyCRM with that quantity and KeyCRM stock can go negative. Absurd/fat-finger quantities are accepted end-to-end.

**Рекомендация:** Track and validate available quantity (not just a boolean) at order time — ideally in the enforce_order_item_price trigger using the KeyCRM-synced quantity — and cap per-line quantity in the UI to a sane maximum / available stock.

### MEDIUM-13. Order + order_items inserts are not atomic; a crash between them yields an empty order that syncs to KeyCRM

**Файл:** `lib/api.ts:468-513` · **Область:** Магазин

createOrder performs two independent client-side inserts: first the orders row, then the order_items batch. The compensating delete only runs when the order_items insert returns an error. If the app is killed or the network drops AFTER the orders insert returns but BEFORE the items insert (or if the compensating delete itself fails), an items-less order persists with status 'pending', keycrm_order_id NULL and total_amount 0. retry-failed-syncs will then pick it up (pending + null id) and POST an empty, zero-total order to KeyCRM (products: []). There is no zero-item guard in the sync path.

**Рекомендация:** Wrap the order + items creation in a single Postgres RPC (transaction) so it is all-or-nothing. As defense in depth, have syncOrderToKeyCRM short-circuit (and mark the order failed/cancelled) when an order has zero items.

### MEDIUM-14. Order detail financial breakdown is wrong when delivery cost is present

**Файл:** `app/order/[id].tsx:259-271` · **Область:** Магазин

recompute_order_total sets orders.total_amount = SUM(price_at_order * quantity) — goods only; np_delivery_cost is stored separately and is never added into total_amount. The order detail summary, however, treats total_amount as if it INCLUDED delivery: it shows 'Товари' = total_amount - deliveryCost (understating the goods subtotal) and 'Разом' = total_amount (excluding delivery entirely). For any order that received a Nova Poshta TTN (np_delivery_cost > 0, the common case for orders under the free-shipping threshold), the displayed goods line and grand total are both incorrect.

**Рекомендация:** Show 'Товари' = order.total_amount (goods are already goods-only) and 'Разом' = order.total_amount + (deliveryCost ?? 0). Or decide explicitly whether delivery is included and make the trigger and the UI agree.

### MEDIUM-15. SMS pumping exposure: no CAPTCHA, 5s server-side per-phone cooldown, and a project-global SMS quota that doubles as a login-DoS vector

**Файл:** `supabase/config.toml:176-196, 236-244` · **Область:** Авторизация

The committed auth config has [auth.captcha] commented out, [auth.sms] enable_signup = true, and max_frequency = "5s" (minimum gap between OTP SMS to the same phone). The app's anon key is extractable from the bundle, so an attacker can call /auth/v1/otp directly for arbitrary phone numbers, bypassing all client-side validation (the +380 prefix whitelist and 60s cooldown in app/auth.tsx exist only in the client). send-sms-hook forwards any phone Supabase hands it to SMSFly with no allowlist (supabase/functions/send-sms-hook/index.ts:53-75). Cost is bounded by sms_sent = 30 per hour, but that limit is project-wide — burning it with 30 junk OTP requests per hour locks every legitimate user out of login indefinitely at trivial cost to the attacker (sign_in_sign_ups = 30 per 5 min applies per IP only). Caveat: production limits live in the Supabase dashboard and may differ from this file; the committed values document intent.

**Рекомендация:** Enable CAPTCHA (Turnstile) for OTP requests, raise max_frequency to ~60s to match the client UX, add a UA-prefix allowlist server-side (reject non-+380 in a before-send hook or in send-sms-hook), and set up SMSFly spend alerts. Verify the dashboard values match config.toml.

### MEDIUM-16. No watchdog covers the profile-check phase: a hung profiles query leaves an authed user on the native splash forever

**Файл:** `lib/auth-context.tsx:83-91, 107-112, 134-173` · **Область:** Авторизация

The 5s timeout only forces status='guest' when INITIAL_SESSION never fired (`if (!initialized.current)`). When INITIAL_SESSION arrives WITH a session, initialized=true and status stays 'loading' until the profiles select resolves (the finally block at lines 166-171 sets 'authed'). The supabase-js query has no timeout/AbortSignal; on a hung connection at launch the promise neither resolves nor rejects, status stays 'loading', and app/_layout.tsx line 56-59 never calls SplashScreen.hideAsync() — the app appears dead at launch, exactly the 'launch failure' class that previously triggered App Review rejection. Conversely, if INITIAL_SESSION itself is slower than 5s, an authed user is briefly forced to 'guest' (router.replace('/auth') fires), then flips to 'authed' when the session and profile check land — a jarring auth-screen flash but self-correcting.

**Рекомендация:** Wrap the profile check in Promise.race with a 5-10s timeout that falls through to setStatus('authed') with profileComplete=false (onboarding is a safe fallback), or extend the watchdog to cover any status==='loading' state older than N seconds.

### MEDIUM-17. Cold-start notification tap navigates before any navigator is mounted — deep link to complete-cycle is dropped

**Файл:** `app/_layout.tsx:132-134` · **Область:** Уведомления/надёжность

getLastNotificationResponseAsync() resolves in milliseconds on the first mount of RootNavigator, while auth status is still 'loading' and the component returns <AnimatedSplash /> (line 145-147) — no <Stack> navigator exists yet (auth + profile check need a network round-trip). router.push() at that moment either throws (swallowed by the try/catch in route(), line 124-126) or is dropped by react-navigation as an unhandled action. There is no deferral or retry once the authed Stack mounts. The code's own comment states this is the COMMON path ('a 60-min cycle almost always ends with the app killed'), so the headline flow — tap 'Час стерилізації досягнуто' / the 'Зробити фото ПІСЛЯ' action button → land on the after-photo screen — likely degrades to just opening the home screen on every cold launch.

**Рекомендация:** Stash the pending notification route in a ref/state (like the existing POST_AUTH_ROUTE_KEY pattern at lines 100-109) and execute it in an effect gated on status === 'authed' && profileComplete === true, after the Stack has mounted.

### MEDIUM-18. Poller can send a duplicate order-status push right after the webhook (stale snapshot + non-conditional update + strict '<' guard)

**Файл:** `supabase/functions/poll-keycrm-statuses/index.ts:112-137` · **Область:** Уведомления/надёжность

The poller fetches a snapshot of up to 50 orders once (lines 46-52), then iterates with network calls plus a 300ms delay per order — a run can span minutes. If the KeyCRM webhook lands during the run for an order later in the snapshot, the webhook updates the row and pushes; the poller then compares the fresh KeyCRM status against its STALE snapshot status (line 97: newStatus !== order.status), and the monotonic guard at lines 104-110 uses strict '<' so an EQUAL status_changed_at passes. The poller then re-updates the row unconditionally and sends a second push for the same transition. The status write itself is idempotent, but the user gets two 'Статус замовлення' notifications.

**Рекомендация:** Make the update conditional on the snapshot status (.eq('status', order.status)) and only push when the update affected a row (select().maybeSingle() and skip push on 0 rows), or re-read the row's current status immediately before pushing. Alternatively change the monotonic guard to '<=' when statuses are equal-timestamped.

### MEDIUM-19. Cycle-done/nudge alerts re-fire (banner + sound, ~1s later) every time the timer screen is reopened past the minimum time

**Файл:** `lib/notifications.ts:198-230` · **Область:** Уведомления/надёжность

timer.tsx:107 calls scheduleCycleNotifications() on every mount as a 'self-heal'. Fixed identifiers correctly REPLACE still-pending requests, but an already-DELIVERED notification cannot be replaced — re-scheduling creates a new one. Once elapsed >= recSec, doneIn = Math.max(1, recSec - elapsed) = 1, so every time the master opens the timer screen (e.g. tapping the home ActiveTimerWidget to peek at a finished cycle) a fresh 'Час стерилізації досягнуто' fires 1 second later with sound, in the foreground, on top of the green 'Готово' UI (the handler at lines 13-21 shows banners in foreground). If elapsed also exceeds recSec+120/+300, both nudges fire ~1s later too — up to three banners per reopen, repeated on every reopen.

**Рекомендация:** In scheduleCycleNotifications, skip scheduling any alert whose offset is already in the past (elapsed >= recSec → don't schedule 'done'; same for each nudge), or check Notifications.getAllScheduledNotificationsAsync()/track a 'fired' flag per session before re-arming.

### MEDIUM-20. Overheat-cap guard `capIn > recSec` compares the wrong quantities — cap alert is not re-armed by the self-heal path

**Файл:** `lib/notifications.ts:237-238` · **Область:** Уведомления/надёжность

The intent (per comment) is to skip the 60-min overheat alert only when it would coincide with 'done' (dry-heat: recSec == 3600). The correct condition compares totals (MAX_CYCLE_SECONDS > recSec), but the code compares the REMAINING time to cap (capIn = 3600 - elapsed) against the TOTAL recommended seconds. At cycle start (elapsed≈0) it behaves correctly, but on re-arm with elapsed > 0 (timer.tsx:107 self-heal — which exists precisely to recover from Android reboots dropping alarms and to backfill old cycles) the cap is silently not scheduled once elapsed > 3600 - recSec. Example: 20-min mode, reboot at minute 45, reopen timer → capIn = 900 < recSec = 1200 → no overheat alarm at minute 60, the safety alert the code says 'always fires'.

**Рекомендация:** Change the guard to compare totals: `if (MAX_CYCLE_SECONDS > recSec)` (optionally also skip if elapsed >= MAX_CYCLE_SECONDS, mirroring the 'already fired' fix from the previous finding).

### MEDIUM-21. Solution-expiry server pushes bypass all user notification preferences

**Файл:** `supabase/functions/notify-cycle-idle/index.ts:85-120` · **Область:** Уведомления/надёжность

The daily cron gates the 'no sterilization today' push on profile.notification_cycle_idle (line 64), but the solution 'expiring in <=3 days' and 'expired' pushes are sent to every profile with a token, unconditionally. No notification preference for solutions exists at all (migrations/20260320_cabinet_roles_notifications.sql defines only notification_cycle_done / notification_cycle_idle / notification_order_status; profile.tsx:253 exposes only those three toggles), so users cannot opt out of solution pushes inside the app — only by killing notifications OS-wide, which would also silence the safety-critical cycle alarms.

**Рекомендация:** Add a notification_solution_expiry boolean to profiles (default true), gate the two solution branches on it, and expose a toggle in profile.tsx alongside the existing three.

### MEDIUM-22. Hard 60-minute timer cap contradicts the app's own 160°C/150 min preset and 480-min custom modes

**Файл:** `app/timer.tsx:28, 272, 337` · **Область:** UX/полезность

timer.tsx freezes the counter at MAX_CYCLE_SECONDS = 60*60 and shows a red 'Завершіть цикл — 1 година' / 'Минула 1 година — максимальний час циклу. Завершіть цикл, щоб не пошкодити інструменти.' But lib/steri-config.ts ships a МОЗ-approved dry-heat preset of '160°C · 150 хв' (lines 50-52), and new-cycle validation accepts custom durations up to 480 min (app/new-cycle.tsx:209). A master running the legitimate 150-min program sees the timer freeze at 60:00 and be told to stop — while complete-cycle simultaneously refuses 'success' before 150 min (canMarkSuccess), which combined with the previous finding double-traps her. Notably lib/notifications.ts already handles this correctly: the cap notification is skipped when capIn > recSec is false (line 238), so the UI contradicts the notification logic. ActiveTimerWidget mirrors the same frozen cap (components/ActiveTimerWidget.tsx:17).

**Рекомендация:** Make the cap relative to the selected mode, e.g. max(MAX_CYCLE_SECONDS, recommendedSeconds + grace), in timer.tsx and ActiveTimerWidget — matching the `capIn > recSec` logic already used in scheduleCycleNotifications.

### MEDIUM-23. SmartSuggestion reorder banner is fully implemented but never rendered — the consumption-based restock feature is unshipped

**Файл:** `components/SmartSuggestion.tsx:11-32` · **Область:** UX/полезность

components/SmartSuggestion.tsx implements the 'time to restock kraft packs' suggestion (triggers at ≥20 cycles/month, estimates pack consumption), but it is imported by no screen — grep finds only its own definition. The home screen already computes the month's session count (app/(tabs)/index.tsx 'Цей місяць' stat), so the data needed exists. Additionally, the component's CTA opens the external website (Linking.openURL('https://dezik.com.ua')) instead of the in-app catalog tab, so even if wired up it would route purchases away from the in-app shop. This is the exact 'unimplemented reorder suggestion' usefulness gap: high-frequency masters never get nudged to reorder despite the app selling the consumables.

**Рекомендация:** Either render it on the home screen (<SmartSuggestion monthSessionCount={sessions.length} /> in the stats section) with the CTA changed to router.push('/(tabs)/catalog'), or delete the component to avoid shipping dead code.

### MEDIUM-24. No way to cancel an order in-app — order detail offers only 'Повторити замовлення'

**Файл:** `app/order/[id].tsx:306-327` · **Область:** UX/полезность

Order statuses include 'pending' ('Нове') and 'canceled' exists in STATUS_CFG, but there is no user-facing cancellation action anywhere: order/[id].tsx renders only a reorder button, orders.tsx only 'Повторити' for archive rows. For a COD/invoice flow (no online payment), a buyer who made a mistake has no in-app recourse and no displayed support contact on the order screen either — they must wait for the manager's call. This is a predictable complaint generator and a common App Review UX note for shopping apps.

**Рекомендация:** For status === 'pending', show a 'Скасувати замовлення' action that flips the order via an edge function (which also updates KeyCRM), or at minimum display a tappable support phone/Telegram link on the order screen.

## LOW — гигиена и харднинг (43)

- **Android Auto Backup not disabled — AsyncStorage (auth token + PII caches) included in cloud/adb backups** — `app.json:26-35`. Add the expo-build-properties plugin with android.allowBackup=false, or ship backup_rules.xml excluding the AsyncStorage/databases directory.
- **Captured indicator photos, exported journal PDFs and story snapshots are never deleted from the cache directory** — `components/CameraCapture.tsx:36`. After successful upload/share, delete the temp files with expo-file-system (FileSystem.deleteAsync(uri, { idempotent: true })); optionally sweep stale files in the cache dir on app start.
- **Full photo-library permission requested where add-only (writeOnly) access suffices** — `lib/share-instagram.ts:31-36`. Call MediaLibrary.requestPermissionsAsync(true /* writeOnly */) so only add-only access is requested.
- **Missing Supabase env vars silently produce a broken production client (check is dev-only)** — `lib/supabase.ts:8-13`. Throw (or render a hard error screen) in all build types when either variable is missing, instead of defaulting to empty strings.
- **ai-assistant daily limit fails open if the usage RPC errors** — `supabase/functions/ai-assistant/index.ts:64-71`. Fail closed on usageErr: if the counter cannot be read/incremented, reject the request (or serve a soft error) rather than calling Claude. Log usageErr so the failure is visible to monitoring.
- **Raw internal error strings returned to clients in several functions** — `supabase/functions/sync-order-to-keycrm/index.ts:93`. Return a generic client message and log full detail server-side (as ai-assistant and create-np-ttn already do). Drop the `message`/`details` fields from responses or gate them behind a debug flag.
- **sync-order-to-keycrm cron branch trusts body.user_id / body.user_email without deriving from the order** — `supabase/functions/sync-order-to-keycrm/index.ts:33-38`. In the cron branch, load the order by order_id with service_role and derive user_id (and email via the profile) from the order itself, rather than trusting body.user_id/body.user_email.
- **KeyCRM webhook secret travels in the URL query string** — `supabase/functions/keycrm-order-webhook/index.ts:37-39`. Rotate KEYCRM_WEBHOOK_SECRET periodically, keep it high-entropy, and confirm Supabase/edge access logs do not retain full request URLs. If KeyCRM ever supports header auth, migrate off the query param.
- **restore-product-images SSRF guard checks only literal IP/host strings (DNS-based bypass)** — `supabase/functions/restore-product-images/index.ts:45-70`. Resolve the hostname and re-check the resulting IP(s) against the private ranges before fetching, or pin allowed image hosts to KeyCRM/Supabase domains via an allowlist.
- **refresh-stock cooldown is per-isolate, weak under cold-start fan-out** — `supabase/functions/refresh-stock/index.ts:13-18, 45-47`. Back the throttle with a shared store (a DB row / advisory lock or the same usage-counter pattern used for ai-assistant) so the cooldown is global, not per-isolate.
- **Dead permissive UPDATE policy on orders + INSERT-only sanitizer leaves order integrity dependent on a single grant REVOKE** — `supabase/migrations/create_orders.sql:33-36`. Drop the now-dead 'Users can update own orders' policy, and add a BEFORE UPDATE sanitizer trigger on orders mirroring sanitize_order_insert (force server-managed columns to OLD values for authenticated/anon) so order integrity does not hinge on one grant statement.
- **order_items remains client UPDATE/DELETE-able; only orders had its grant revoked** — `supabase/migrations/create_orders.sql:57-70`. Restrict client UPDATE/DELETE on order_items once the parent order has keycrm_order_id set (e.g. add a trigger raising on modification of synced orders' items), or revoke client UPDATE/DELETE on order_items entirely since lib/api.ts only ever INSERTs them.
- **Column-level REVOKE UPDATE on profiles.role / keycrm_buyer_id are no-ops; protection rests solely on one trigger** — `supabase/migrations/20260521_security_hardening.sql:16`. Treat the trigger as the sole control and protect it (or convert profile writes to go through a SECURITY DEFINER upsert RPC that whitelists columns). At minimum correct the misleading comment so future maintainers don't assume the column REVOKE is load-bearing.
- **is_admin() granted to authenticated with caller-supplied user id enables admin enumeration** — `supabase/migrations/20260529_admins_table.sql:32-44`. Expose a zero-arg variant for clients that always uses auth.uid() internally, and revoke EXECUTE on the parameterized overload from authenticated (keep it service_role-only). This preserves the 'show admin links on mobile' use case without allowing enumeration.
- **Orphaned before-photo left in storage when draft rollback fires after a successful upload** — `app/new-cycle.tsx:265-301`. On rollback, also call supabase.storage.from('cycle-photos').remove([path]) (best-effort) when a path was created.
- **'No sterilization today' reminder uses server-local (UTC) midnight, not Kyiv time** — `supabase/functions/notify-cycle-idle/index.ts:53-54`. Compute the day boundary in Europe/Kyiv (e.g. via a timezone-aware calculation) so 'today' matches the user's local day.
- **Completion can produce two 'cycle done' notifications (pre-scheduled timer-done plus notifyCycleDone)** — `lib/notifications.ts:275-301`. Skip notifyCycleDone when the pre-scheduled done alert already fired, or consolidate to a single completion notification path.
- **Reorder from order detail silently wipes the current cart without confirmation** — `app/order/[id].tsx:135-140`. Use the additive addItems() API (as orders.tsx does) or prompt the user to confirm replacing the cart before calling clearCart().
- **TTN weight hardcoded to 1 kg, ignoring per-product weight and quantity** — `supabase/functions/_shared/sync-logic.ts:300`. Compute total weight from SUM(products.weight * quantity) over the order items (with the documented 0.5 kg fallback) and pass it as Weight; consider SeatsAmount based on quantity/packaging.
- **Orphaned create-np-ttn function bills using buyer phone and supports only warehouse delivery** — `supabase/functions/create-np-ttn/index.ts:92-111`. Delete the unused function, or if it is kept as a manual-retry tool, align it with sync-logic.ts (recipient_* fields, delivery_type branch, address delivery).
- **Add-to-cart from product detail loops addItem() per unit instead of using the bulk API** — `app/product/[id].tsx:104-105`. Call addItems([{ product, quantity: qty }]) once instead of looping addItem().
- **USER_UPDATED event sets status to 'loading' but the profile-check effect keys on an unchanged user id — status would stick on 'loading' (permanent splash)** — `lib/auth-context.tsx:98-103, 134, 173`. Only set status to 'loading' for SIGNED_IN, or make the profile-check effect depend on the session object / an explicit 'recheck' counter so every 'loading' transition is guaranteed a matching 'authed' transition.
- **Client 60s resend cooldown is bypassable in-app via the Back link; sendOtp itself never checks the cooldown** — `app/auth.tsx:70-86, 170-177`. Check resendIn inside sendOtp (early-return with the countdown alert) and persist the per-phone cooldown across step changes; optionally count failed verifications and force a fresh code after ~5 attempts.
- **Session (refresh token) persisted in plain AsyncStorage instead of SecureStore** — `lib/supabase.ts:13-20`. Use a SecureStore-backed adapter (e.g. store an AES key in expo-secure-store and encrypt the AsyncStorage payload, as in supabase's aes-js example) for the auth.storage option.
- **Offline sign-out fails silently: auth-js keeps the local session on network errors and the returned error is discarded** — `app/(tabs)/profile.tsx:290`. Await signOut(), and on error either show a toast ('Не вдалось вийти — перевірте з'єднання') or retry with { scope: 'local' } which clears local state without a server round-trip.
- **Guest deep-linked to /orders gets an infinite skeleton loader** — `app/orders.tsx:106, 116-117, 238-241`. Add a guest branch (Redirect to /(tabs)/catalog or a 'Увійдіть, щоб бачити замовлення' empty state) — or rely on Stack.Protected so the screen is unreachable as guest.
- **Session-expiry produces two stacked alerts: useSessionGuard alerts internally AND callers alert again on null** — `lib/auth-context.tsx:38-46`. Make useSessionGuard silent (return null, let callers own UX), or have callers trust the guard's alert and not show their own. For new-cycle/complete-cycle, stash the form draft in AsyncStorage before signing out so the entry survives re-login.
- **Notification tap routing ignores auth status — stale notifications after sign-out push guests into account screens** — `app/_layout.tsx:74-105`. Check status === 'authed' before routing; if guest/loading, stash the pending destination and replay it after the authed stack mounts. Also clear scheduled/delivered notifications on sign-out.
- **Login from guest checkout dumps the user on the home tab — cart contents survive but the checkout flow restarts from scratch** — `app/_layout.tsx:144-166`. Persist a 'resume=/cart?checkout=1' intent before pushing /auth from startCheckout and replay it once status becomes 'authed' (and after onboarding completes), so the buyer lands back in checkout.
- **Expired-solution push repeats every day forever and duplicates the locally scheduled reminders** — `supabase/functions/notify-cycle-idle/index.ts:96-118`. Track last_notified_at / notified_expired on the solutions row and send the expired alert once (or at most once, then weekly). Decide on one channel per event: e.g. local notifications for the device that created the solution, server push only as fallback when no local schedule exists.
- **'No sterilization today' uses the UTC day boundary, not Kyiv local time** — `supabase/functions/notify-cycle-idle/index.ts:53-54`. Compute the day boundary in Europe/Kyiv (e.g. via Intl.DateTimeFormat with timeZone, or shift by the Kyiv UTC offset) before building todayStart.
- **notify-cycle-idle has no scheduled invocation anywhere in the repo (all other crons are in migrations)** — `supabase/functions/notify-cycle-idle/index.ts:2-10`. Add a migration mirroring 20260334_cron_poll_keycrm_statuses.sql that cron.schedule()s notify-cycle-idle daily (with the Kyiv-evening time accounted for in UTC), so the schedule is reproducible and auditable.
- **Expo push receipts never checked, and the bulk cron path skips dead-token pruning entirely** — `supabase/functions/_shared/expo-push.ts:56-74`. Pass the admin client from notify-cycle-idle, and add a receipt-checking pass (store ticket ids, query /--/api/v2/push/getReceipts after ~15 min or on the next cron run) that nulls DeviceNotRegistered tokens.
- **No production crash telemetry; 'Перезапустити' only resets state and can instantly re-crash on deterministic render errors** — `components/ErrorBoundary.tsx:16-22`. Add a crash reporter (e.g. sentry-expo) and report from componentDidCatch in production. Make handleRestart call Updates.reloadAsync() (expo-updates) as a true restart, falling back to state reset; optionally clear suspect caches on second consecutive crash.
- **Supabase write errors silently ignored: notification toggles, push-token save, solution deletes report success on failure** — `app/(tabs)/profile.tsx:253-263`. Destructure { error } from each call; on error revert the optimistic toggle and show an alert. In the delete flows, only call cancelSolutionNotifications and refresh after a confirmed successful delete.
- **OS notification permission prompt fires unprimed right after sign-in; denial silently disables the safety-critical cycle alarm with no in-app warning** — `lib/auth-context.tsx:169-170`. Prime the permission request (explain cycle alarms first, then request — ideally on first cycle start rather than at login). In new-cycle/timer, when permission is denied, show a one-time banner ('Сповіщення вимкнені — таймер не подасть сигнал у фоні') with a link to OS settings.
- **ActiveTimerWidget parses AsyncStorage JSON without a guard — corrupted payload breaks the home-screen widget via unhandled rejection** — `components/ActiveTimerWidget.tsx:66-69`. Mirror timer.tsx: wrap JSON.parse in try/catch, remove the key on parse failure, and add .catch to the check() invocation.
- **Catalog has no product search** — `app/(tabs)/catalog.tsx:153-172`. Add a lightweight client-side name filter (TextInput above the pills filtering the already-loaded `products` array) — no backend change needed.
- **cabinet/solutions.tsx is an orphan screen — registered in the stack but never navigated to** — `app/cabinet/solutions.tsx:22 (whole screen); app/_layout.tsx:194`. Delete app/cabinet/solutions.tsx and its Stack.Screen entry, or link it from the profile if a cabinet entry point is actually desired.
- **Legacy data/catalog.json with hardcoded products and prices is shipped but unreferenced** — `data/catalog.json:1-20`. Delete the file (catalog is fully DB-driven via supabase.from('products')).
- **/cabinet/employees is pushed but not declared in the authed Stack — loses the modal presentation its siblings have** — `app/(tabs)/profile.tsx:666; app/_layout.tsx:192-194`. Add `<Stack.Screen name="cabinet/employees" options={{ presentation: 'modal' }} />` to the authed Stack (or drop modal presentation for the whole group).
- **Ukrainian copy slips: raw JSON error blobs and wrong grammar in AI chat, unpluralized product count in catalog** — `app/ai-chat.tsx:255; app/(tabs)/catalog.tsx:133`. Replace the raw-JSON branch with a friendly Ukrainian message ('Не вдалося отримати відповідь. Спробуйте ще раз.') and reuse the pluralization helper pattern from profile.tsx for the catalog count.
- **Hardware back skips in-screen steps: cart checkout collapses entirely and auth OTP step exits the app** — `app/cart.tsx:429; app/auth.tsx:170-177`. Add BackHandler listeners (or useFocusEffect + BackHandler) that map hardware back to the same one-step-back behavior when showCheckout / step==='otp' is active.

## INFO — наблюдения (13)

- **Un-replaced Meta appId placeholder shipped in the bundle** — `lib/share-instagram.ts:16`. Inject the real Meta app id via EXPO_PUBLIC_ env/app config, or remove the Stories branch and use the gallery fallback explicitly.
- **Guest cart deliberately persists across accounts on the same device** — `lib/cart-context.tsx:6, 37-59`. Acceptable as-is; if multi-user devices matter, clear the cart in the account-deletion path at minimum.
- **ActiveTimerWidget renders the cached active_timer without verifying it belongs to the current user** — `components/ActiveTimerWidget.tsx:66-74`. Clear active_timer on SIGNED_OUT (covered by the global wipe in finding 2), or store the owning uid in the payload and skip rendering when it mismatches.
- **nova-poshta-proxy and create-np-ttn have no per-user throttle on the Nova Poshta API** — `supabase/functions/nova-poshta-proxy/index.ts:36-100`. Add a lightweight per-user daily cap (same RPC pattern as ai-assistant/lookup) for the NP-backed endpoints if quota abuse becomes a concern.
- **ops-photos bucket retains public read with no application usage** — `supabase/migrations/20260609000003_solution_photos_and_ops_photos.sql:35-41`. Delete the ops-photos bucket if truly unused, or drop its public-read policy and gate any future reads behind per-owner RLS / service_role signed URLs.
- **UPDATE policies on user-owned tables omit explicit WITH CHECK** — `supabase/migrations/20260326_enable_rls_all_tables.sql:36`. Add explicit WITH CHECK (auth.uid() = user_id) to these UPDATE policies for auditability and to remove reliance on the implicit USING-as-WITH-CHECK behavior.
- **cycle-photos was made fully public for a period, exposing all users' clinic photos (now remediated)** — `supabase/migrations/20260519_cycle_photos_keep_public.sql:9`. No action required on current state. Keep cycle-photos private; treat any future public=true flip on a personal-data bucket as a security-reviewed change.
- **Type drift between products.id and order_items.product_id forces a text-cast in the price-enforcement trigger** — `supabase/migrations/20260522_fix_enforce_price_type_cast.sql:26`. Reconcile the column types (migrate order_items.product_id to match products.id) so the comparison is a typed, indexed equality, removing the long-term fragility on the anti-price-manipulation path.
- **Webhook applies status changes without a terminal-state lock (status can regress)** — `supabase/functions/keycrm-order-webhook/index.ts:101-117`. If desired, treat delivered/canceled as terminal in the webhook (ignore further transitions, or only allow delivered<->canceled corrections), mirroring the poller's exclusion.
- **All sign-out paths use the default global scope — logging out on one device revokes sessions on every device** — `app/(tabs)/profile.tsx:290`. Decide explicitly: keep scope:'global' for the security-relevant paths (delete account, 'wrong account' escape hatch) and consider scope:'local' for the routine cabinet logout, documenting the choice.
- **notifyOrderStatusChange() is dead code — the 'local fallback' for order status is never invoked** — `lib/notifications.ts:306-332`. Delete the function, or wire it to the realtime order channel as the intended foreground fallback (taking care to dedupe against the server push, e.g. fixed identifier `order-${orderId}-status` already replaces — note a server push for the same change would still duplicate it).
- **Profile order count is silently capped at 10** — `app/(tabs)/profile.tsx:208, 644-649`. Keep the slice for rendering but store the true total (o.length) separately for the count/badge.
- **package.json version (1.0.0) is out of sync with app.json (1.0.10)** — `app.json:5`. Bump package.json to match, or document that app.json is the single source of truth.

## Статус находок аудита 8 июня

| ID | Статус | Находка |
|---|---|---|
| L1/SEC-1 | ❌ НЕ исправлено | Supabase session JWT+refresh token in plaintext AsyncStorage |
| L2/PII-1 (doc: M1 · PII-1) | ❌ НЕ исправлено | delete-account does not erase/anonymize KeyCRM buyer; privacy policy denies third-party sharing |
| L3/EAUTHZ-2 | ❌ НЕ исправлено | sync-order-to-keycrm cron path trusts body.user_email/user_id |
| L4/EAUTHZ-3 | ❌ НЕ исправлено | Raw DB/internal error messages returned by delete-account, keycrm-order-webhook, send-sms-hook |
| L8/PII-3 | ❌ НЕ исправлено | KeyCRM webhook secret accepted via ?secret= query parameter |
| M1/CART-1 (doc: M2 · CAUTH-1) | ❌ НЕ исправлено | dezik_cart + ai_chat_sessions not namespaced per user and not cleared on signOut/delete |
| M2/ORPHAN-1 (doc: M3 · EDGE-1) | ❌ НЕ исправлено | create-np-ttn orphan function — no client caller, no idempotency guard, callable by any authenticated user |
| VERIFY-RLS-REVOKES | ✅ исправлено | Already-fixed: RLS isolation + orders/profile column write-locks (20260609000001) + rate-limit RPC lockdown (20260609000004) |
| VERIFY-SIGNED-URLS | ✅ исправлено | Already-fixed: private buckets + signed URLs for cycle-photos / solution-photos (20260609000003) |
| VERIFY-SSRF-GUARD | ✅ исправлено | Already-fixed: SSRF guard in restore-product-images |
| VERIFY-PII-REDACTION | ✅ исправлено | Already-fixed: PII redaction in edge-function logs |
| VERIFY-RATE-LIMITS | ✅ исправлено | Already-fixed: rate limits (AI daily cap + RPCs locked to service_role) |
| L2 · EAUTHZ-1 (other doc finding) | ❌ НЕ исправлено | Six cron functions share one CRON_SECRET |
| L5 · DBRLS-1 (other doc finding) | ❌ НЕ исправлено | is_admin(p_user_id) SECURITY DEFINER admin-membership oracle |
| L7 · CAUTH-2 (other doc finding) | ❌ НЕ исправлено | No screen-capture protection / app-switcher privacy overlay on OTP/profile screens |

## Проверка полноты (критик)

- **[medium] Account deletion never erases PII held by third-party processors (KeyCRM, Nova Poshta, SMSFly)** — `supabase/functions/delete-account/index.ts`. delete-account purges Supabase tables/buckets and the auth user, but makes zero calls to KeyCRM (buyer record + mirrored orders with full name, phone, email, delivery address pushed by _shared/sync-logic.ts), Nova Poshta (TTNs with recipient PII) or SMSFly. The in-app deletion dialog promises 'остаточно видалити акаунт та всі дані' and the function header cites GDPR Art.17 / Apple 5.1.1(v), so erasure is materially incomplete. The audit flagged client caches not being wiped, but not the server-side third-party erasure gap.
- **[medium] delete-account reports ok:true on partial deletion: unchecked table deletes and unpaginated storage purge (100-object cap)** — `supabase/functions/delete-account/index.ts`. Lines 17-25: purgeUserBucket calls storage.list() with no limit/offset — supabase-js defaults to 100 entries per call, so a user with >100 session folders in cycle-photos (a few months of salon use) keeps orphaned clinic photos after 'deletion'; the per-folder file list has the same cap. Lines 84-95: every .delete() result is discarded — if orders/sessions deletes fail (FK, RLS, transient), execution continues, the auth user is still deleted and the client gets ok:true, stranding owner-less PII rows that no one can ever access or clean.
- **[low] npm audit: 20 known vulnerabilities in production dependency tree (1 critical, 3 high)** — `package.json`. npm audit --omit=dev reports: critical shell-quote <=1.8.3 (GHSA-w7jw-789q-3m8p), high node-forge <=1.3.3 (cert-chain bypass, RSA/Ed25519 signature forgery), high @xmldom/xmldom <=0.8.12 (XML injection), high picomatch (ReDoS), moderate ws 8.x (uninitialized memory disclosure), yaml, postcss. All are transitive via expo/@expo/cli build tooling rather than the shipped RN bundle, so runtime risk is limited to the dev/build pipeline — but nothing in the repo tracks or patches them, and the lockfile ambiguity (next finding) blocks `npm audit fix`.
- **[low] Three lockfiles tracked at once (yarn.lock, package-lock.json, 'package-lock 3.json') plus stray 'metro.config 2.js' — non-reproducible builds** — `package-lock.json`. git ls-files confirms yarn.lock, package-lock.json, 'package-lock 3.json' and 'metro.config 2.js' (Finder duplicates) are all committed. EAS picks yarn when yarn.lock exists while local npm installs mutate package-lock.json, so CI/dev/EAS can resolve different transitive trees; the duplicate metro config and lockfile are dead weight that invites editing the wrong file. The audit's only versioning note was the package.json/app.json version drift.
- **[low] No CI anywhere — 13 jest suites run only by hand, and tests are excluded from typechecking** — `jest.config.js`. There is no .github directory, no EAS build hooks, and no pre-commit tooling; the existing __tests__ suites (cycle timer, presets, shop integration, auth status, pdf export, notifications) gate nothing — a release can ship with them red. tsconfig.json additionally excludes __tests__ and __mocks__, so test code is not even type-checked. Given the audit found multiple regressions (60-min cap vs 150-min preset, dead early-finish save) that these suites' domains should have caught, absent automation is the root-cause angle the audit never raised.
- **[low] All 19 edge functions import @supabase/supabase-js with a floating major-only pin from esm.sh** — `supabase/functions/_shared/sync-logic.ts`. grep shows 19 occurrences of `https://esm.sh/@supabase/supabase-js@2` across every function — minor/patch versions float and are fetched from a third-party CDN at cold start with no integrity pinning or import map, so an upstream breaking change or esm.sh compromise lands silently in functions holding the service-role key. The lone exact pin (standardwebhooks@1.0.0 in send-sms-hook) shows the inconsistency. No deno.lock / import_map in the repo.
- **[low] ai-assistant resends a ~60 KB system prompt every call with no prompt caching** — `supabase/functions/ai-assistant/index.ts`. SYSTEM_PROMPT concatenates delanol (32 KB) + bionol-forte (25 KB) + instrum (2.7 KB) instructions — roughly 20-25k tokens of Ukrainian text — and the /v1/messages body (lines ~108-117) sets no cache_control blocks, so every one of the up-to-30 daily calls per user bills the full system prompt at base input rates. Adding ephemeral prompt caching on the system block would cut input cost ~90% on cache hits. (Prompt-injection posture is otherwise solid: input caps, role whitelist, instruction-grounded system prompt; the audit's only ai-assistant finding was the fail-open rate limit.)
- **[low] Salon-wide shared login: operator attribution in the regulatory journal is optional, unauthenticated free text** — `supabase/migrations/20260324_add_employees.sql`. employees are plain name labels under one account; sterilization_sessions.employee_id is nullable with ON DELETE SET NULL plus a denormalized employee_name. In app/new-cycle.tsx:117-119,260-261 the employee picker renders only if employees exist and selection is never required, and there is no per-employee PIN or credential — anyone holding the shared phone-OTP session can record, edit or delete cycles under any (or no) operator name, and pdf-export.ts:125 prints that unverified name in the journal's signer column. The audit covered record editability but not the shared-login/attribution model.
- **[info] keycrm_webhook_events promises a 30-day retention sweep that was never scheduled; usage tables also grow unbounded** — `supabase/migrations/20260609000008_keycrm_webhook_events.sql`. The migration creates idx_keycrm_webhook_events_received_at with a comment 'a 30-day retention sweep can prune on received_at', but no cron job or function in the repo ever deletes from the table (the only writers are inserts in keycrm-order-webhook/index.ts:79). Likewise ai_chat_usage / keycrm_lookup_usage / keycrm_history_usage accumulate one row per user per day forever, cleared only on account deletion. Slow unbounded growth in service tables with no retention policy.
- **[info] No OTA update channel: expo-updates absent, so every hotfix requires a full App Store review cycle** — `app.json`. package.json has no expo-updates dependency and app.json defines no updates/runtimeVersion configuration. Combined with the audit's 'no production crash telemetry' finding, the team has neither visibility into field crashes nor a fast remediation path for the high-severity client bugs listed (duplicate orders, dead early-finish save) — notable given this app's history of App Store review rejections and resubmissions.

Оценка критика: The audit's eight dimensions were covered deeply and accurately; the misses cluster in the meta/process layer it never opened. I verified each candidate angle in code before reporting. Confirmed clean (no findings invented): git history — searched all 164 commits for service-role JWTs (base64 'InNlcnZpY2Vfcm9sZSI'), sk-ant keys and SMSFly/KeyCRM tokens, nothing leaked; docs/ADMIN-PANEL-PROMPT.md (explicitly flagged in .gitignore as containing credentials) was never committed; cron migrations correctly pull CRON_SECRET/service-role from Supabase Vault rather than embedding them; send-sms-hook verifies Standard Webhooks signatures and fails closed; lookup-keycrm-buyer and get-keycrm-history both enforce E.164 phone-match verification plus daily caps (good anti-enumeration design); ai-assistant has per-field input caps and role whitelisting (prompt-injection surface is acceptable for its grounded-instructions design); config.toml shows email signup disabled and sane token settings beyond the SMS gaps the audit already flagged; eas.json embeds only the public anon key, which is by design. The genuinely missed items: two medium server-side deletion-integrity gaps in delete-account (third-party PII never erased despite the 'all data deleted forever' promise, and silent partial deletion via unchecked errors plus the unpaginated 100-object storage list); and a band of low/info process findings — 20 npm-audit vulnerabilities frozen in place by a three-lockfile mess, zero CI for an otherwise decent test suite, floating esm.sh imports in every service-role edge function, a ~60 KB system prompt resent uncached on every AI call, the unauthenticated shared-login operator-attribution model for the regulatory journal, an unscheduled retention sweep, and no OTA/hotfix channel. None of these invalidate the audit's findings; they fill in the dependency, supply-chain, deletion-completeness and engineering-process blind spots.
