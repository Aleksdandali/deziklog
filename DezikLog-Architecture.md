# Dezik SteriLog — Архітектурний документ

## Production · Expo SDK 55 · React Native · Supabase

> Цей документ описує **реальну** архітектуру застосунку станом на поточну гілку.
> Він замінив застарілий MVP-документ (expo-sqlite / Zustand / статичний каталог),
> який описував інший, нереалізований застосунок. Якщо код і документ розходяться —
> джерело правди це код; онови документ.

---

## 0. Що це і для кого

**Dezik SteriLog** — мобільний застосунок для nail/beauty-майстрів України, що поєднує:

1. **Журнал контролю стерилізації** — облік циклів стерилізації з фото індикатора (до/після), таймером витримки та експортом у PDF за **формою №257/о** (наказ МОЗ), готовою до перевірки.
2. **Магазин розхідників DEZIK** — каталог, кошик, оформлення з доставкою Нова Пошта, синхронізація замовлень із KeyCRM.

Стратегія: володіти щоденним робочим процесом майстра (логування стерилізації), а потім монетизувати попит на розхідники, який цей процес породжує.

### Замкнутий цикл (цільова філософія)

```
Стерилізація → Журнал (1 пакет/розчин витрачено) → Трекінг витрат
   → Підказка дозамовити → Покупка → Нові матеріали → Стерилізація…
```

Точки замикання, що **реалізовані**: PDF-звіт із брендом DEZIK; Instagram-Stories шеринг успішного циклу (`lib/share-instagram.ts`); калькулятор/AI-асистент по розчинах, що тягне майстра назад між циклами.

Точка, яку варто **повернути** (наразі відсутня): автоматичний трекінг споживання → таймчасна підказка дозамовлення (`SmartSuggestion`). Журнал уже генерує сигнал споживання, але магазин його ще не використовує — дві половини стоять поруч, а не живлять одна одну. Це найвищий за важелем продуктовий пункт беклогу.

---

## 1. Стек (реальний)

| Компонент | Технологія |
|---|---|
| Framework | Expo SDK ~55 (managed), React 19 / RN 0.8x, New Architecture |
| Мова | TypeScript (strict) |
| Навігація | **expo-router** (file-based) |
| Бекенд | **Supabase** — Auth + Postgres (RLS) + Storage + Edge Functions (Deno) |
| Стан | **React Context** (`auth-context`, `cart-context`) — **без Redux/Zustand** |
| Локальне сховище | **AsyncStorage** (сесія Supabase, активний таймер, легкий кеш) |
| Стилі | **React Native StyleSheet** + токени з `lib/constants.ts` — **без NativeWind** |
| Шрифт | Inter (`@expo-google-fonts/inter`) через обгортку `components/AppText` |
| Графіка/анімація | react-native-svg, reanimated, lottie, expo-linear-gradient |
| Іконки | lucide-react-native (таб-бар), @expo/vector-icons (Feather) |
| Камера/медіа | expo-camera, expo-image-picker, expo-image, expo-media-library |
| PDF/шеринг | expo-print, expo-sharing, react-native-view-shot, react-native-share |
| Push | expo-notifications (локальні + через Supabase-вебхуки) |

> Чого **немає** (всупереч старому документу): `expo-sqlite`, `zustand`, `nativewind`, `lib/db.ts`, `lib/store.ts`, `data/catalog.json`.

---

## 2. Структура проєкту (маршрути)

```
app/
├── _layout.tsx              # Root: завантаження шрифтів, auth-гейт, Stack
├── auth.tsx                 # Вхід (телефон/email OTP)
├── onboarding.tsx           # Онбординг / заповнення профілю
├── new-cycle.tsx            # Створення циклу стерилізації
├── timer.tsx                # Активний таймер (рахунок ВГОРУ, cap 60 хв)
├── complete-cycle.tsx       # Завершення циклу (фото ПІСЛЯ, результат)
├── cart.tsx                 # Кошик / оформлення (НП, профіль-префіл)
├── ai-chat.tsx              # AI-асистент по розчинах (Claude)
├── orders.tsx               # Історія замовлень (native + legacy KeyCRM)
├── (tabs)/
│   ├── _layout.tsx          # Таб-бар (5 вкладок)
│   ├── index.tsx            # Головна
│   ├── journal.tsx          # Журнал стерилізації
│   ├── catalog.tsx          # Магазин
│   ├── solutions.tsx        # Розчини (калькулятор/трекінг)
│   └── profile.tsx          # Кабінет
├── cycle/[id].tsx           # Деталі циклу (+ шеринг, PDF)
├── cabinet/                 # employees · instruments · solutions · sterilizers
├── solution/                # add · [id]
├── product/[id].tsx         # Деталі товару
├── order/[id].tsx           # Деталі замовлення
├── guide/[id].tsx           # Інструкція/гайд
└── legal/privacy.tsx        # Політика конфіденційності
```

