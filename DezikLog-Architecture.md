# Dezik Log — Архітектурний документ для Cursor
## MVP v0.1 | Expo React Native

---

## РОЛЬ

Ти — Senior React Native Developer. Ти реалізуєш мобільний додаток **Dezik Log** — журнал контролю стерилізації для nail-майстрів. Ти працюєш строго по цьому документу. Не придумуй — реалізуй по специфікації.

---

## 0. ЗАМКНУТИЙ ЦИКЛ (КЛЮЧОВА ЛОГІКА)

Весь додаток побудований як замкнута екосистема. Кожна дія майстра логічно веде до наступної і замикається на продукцію DEZIK:

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  СТЕРИЛІЗАЦІЯ                                       │
│  Майстер завантажує інструменти в стерилізатор      │
│         ↓                                           │
│  ЖУРНАЛ                                             │
│  Записує цикл в Dezik Log                           │
│  (1 пакет використано, розчин витрачається)          │
│         ↓                                           │
│  ТРЕКІНГ ВИТРАТ                                     │
│  Додаток автоматично рахує:                         │
│  - скільки пакетів використано за місяць             │
│  - скільки розчину витрачено                         │
│  - коли треба замовити нові матеріали                │
│         ↓                                           │
│  ПІДКАЗКА                                           │
│  "Ви використали ~150 пакетів. Замовити зі          │
│   знижкою 10%?" (SmartSuggestion на Home + Catalog) │
│         ↓                                           │
│  ПОКУПКА                                            │
│  Кнопка "Купити" → dezik.com.ua (UTM з додатку)     │
│         ↓                                           │
│  ОТРИМАННЯ МАТЕРІАЛІВ                               │
│  Нові пакети DEZIK, розчин Деланол                  │
│         ↓                                           │
│  СТЕРИЛІЗАЦІЯ (знову по колу)                       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Точки замикання:

**Журнал → Каталог:** Кожен завершений цикл = 1 використаний пакет. Після N циклів — банер "Час замовити пакети". В деталях запису (journal/[id]) — посилання "Потрібні нові пакети?" → каталог.

**Таймер → Інструкції:** На екрані таймера (поки чекає) — блок "Порада": коротка порада зі стерилізації (контент з фізичного журналу DEZIK). Внизу: "Більше порад → Каталог/Інструкції".

**Профіль → Нагадування → Журнал:** Нагадування "Час стерилізувати" → майстер відкриває додаток → новий цикл → журнал → трекінг витрат → покупка.

**Каталог → Стерилізація:** Після покупки (перехід на dezik.com.ua) — push через 3 дні: "Отримали замовлення? Не забудьте записати стерилізацію в журнал!"

**PDF → Бренд:** Кожен PDF-звіт має футер "Згенеровано в Dezik Log by DEZIK · dezik.com.ua". Інспектор бачить бренд DEZIK. Сарафанне радіо.

**Фізичний журнал → Додаток:** На обкладинці фізичного журналу DEZIK — QR-код → App Store/Google Play. Майстер, який купив журнал, завантажує додаток.

---

## 1. СТЕК

| Компонент | Технологія |
|---|---|
| Framework | Expo SDK 52+ (managed workflow) |
| Мова | TypeScript |
| Навігація | Expo Router (file-based routing) |
| UI / Стилі | NativeWind v4 (Tailwind CSS for React Native) |
| Локальна БД | expo-sqlite |
| Таймер/Push | expo-notifications (local notifications) |
| Камера | expo-image-picker |
| PDF | expo-print + expo-sharing |
| Іконки | lucide-react-native |
| Стейт | Zustand |
| Зберігання файлів | expo-file-system |

**НЕ ВИКОРИСТОВУЙ:** React Navigation (використовуй Expo Router), styled-components, Redux, AsyncStorage (використовуй expo-sqlite).

---

## 2. СТРУКТУРА ПРОЕКТУ

