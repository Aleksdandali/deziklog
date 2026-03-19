// ── Types ────────────────────────────────────────────────

export type SteriType = 'dry_heat' | 'autoclave';

export interface SteriPreset {
  id: string;
  label: string;
  sublabel: string;
  temperature: number;
  duration: number;
  type: SteriType;
  recommended?: boolean;
  description?: string;
}

export interface PouchSize {
  id: string;
  label: string;           // "75×150 мм"
  width_mm: number;
  height_mm: number;
  product_id: string | null; // linked Supabase product id (null = fallback)
}

// ── Sterilization Presets ────────────────────────────────

export const STERI_PRESETS: SteriPreset[] = [
  {
    id: 'dry_heat_180',
    label: 'Сухожар',
    sublabel: '180°C · 60 хв',
    temperature: 180,
    duration: 60,
    type: 'dry_heat',
    recommended: true,
    description: 'Рекомендований режим для крафт-пакетів Dezik та металевих інструментів',
  },
  {
    id: 'autoclave_134',
    label: 'Автоклав',
    sublabel: '134°C · 5 хв',
    temperature: 134,
    duration: 5,
    type: 'autoclave',
    recommended: true,
    description: 'Швидкий режим для автоклава при підвищеному тиску',
  },
  {
    id: 'autoclave_121',
    label: 'Автоклав',
    sublabel: '121°C · 20 хв',
    temperature: 121,
    duration: 20,
    type: 'autoclave',
    description: 'Стандартний режим автоклавування',
  },
];

// ── Pouch Sizes (fallback) ──────────────────────────────

export const FALLBACK_POUCH_SIZES: PouchSize[] = [
  { id: 'pouch_60x100',  label: '60×100 мм',  width_mm: 60,  height_mm: 100, product_id: null },
  { id: 'pouch_75x150',  label: '75×150 мм',  width_mm: 75,  height_mm: 150, product_id: null },
  { id: 'pouch_100x200', label: '100×200 мм', width_mm: 100, height_mm: 200, product_id: null },
];

/** No-pouch option for autoclave */
export const NO_POUCH_OPTION: PouchSize = {
  id: 'no_pouch',
  label: 'Без пакета',
  width_mm: 0,
  height_mm: 0,
  product_id: null,
};

// ── Instrument → Recommended Pouch ──────────────────────

/**
 * Maps instrument name patterns to a recommended pouch size id.
 * Uses case-insensitive substring matching.
 */
export const INSTRUMENT_POUCH_MAP: { pattern: string; pouchId: string; note: string }[] = [
  { pattern: 'сталекс 11',  pouchId: 'pouch_75x150',  note: 'Рекомендовано: 75×150 мм (підходить для Сталекс 11)' },
  { pattern: 'сталекс 15',  pouchId: 'pouch_75x150',  note: 'Рекомендовано: 75×150 мм (підходить для Сталекс 15)' },
  { pattern: 'кусачки',     pouchId: 'pouch_75x150',  note: 'Рекомендовано: 75×150 мм' },
  { pattern: 'пушер',       pouchId: 'pouch_75x150',  note: 'Рекомендовано: 75×150 мм' },
  { pattern: 'ножиці',      pouchId: 'pouch_100x200', note: 'Рекомендовано: 100×200 мм' },
  { pattern: 'фрези',       pouchId: 'pouch_60x100',  note: 'Рекомендовано: 60×100 мм (підходить для фрез)' },
  { pattern: 'пінцет',      pouchId: 'pouch_75x150',  note: 'Рекомендовано: 75×150 мм' },
];

// ── Helper functions ────────────────────────────────────

/** Get default preset for a sterilizer type */
export function getDefaultPreset(sterilizerType: SteriType | null): SteriPreset | undefined {
  if (!sterilizerType) return STERI_PRESETS.find((p) => p.recommended);
  return STERI_PRESETS.find((p) => p.type === sterilizerType && p.recommended)
    ?? STERI_PRESETS.find((p) => p.type === sterilizerType);
}