Вкладки (`app/(tabs)/_layout.tsx`): **Головна · Журнал · Магазин · Розчини · Кабінет**.

---

## 3. Дизайн-система

**Єдине джерело токенів — `lib/constants.ts`.** `lib/theme.ts` — лише legacy-аліаси (`RADII`→`RADIUS`, `SHADOWS`→`SHADOW`), щоб старі імпорти резолвилися. Нові екрани імпортують з `constants`.

- `COLORS` — бренд (`brand #4b569e`, `brandDark`, `brandLight`), текст, поверхні, статуси (`success/danger/warning` + `*Bg`).
- `RADIUS` — `sm:8 md:12 lg:14 xl:20 full:999 pill:40` (єдина шкала; `RADII` = аліас).
- `SHADOW` — `sm/md` (за розміром) + `card/button` (семантичні); `SHADOWS` = аліас.
- `SPACING` — `4/8/16/24/32/48`.
- `FONT` — `extralight/light/regular/medium/semibold/bold/extrabold` → відповідні `Inter_*` фейси.

### Шрифт (важливо)

Inter завантажується у `app/_layout.tsx` як **окремі статичні фейси** (200…800). RN **ігнорує `fontWeight`**, коли задано іменований фейс, тому:

- **Не імпортуй `Text`/`TextInput` напряму з `react-native`.** Використовуй обгортки:
  ```ts
  import { AppText as Text, AppTextInput as TextInput } from '<rel>/components/AppText';
  ```
- `components/AppText.tsx` читає `fontWeight` і підставляє потрібний Inter-фейс через `lib/fonts.ts` (`fontFamilyForWeight`). Явно заданий `fontFamily` (включно з `monospace`) — зберігається.
- Краєві випадки (`Animated.Text`, `tabBarLabelStyle`, `headerTitleStyle`) обгорткою не покриваються — став `fontFamily: FONT.*` напряму.

---

## 4. Дані: типи, API-шар, контексти

**`lib/types.ts`** — інтерфейси, що віддзеркалюють схему БД: `Profile` (вкл. `keycrm_buyer_id`, `expo_push_token`, `delivery_type: 'warehouse'|'address'`, `salon_name`, `city`), `Instrument`, `Sterilizer`, `Employee`, `Solution`, `Order`/`OrderItem`, `Product`/`ProductCategory`, `KeyCRMHistoryOrder`.

**`lib/api.ts`** — репозиторій-шар над Supabase (профілі, інструменти, стерилізатори, працівники, розчини, сесії стерилізації, замовлення, товари). Тут живе виважена «бойова» логіка:
- завантаження фото з ретраями та експоненційним backoff;
- компенсуючий delete, щоб не лишати «осиротілих» замовлень;
- **ціна/сума — авторитетні на сервері** (тригери БД; клієнтські значення ігноруються);
- **атомарне завершення циклу** через `updateSession(..., { expectedStatus: 'in_progress' })` + `SessionConflictError`.

> Конвенція: нові екрани мають ходити в БД **через `api.ts`**, а не робити `supabase.from(...)` напряму. Історично частина екранів порушує це — не множ борг.

**Жива таблиця сесій — `sterilization_sessions`** (інтерфейс `SterilizationSession` в `api.ts`, статуси `draft|in_progress|completed|failed|canceled`). Legacy-тип `SterilizationCycle` в `types.ts` лишився лише для маппінгу в PDF-генератор.

**Контексти:** `lib/auth-context.tsx` (стан авторизації — акуратний автомат Supabase-подій: окремо `INITIAL_SESSION`/`TOKEN_REFRESHED`/`SIGNED_OUT`, 5s-таймаут ініціалізації, refresh на foreground), `lib/cart-context.tsx` (кошик із персистом в AsyncStorage).

**Інше в `lib/`:** `supabase.ts` (клієнт + персист сесії), `cache.ts` (легкий кеш-шар), `formatters.ts`, `notifications.ts`, `pdf-export.ts` (форма №257/о), `steri-config.ts` (доменна логіка), `solutions-ai.ts`/`solution-utils.ts`, `guides-data.ts`, `share-instagram.ts`, `fonts.ts`.

---

## 5. Бекенд: Supabase Edge Functions + інтеграції

`supabase/functions/*` (Deno; кожна user-facing функція робить `auth.getUser()`, секрети лише в `Deno.env`, помилки — узагальнені для клієнта, деталі в лог):