```
dezik-log/
├── app/                          # Expo Router pages
│   ├── _layout.tsx               # Root layout (tab navigation)
│   ├── (tabs)/                   # Tab group
│   │   ├── _layout.tsx           # Tab bar layout (5 tabs)
│   │   ├── index.tsx             # Головна (Home)
│   │   ├── journal.tsx           # Журнал стерилізації
│   │   ├── catalog.tsx           # Каталог DEZIK
│   │   └── profile.tsx           # Профіль
│   ├── new-cycle.tsx             # Новий цикл (modal)
│   ├── timer.tsx                 # Таймер (modal, fullscreen)
│   ├── complete-cycle.tsx        # Завершення циклу (modal)
│   ├── sterilizer/
│   │   ├── add.tsx               # Додати стерилізатор
│   │   └── [id].tsx              # Редагувати стерилізатор
│   ├── journal/
│   │   └── [id].tsx              # Деталі запису
│   └── catalog/
│       └── [id].tsx              # Деталі товару
├── components/
│   ├── ui/                       # Базові UI компоненти
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   ├── Select.tsx
│   │   ├── SegmentedControl.tsx
│   │   ├── Badge.tsx
│   │   └── EmptyState.tsx
│   ├── TimerRing.tsx             # Кругова шкала таймера (SVG)
│   ├── CycleCard.tsx             # Картка циклу в журналі
│   ├── StatsBlock.tsx            # Блок статистики (3 картки)
│   ├── ActiveTimerWidget.tsx     # Віджет активного таймера на Home
│   ├── CatalogItem.tsx           # Картка товару в каталозі
│   └── SmartSuggestion.tsx       # Банер "Час замовити?"
├── lib/
│   ├── db.ts                     # SQLite: init, migrations, queries
│   ├── store.ts                  # Zustand store
│   ├── notifications.ts          # Local push notifications
│   ├── pdf.ts                    # PDF generation
│   ├── types.ts                  # TypeScript types
│   └── constants.ts              # Кольори, режими, каталог
├── assets/
│   ├── images/                   # Іконки, лого DEZIK
│   └── catalog/                  # Фото товарів DEZIK (локальні)
└── data/
    └── catalog.json              # Статичний каталог DEZIK
```

---

## 3. КОЛЬОРИ ТА ДИЗАЙН

```typescript
// lib/constants.ts

export const COLORS = {
  primary: '#4b569e',        // DEZIK brand — основний
  primaryDark: '#363f75',    // Акцент, градієнти
  primaryLight: '#eceef5',   // Фон карток, тінт

  background: '#FFFFFF',     // Основний фон
  surface: '#F8F9FC',        // Фон під картками
  border: '#E5E7EB',         // Бордери

  text: '#1B1B1B',           // Основний текст
  textSecondary: '#6B7280',  // Вторинний текст
  textTertiary: '#9CA3AF',   // Плейсхолдери

  success: '#43A047',        // Індикатор спрацював
  error: '#E53935',          // Індикатор не спрацював
  warning: '#F9A825',        // Попередження

  white: '#FFFFFF',
};

export const STERILIZATION_MODES = {
  dry_heat: [
    { id: 'dh-180-60', temp: 180, duration: 60, label: '180°C / 60 хв' },
    { id: 'dh-160-150', temp: 160, duration: 150, label: '160°C / 150 хв' },
  ],
  autoclave: [
    { id: 'ac-134-5', temp: 134, duration: 5, label: '134°C / 5 хв' },
    { id: 'ac-121-20', temp: 121, duration: 20, label: '121°C / 20 хв' },
  ],
} as const;

// Поради для таймера (замикання на каталог)
export const STERILIZATION_TIPS = [
  { text: 'Використовуйте індикатори 5 класу для найточнішого контролю стерилізації', link: 'indicators' },
  { text: 'Розчин Деланолу зберігає активність до 14 діб. Не забувайте вчасно замінювати', link: 'delanol' },
  { text: 'Правильний розмір пакета: 60×100 для фрез, 75×150 для пушера, 100×200 для комбі-набору', link: 'kraft-packs' },
  { text: 'Біонол Форте має мийні властивості — два в одному: дезінфекція + очищення', link: 'bionol' },
  { text: 'Після стерилізації пакет зберігає стерильність до 55 днів', link: 'kraft-packs' },
  { text: 'Інструм очищує метал від нальоту та пригорілостей. Ідеально перед стерилізацією', link: 'instrum' },
  { text: 'Регулярне ТО стерилізатора — запорука коректної роботи та точних результатів', link: 'sterilizers' },
  { text: 'Деланол — єдиний засіб DEZIK зі спороцидною дією. Для холодної стерилізації', link: 'delanol' },
] as const;
```