/** Get presets filtered by sterilizer type */
export function getPresetsForType(sterilizerType: SteriType | null): SteriPreset[] {
  if (!sterilizerType) return STERI_PRESETS;
  return STERI_PRESETS.filter((p) => p.type === sterilizerType);
}

/** Find best recommended pouch based on selected instruments */
export function getRecommendedPouch(instrumentNames: string[]): { pouchId: string; note: string } | null {
  for (const name of instrumentNames) {
    const lower = name.toLowerCase();
    const match = INSTRUMENT_POUCH_MAP.find((m) => lower.includes(m.pattern));
    if (match) return { pouchId: match.pouchId, note: match.note };
  }
  return null;
}

/** Whether this preset type requires pouches (dry_heat always needs, autoclave optional) */
export function presetRequiresPouch(type: SteriType): boolean {
  return type === 'dry_heat';
}

// ── Duration helpers ────────────────────────────────────

/**
 * Get recommended minimum duration for a cycle based on stored duration_minutes.
 * duration_minutes in DB = recommended duration at session creation time.
 */
export function getRecommendedMinutes(durationMinutes: number | null): number {
  return durationMinutes ?? 60;
}

/**
 * Calculate actual elapsed minutes between two ISO timestamps.
 * Returns null if either timestamp is missing.
 */
export function calcActualMinutes(startedAt: string | null, endedAt: string | null): number | null {
  if (!startedAt || !endedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (isNaN(start) || isNaN(end)) return null;
  return Math.round((end - start) / 60000);
}

/**
 * Duration sufficiency status for a completed cycle.
 */
export type DurationStatus = 'sufficient' | 'insufficient';

/**
 * Determine if actual cycle duration meets the recommended minimum.
 */
export function getDurationStatus(actualMinutes: number, recommendedMinutes: number): DurationStatus {
  return actualMinutes >= recommendedMinutes ? 'sufficient' : 'insufficient';
}

/**
 * Format elapsed seconds as MM:SS for the live timer display.
 */
export function formatElapsed(elapsedSeconds: number): { minutes: string; seconds: string } {
  const m = Math.floor(elapsedSeconds / 60);
  const s = elapsedSeconds % 60;
  return {
    minutes: String(m).padStart(2, '0'),
    seconds: String(s).padStart(2, '0'),
  };
}

// ── Supabase API: load pouch sizes from products ────────

/** Parse size "NNxMM" or "NN×MM" from product name */
function parseSizeFromName(name: string): { width: number; height: number } | null {
  const match = name.match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (!match) return null;
  return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
}

/**
 * Fetch Dezik pouch products from Supabase.
 * Falls back to FALLBACK_POUCH_SIZES if fetch fails or returns empty.
 */
export async function fetchPouchSizes(): Promise<PouchSize[]> {
  try {
    const { supabase } = await import('./supabase');
    // products table has category relation; filter by category name containing "Пакети"
    const { data, error } = await supabase
      .from('products')
      .select('id, name, category:product_categories!inner(name)')
      .ilike('product_categories.name', '%пакет%')
      .eq('in_stock', true)
      .order('sort_order');

    if (error || !data || data.length === 0) {
      return FALLBACK_POUCH_SIZES;
    }

    const sizes: PouchSize[] = data
      .map((p: any) => {
        const parsed = parseSizeFromName(p.name);
        if (!parsed) return null;
        return {
          id: `pouch_${parsed.width}x${parsed.height}`,
          label: `${parsed.width}×${parsed.height} мм`,
          width_mm: parsed.width,
          height_mm: parsed.height,
          product_id: p.id,
        };
      })
      .filter((s: PouchSize | null): s is PouchSize => s !== null);

    return sizes.length > 0 ? sizes : FALLBACK_POUCH_SIZES;
  } catch {
    return FALLBACK_POUCH_SIZES;
  }
}