| Функція | Призначення |
|---|---|
| `ai-assistant` | AI-асистент по розчинах (Claude API), денний ліміт + кепи на розмір вводу |
| `send-sms-hook` | Auth-hook: OTP через SMSFly (Standard Webhooks підпис) |
| `nova-poshta-proxy` | Проксі до API Нова Пошта (міста/відділення) |
| `create-np-ttn` | Створення ТТН Нова Пошта для замовлення |
| `sync-order-to-keycrm` | Синк замовлення в KeyCRM + запуск доставки |
| `keycrm-order-webhook` | Вебхук нових замовлень із KeyCRM |
| `poll-keycrm-statuses` | Cron: статуси замовлень із KeyCRM (~5 хв) |
| `sync-keycrm-stock` | Cron: синк залишків товарів (~5 год) |
| `sync-products-to-keycrm` | Синк каталогу товарів у KeyCRM |
| `retry-failed-syncs` | Cron: ретрай невдалих синків |
| `lookup-keycrm-buyer` | Пошук покупця KeyCRM за телефоном (legacy-замовлення) |
| `get-keycrm-history` | Історія legacy-замовлень користувача з KeyCRM |
| `refresh-stock` / `restore-product-images` | Ручний рефреш залишків / відновлення зображень |
| `notify-cycle-idle` | Нотифікація простою активного циклу |
| `delete-account` | Видалення акаунту + каскад даних |
| `_shared/` | Спільні модулі: CORS, auth, KeyCRM, SMS, push, `sync-logic` |

**Інтеграції:** Supabase (Auth/Postgres/Storage/Functions), KeyCRM (CRM + фулфілмент), Нова Пошта (доставка), Anthropic Claude (AI), SMSFly (OTP), Expo Push.

**Безпека (стан вище середнього):** RLS на всіх user-таблицях зі `auth.uid() = user_id`; серверно-керовані колонки (`price`, `total`, `status`, `role`, `keycrm_*`) під column-level REVOKE; тригери перерахунку ціни/суми закривають клас «маніпуляція ціною»; per-user денні ліміти на зовнішньо-платні ендпоінти; приватний bucket `cycle-photos` з per-user storage RLS і доступом лише за signed-URL. Міграції в `supabase/migrations/` читаються як лог аудиторської ремедіації.

---

## 6. Доменна логіка стерилізації

`lib/steri-config.ts` — чисті функції: пресети режимів, маппінг крафт-пакетів, мінімальний час витримки, статус тривалості.

**Ключове продуктове рішення (інтегритет):** `complete-cycle.tsx` **жорстко блокує** позначення циклу «успішним», якщо він тривав менше мінімального часу витримки обраного режиму (заблокована опція + пояснення + окремий шлях «повторити» без фото ПІСЛЯ). Застосунок фізично не дає сертифікувати небезпечний цикл — саме на цьому тримається довіра до PDF-журналу.

**Таймер** (`timer.tsx`) рахує **вгору** (минув час), з жорстким cap 60 хв (захист від перегріву). «Мінімум досягнуто» ≠ «завершено»: майстер ще має відкрити завершення. Домашній віджет (`components/ActiveTimerWidget.tsx`) дзеркалить цю саму модель.

---

## 7. Принципи розробки

- **UX: максимум 2 ключові дії на екран** (зберігаємо як ціль; `new-cycle` — відомий виняток, кандидат на крокову декомпозицію).
- **Дані — через `api.ts`-шар**, не `supabase.from(...)` напряму в екранах.
- **Сервер — авторитет** для цін/сум/статусів; клієнт не виграє навіть у RLS-дозволеному UPDATE.
- **Стилі — через токени `constants.ts`**; текст — лише через `AppText`/`AppTextInput`.
- **Стан — React Context + локальний стан**, без Redux/Zustand. Серверних даних-лібрі (react-query) поки немає — кожен список робить власний cache-first → focus-refresh; кандидат на спільну абстракцію.
- expo-router (file-based), safe-area скрізь, `ErrorBoundary` навколо дерева.

---

## 8. Відомий технічний борг (стисло)

- **Шар `api.ts` обходиться** частиною екранів (прямі `supabase.from`) — дублювання запитів.
- **Немає серверного стейт-шару** — повторювана логіка завантаження/кешу по екранах.
- **Тести проти копій** — частина suites тестують переписану вручну логіку, а не реальний код (особливо критично для pass/fail стерилізації та auth).
- **Великі екрани** (`profile`, `cart`, `ai-chat`, `new-cycle`) змішують дані/логіку/презентацію.
- **Замовлення лишаються клієнт-редагованими після синку** в KeyCRM (розходження БД ↔ фулфілмент).

Деталі — у звіті аудиту (6 ревʼюерів). Пріоритезувати за важелем: повернути петлю дозамовлення (#5), реальні тести на compliance-шлях, транзакційне створення замовлення.