**Шрифт:** Системний (SF Pro на iOS, Roboto на Android). НЕ підключай зовнішні шрифти.

**Стиль:** Чистий, мінімалістичний. Великі кнопки (h-14, мін 48px touch target). Rounded corners 14-16px. Card-based UI. Максимум 2 дії на екран.

**Візуальний референс:** Figma Make прототип (в zip-файлі). Дотримуйся структури та пропорцій з прототипу.

---

## 4. ТИПИ ДАНИХ

```typescript
// lib/types.ts

export type SterilizationType = 'dry_heat' | 'autoclave';
export type CycleStatus = 'running' | 'completed' | 'cancelled';
export type IndicatorResult = 'passed' | 'failed';

export interface Sterilizer {
  id: string;
  name: string;                    // "Microstop M2"
  type: SterilizationType;
  serialNumber?: string;
  photoUri?: string;
  maintenanceDate?: string;        // ISO date
  createdAt: string;               // ISO datetime
}

export interface Cycle {
  id: string;
  sterilizerId: string;
  sterilizationType: SterilizationType;
  temperature: number;             // °C
  durationMinutes: number;
  instruments?: string;            // "Кусачки, пушер, фрези"
  note?: string;
  indicatorPhotoUri?: string;      // Local file URI
  indicatorResult?: IndicatorResult;
  startedAt: string;               // ISO datetime
  completedAt?: string;            // ISO datetime
  status: CycleStatus;
  createdAt: string;
}

export interface UserProfile {
  name: string;
  salonName?: string;
  salonAddress?: string;
  salonLogoUri?: string;
  phone?: string;
  email?: string;
  language: 'uk' | 'ru';
  reminderEnabled: boolean;
  reminderIntervalHours: number;   // default: 2
}

export interface CatalogProduct {
  id: string;
  category: string;
  title: string;
  description: string;
  priceRange: string;
  imageUri: string;                // Local asset
  buyUrl: string;                  // dezik.com.ua URL with UTM
  icon: string;                    // Lucide icon name
}
```

---

## 5. ЛОКАЛЬНА БАЗА ДАНИХ (SQLite)

```typescript
// lib/db.ts

import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('deziklog.db');

export function initDatabase() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS sterilizers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('dry_heat', 'autoclave')),
      serial_number TEXT,
      photo_uri TEXT,
      maintenance_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cycles (
      id TEXT PRIMARY KEY,
      sterilizer_id TEXT NOT NULL REFERENCES sterilizers(id),
      sterilization_type TEXT NOT NULL,
      temperature INTEGER NOT NULL,
      duration_minutes INTEGER NOT NULL,
      instruments TEXT,
      note TEXT,
      indicator_photo_uri TEXT,
      indicator_result TEXT CHECK(indicator_result IN ('passed', 'failed')),
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'cancelled')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      name TEXT NOT NULL DEFAULT '',
      salon_name TEXT,
      salon_address TEXT,
      salon_logo_uri TEXT,
      phone TEXT,
      email TEXT,
      language TEXT NOT NULL DEFAULT 'uk',
      reminder_enabled INTEGER NOT NULL DEFAULT 1,
      reminder_interval_hours INTEGER NOT NULL DEFAULT 2
    );

    INSERT OR IGNORE INTO profile (id) VALUES (1);

    -- Трекінг витрат матеріалів
    CREATE TABLE IF NOT EXISTS consumption (
      id TEXT PRIMARY KEY,
      cycle_id TEXT REFERENCES cycles(id),
      item_type TEXT NOT NULL CHECK(item_type IN ('pack', 'solution')),
      item_name TEXT,                -- "Крафт-пакет 100x200" або "Деланол 2%"
      quantity INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

// QUERIES — приклади

export function getSterilizers(): Sterilizer[] {
  return db.getAllSync('SELECT * FROM sterilizers ORDER BY created_at DESC');
}

export function addSterilizer(s: Omit<Sterilizer, 'id' | 'createdAt'>): string {
  const id = generateId();
  db.runSync(
    'INSERT INTO sterilizers (id, name, type, serial_number, photo_uri, maintenance_date) VALUES (?, ?, ?, ?, ?, ?)',
    [id, s.name, s.type, s.serialNumber || null, s.photoUri || null, s.maintenanceDate || null]
  );
  return id;
}

export function getCycles(filters?: { period?: string; sterilizerId?: string }): Cycle[] {
  let query = 'SELECT * FROM cycles WHERE status != "cancelled"';
  const params: any[] = [];

  if (filters?.sterilizerId) {
    query += ' AND sterilizer_id = ?';
    params.push(filters.sterilizerId);
  }

  query += ' ORDER BY started_at DESC';
  return db.getAllSync(query, params);
}

export function getMonthlyStats(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = `${year}-${String(month + 1).padStart(2, '0')}-01`;

  return db.getFirstSync(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN indicator_result = 'passed' THEN 1 ELSE 0 END) as passed,
      SUM(CASE WHEN indicator_result = 'failed' THEN 1 ELSE 0 END) as failed
    FROM cycles
    WHERE status = 'completed'
    AND started_at >= ? AND started_at < ?
  `, [start, end]);
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// ТРЕКІНГ ВИТРАТ (замкнутий цикл)

export function addConsumption(cycleId: string, itemType: 'pack' | 'solution', itemName?: string) {
  const id = generateId();
  db.runSync(
    'INSERT INTO consumption (id, cycle_id, item_type, item_name) VALUES (?, ?, ?, ?)',
    [id, cycleId, itemType, itemName || null]
  );
}

export function getMonthlyConsumption(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = `${year}-${String(month + 1).padStart(2, '0')}-01`;

  return db.getFirstSync(`
    SELECT
      SUM(CASE WHEN item_type = 'pack' THEN quantity ELSE 0 END) as packs_used,
      SUM(CASE WHEN item_type = 'solution' THEN quantity ELSE 0 END) as solutions_used
    FROM consumption
    WHERE created_at >= ? AND created_at < ?
  `, [start, end]);
}

// Розумна підказка: чи потрібно замовити матеріали?
export function getSmartSuggestion(): { type: string; message: string; buyUrl: string } | null {
  const now = new Date();
  const stats = getMonthlyConsumption(now.getFullYear(), now.getMonth() + 1);

  if (stats && stats.packs_used >= 50) {
    return {
      type: 'packs',
      message: `Ви використали ~${stats.packs_used} пакетів цього місяця. Час замовити?`,
      buyUrl: 'https://dezik.com.ua/paketi-dlya-sterilizacii/?utm_source=deziklog&utm_medium=app&utm_campaign=smart_suggestion',
    };
  }
  return null;
}
```

---

## 6. ZUSTAND STORE

```typescript
// lib/store.ts

import { create } from 'zustand';

interface ActiveTimer {
  cycleId: string;
  sterilizerId: string;
  sterilizerName: string;
  temperature: number;
  durationMinutes: number;
  startedAt: string;
  instruments?: string;
}

interface AppStore {
  activeTimer: ActiveTimer | null;
  setActiveTimer: (timer: ActiveTimer | null) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  activeTimer: null,
  setActiveTimer: (timer) => set({ activeTimer: timer }),
}));
```

---

## 7. ЕКРАНИ — СПЕЦИФІКАЦІЯ

### 7.1. Tab Bar Layout (`app/(tabs)/_layout.tsx`)

5 вкладок:
| Вкладка | Іконка (lucide) | Підпис |
|---|---|---|
| Головна | `Home` | Головна |
| Журнал | `ClipboardList` | Журнал |
| (центр) | — | — |
| Каталог | `BookOpen` | Каталог |
| Профіль | `User` | Профіль |

Колір активної вкладки: `#4b569e`. Неактивна: `#9CA3AF`.

### 7.2. Головна (`app/(tabs)/index.tsx`)

Компоненти зверху вниз:
1. **Header:** "Привіт, [ім'я]!" + кнопка дзвіночка (заглушка)
2. **CTA кнопка:** "+Новий цикл стерилізації" — gradient primary → primaryDark. `router.push('/new-cycle')`
3. **ActiveTimerWidget:** Показується тільки якщо є activeTimer в store. Кругова шкала + назва стерилізатора + відлік. Натиск → `/timer`
4. **StatsBlock:** 3 картки в ряд — всього / успішних / невдалих за поточний місяць. Дані з `getMonthlyStats()`
5. **Останні записи:** 3 останні цикли як `CycleCard`. Посилання "Всі →" → tab Журнал
6. **SmartSuggestion:** Банер з getSmartSuggestion(). Показується тільки коли є підказка (>50 пакетів). Кнопка → dezik.com.ua з UTM. Це замикає Home на покупку.

### 7.3. Новий цикл (`app/new-cycle.tsx`) — modal

1. **Header:** "Новий цикл" + кнопка X (закрити)
2. **Стерилізатор:** Select з збережених. Якщо порожній — кнопка "Додати стерилізатор" → `/sterilizer/add`
3. **Тип:** SegmentedControl — Сухожар / Автоклав. Автозаповнення з обраного стерилізатора
4. **Режим:** Картки з `STERILIZATION_MODES`. Selected = border primary + checkmark. + "Свій режим" (dashed border) → ручне введення temp + time
5. **Інструменти:** TextInput, placeholder "Кусачки, пушер, фрези...", необов'язково
6. **Кнопка "Старт":** Створює запис в cycles (status: running), встановлює activeTimer в store, schedule local notification на час завершення, `router.replace('/timer')`

### 7.4. Таймер (`app/timer.tsx`) — modal, fullscreen

1. **Header:** "Стерилізація" + кнопка X
2. **TimerRing:** SVG кругова шкала 220x220. Stroke: primary. Відлік великими цифрами (48px font, tabular-nums)
3. **Інфо-картка:** Температура, час, стерилізатор, інструменти
4. **Кнопки:** "Скасувати" (outlined error) + "Завершити" (disabled поки таймер > 0, потім — primary)
5. **Background timer:** useEffect з setInterval. При завершенні — local push notification
6. **Порада (поки чекає):** Під інфо-карткою — блок "Порада" з випадковою порадою зі стерилізації (масив в constants.ts). Змінюється кожні 30 сек. Внизу поради: "Більше порад → Матеріали" → tab Каталог. Це замикає таймер на каталог.

**КРИТИЧНО:** Таймер має працювати коли додаток у фоні. Використовуй expo-notifications для scheduled notification на точний час завершення. В додатку показуй різницю між `now` та `startedAt + durationMinutes`.

### 7.5. Завершення циклу (`app/complete-cycle.tsx`) — modal

1. **Header:** "Результат" + кнопка X
2. **Фото індикатора:** Велика область з іконкою камери + dashed border. Натиск → expo-image-picker (камера або галерея). Після вибору — показати прев'ю
3. **Результат:** 2 великі кнопки — "Спрацював" (зелений фон, ✓) / "Не спрацював" (білий фон, ✕). Обов'язковий вибір
4. **Дата/час:** Автозаповнення (now). Можна редагувати
5. **Примітка:** TextInput, необов'язково
6. **"Зберегти":** Оновлює cycle в БД (status: completed, indicator_result, indicator_photo_uri, completed_at). **Додає запис в consumption (1 пакет використано).** Скидає activeTimer. `router.replace('/')`

**Якщо "Не спрацював"** — Alert: "Увага! Інструменти потребують повторної стерилізації."

**Після збереження — success screen з 2 кнопками:**
- "На головну" → `/`
- "Потрібні матеріали?" → `/catalog` (замикання циклу на каталог)

### 7.6. Журнал (`app/(tabs)/journal.tsx`)

1. **Header:** "Журнал" + кнопка "PDF" (справа)
2. **Фільтр періоду:** Горизонтальний ScrollView — Тиждень / Місяць / Квартал / Рік / Все. Default: Місяць
3. **Фільтр стерилізатора:** Select — "Всі" + список збережених
4. **Лічильник:** "42 записи за березень 2026"
5. **FlatList:** Картки CycleCard. Кожна: дата, час, режим, стерилізатор, статус. Натиск → `/journal/[id]`
6. **PDF кнопка:** Генерує PDF через `lib/pdf.ts` → expo-sharing
7. **Деталі запису (journal/[id]):** Повне фото індикатора, всі параметри, стерилізатор, примітка. Внизу — блок "Потрібні матеріали?" з посиланнями на відповідні товари в каталозі (пакети, розчин). Замикання журналу на каталог.

### 7.7. Каталог (`app/(tabs)/catalog.tsx`)

1. **Header:** "Матеріали"
2. **FlatList:** Картки CatalogItem — іконка (lucide), назва, опис, ціна. Натиск → `/catalog/[id]`
3. **SmartSuggestion:** Банер знизу — "Ви використали ~X пакетів. Час замовити?" Кнопка → Linking.openURL(dezik.com.ua + UTM)

**Дані каталогу — з `data/catalog.json` (статичний).**

**Замикання каталогу на стерилізацію:** В деталях кожного товару (catalog/[id]) — кнопка "Записати стерилізацію" → `/new-cycle`. Майстер купив матеріали → повертається в додаток → записує цикл.

### 7.8. Профіль (`app/(tabs)/profile.tsx`)

1. Аватар-заглушка
2. Поля: ім'я, назва салону, адреса, телефон, email
3. Логотип салону (image picker)
4. Нагадування: Switch + Select інтервалу
5. Мова: Українська / Російська (заглушка для MVP)
6. "Видалити всі дані" (знизу, маленька)

---

## 8. PDF ГЕНЕРАЦІЯ

```typescript
// lib/pdf.ts

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export async function generateSterilizationPDF(
  cycles: Cycle[],
  profile: UserProfile,
  period: string
) {
  const html = `
    <html>
    <head>
      <style>
        body { font-family: -apple-system, sans-serif; padding: 40px; color: #1b1b1b; }
        h1 { color: #4b569e; font-size: 22px; }
        .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
        .salon-name { font-size: 18px; font-weight: 700; }
        .period { color: #6b7280; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { background: #eceef5; color: #4b569e; padding: 8px; text-align: left; font-size: 11px; }
        td { padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
        .passed { color: #43A047; }
        .failed { color: #E53935; }
        .footer { margin-top: 40px; color: #9ca3af; font-size: 10px; text-align: center; }
        .signature { margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 15px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="salon-name">${profile.salonName || 'Dezik Log'}</div>
          <div style="color: #6b7280; font-size: 12px;">${profile.salonAddress || ''}</div>
        </div>
      </div>
      <h1>Журнал контролю стерилізації</h1>
      <div class="period">${period}</div>
      <table>
        <tr>
          <th>№</th>
          <th>Дата</th>
          <th>Час</th>
          <th>Стерилізатор</th>
          <th>Режим</th>
          <th>Інструменти</th>
          <th>Результат</th>
        </tr>
        ${cycles.map((c, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${formatDate(c.startedAt)}</td>
            <td>${formatTime(c.startedAt)}</td>
            <td>${c.sterilizerName || ''}</td>
            <td>${c.temperature}°C / ${c.durationMinutes} хв</td>
            <td>${c.instruments || '—'}</td>
            <td class="${c.indicatorResult}">${c.indicatorResult === 'passed' ? 'Спрацював' : 'Не спрацював'}</td>
          </tr>
        `).join('')}
      </table>
      <div class="signature">
        <p>Відповідальна особа: ${profile.name || '_______________'}</p>
      </div>
      <div class="footer">Згенеровано в Dezik Log by DEZIK · dezik.com.ua</div>
    </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
}
```

---

## 9. LOCAL NOTIFICATIONS

```typescript
// lib/notifications.ts

import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function scheduleTimerNotification(durationMinutes: number) {
  await Notifications.requestPermissionsAsync();

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Стерилізація завершена!',
      body: 'Час дістати інструменти',
      sound: true,
    },
    trigger: {
      type: 'timeInterval',
      seconds: durationMinutes * 60,
      repeats: false,
    },
  });

  return id;
}

export async function cancelNotification(id: string) {
  await Notifications.cancelScheduledNotificationAsync(id);
}
```

---

## 10. КАТАЛОГ (СТАТИЧНИЙ)

```json
// data/catalog.json
[
  {
    "id": "kraft-packs",
    "category": "Крафт-пакети",
    "title": "Пакети для стерилізації",
    "description": "4 розміри: 60×100, 75×150, 100×200 мм. Білі та прозорі. З індикатором для парової та повітряної стерилізації.",
    "priceRange": "від 155 грн / 100 шт",
    "icon": "Package",
    "buyUrl": "https://dezik.com.ua/paketi-dlya-sterilizacii/?utm_source=deziklog&utm_medium=app&utm_campaign=catalog"
  },
  {
    "id": "delanol",
    "category": "Дезінфекція",
    "title": "Деланол",
    "description": "Засіб для дезінфекції, ПСО та холодної стерилізації інструментів. Свідоцтво МОЗ.",
    "priceRange": "від 405 грн / 1л",
    "icon": "Droplets",
    "buyUrl": "https://dezik.com.ua/dezinfekciya-antiseptiki/?utm_source=deziklog&utm_medium=app&utm_campaign=catalog"
  },
  {
    "id": "bionol",
    "category": "Дезінфекція",
    "title": "Біонол Форте",
    "description": "Засіб для дезінфекції інструментів та ПСО. Мийні властивості, пролонгована дія 3 год.",
    "priceRange": "від 290 грн / 250мл",
    "icon": "FlaskConical",
    "buyUrl": "https://dezik.com.ua/dezinfekciya-antiseptiki/?utm_source=deziklog&utm_medium=app&utm_campaign=catalog"
  },
  {
    "id": "instrum",
    "category": "Очищення",
    "title": "Інструм",
    "description": "Засіб преміум-класу для очищення металевих інструментів від потемнінь, нальоту та пригорілостей.",
    "priceRange": "від 185 грн",
    "icon": "Wrench",
    "buyUrl": "https://dezik.com.ua/?utm_source=deziklog&utm_medium=app&utm_campaign=catalog"
  },
  {
    "id": "sterilizers",
    "category": "Обладнання",
    "title": "Стерилізатори",
    "description": "Сухожари Міз-Ма ГП-10, ГП-20. Компактні, надійні. Для фізичної стерилізації.",
    "priceRange": "від 13 850 грн",
    "icon": "Thermometer",
    "buyUrl": "https://dezik.com.ua/sterilizatori/?utm_source=deziklog&utm_medium=app&utm_campaign=catalog"
  },
  {
    "id": "septonal",
    "category": "Антисептики",
    "title": "Септонал",
    "description": "Антисептик для обробки рук та шкіри.",
    "priceRange": "",
    "icon": "Hand",
    "buyUrl": "https://dezik.com.ua/?utm_source=deziklog&utm_medium=app&utm_campaign=catalog"
  }
]
```

---

## 11. ПРАВИЛА ДЛЯ CURSOR

1. **Не придумуй** — реалізуй строго по цьому документу
2. **Мова інтерфейсу** — українська. Всі тексти, кнопки, підписи — українською
3. **Колір #4b569e** — використовуй через COLORS constant, не хардкодь
4. **NativeWind** — стилізація через className, не StyleSheet.create
5. **Expo Router** — file-based routing, не React Navigation напряму
6. **expo-sqlite** — синхронний API (openDatabaseSync, execSync, getAllSync, runSync)
7. **Фото** — зберігай у expo-file-system, в БД тільки URI
8. **Таймер** — розраховуй залишок від startedAt + duration, не від стейту
9. **Іконки** — тільки lucide-react-native. Без емодзі
10. **Tab bar** — підписи українською: Головна, Журнал, Каталог, Профіль
11. **PDF** — генерація через HTML шаблон + expo-print
12. **Safe Area** — SafeAreaView на всіх екранах
13. **Haptic feedback** — expo-haptics на кнопках "Старт", "Зберегти"
14. **Градієнт** — expo-linear-gradient для CTA кнопки
15. **Максимум 2 дії на екран** — не перевантажуй UI
16. **Замкнутий цикл** — кожен екран має точку переходу до іншого модуля: журнал → каталог, таймер → поради → каталог, завершення циклу → каталог, каталог → новий цикл. Не створюй тупикових екранів
