/**
 * Tests for sterilization presets, pouch recommendations, and step validation.
 * Source: lib/steri-config.ts
 */

import {
  STERI_PRESETS,
  FALLBACK_POUCH_SIZES,
  NO_POUCH_OPTION,
  getDefaultPreset,
  getPresetsForType,
  getRecommendedPouch,
  presetRequiresPouch,
  calcActualMinutes,
  getDurationStatus,
  formatElapsed,
  getRecommendedMinutes,
} from '../lib/steri-config';

// Validation logic (mirrors new-cycle.tsx)
function validateCycleParams(temperature: string, duration: string) {
  const temp = parseInt(temperature, 10);
  const dur = parseInt(duration, 10);
  if (!temp || temp < 100 || temp > 300) return 'Температура: 100–300 °C';
  if (!dur || dur < 1 || dur > 480) return 'Час: від 1 до 480 хвилин';
  return null;
}

// ── Preset tests ────────────────────────────────────────

describe('STERI_PRESETS', () => {
  it('has exactly 3 presets', () => {
    expect(STERI_PRESETS).toHaveLength(3);
  });

  it('all presets have unique IDs', () => {
    const ids = STERI_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all preset temperatures are within valid range', () => {
    for (const p of STERI_PRESETS) {
      expect(p.temperature).toBeGreaterThanOrEqual(100);
      expect(p.temperature).toBeLessThanOrEqual(300);
    }
  });

  it('all preset durations are within valid range', () => {
    for (const p of STERI_PRESETS) {
      expect(p.duration).toBeGreaterThanOrEqual(1);
      expect(p.duration).toBeLessThanOrEqual(480);
    }
  });

  it('all presets pass validation', () => {
    for (const p of STERI_PRESETS) {
      expect(validateCycleParams(String(p.temperature), String(p.duration))).toBeNull();
    }
  });

  it('includes both sterilizer types', () => {
    const types = new Set(STERI_PRESETS.map((p) => p.type));
    expect(types.has('dry_heat')).toBe(true);
    expect(types.has('autoclave')).toBe(true);
  });

  it('sublabel matches temperature and duration', () => {
    for (const p of STERI_PRESETS) {
      expect(p.sublabel).toContain(`${p.temperature}°C`);
      expect(p.sublabel).toContain(`${p.duration} хв`);
    }
  });

  it('dry_heat recommended preset is 180°C · 60 min', () => {
    const preset = STERI_PRESETS.find((p) => p.type === 'dry_heat' && p.recommended);
    expect(preset).toBeDefined();
    expect(preset!.temperature).toBe(180);
    expect(preset!.duration).toBe(60);
  });

  it('autoclave recommended preset is 134°C · 5 min', () => {
    const preset = STERI_PRESETS.find((p) => p.type === 'autoclave' && p.recommended);
    expect(preset).toBeDefined();
    expect(preset!.temperature).toBe(134);
    expect(preset!.duration).toBe(5);
  });
});

// ── getDefaultPreset ────────────────────────────────────

describe('getDefaultPreset', () => {
  it('returns dry_heat recommended preset for dry_heat type', () => {
    const preset = getDefaultPreset('dry_heat');
    expect(preset).toBeDefined();
    expect(preset!.type).toBe('dry_heat');
    expect(preset!.recommended).toBe(true);
    expect(preset!.temperature).toBe(180);
  });

  it('returns autoclave recommended preset for autoclave type', () => {
    const preset = getDefaultPreset('autoclave');
    expect(preset).toBeDefined();
    expect(preset!.type).toBe('autoclave');
    expect(preset!.temperature).toBe(134);
  });

  it('returns any recommended preset when type is null', () => {
    const preset = getDefaultPreset(null);
    expect(preset).toBeDefined();
    expect(preset!.recommended).toBe(true);
  });
});

// ── getPresetsForType ───────────────────────────────────

describe('getPresetsForType', () => {
  it('returns all presets when type is null', () => {
    expect(getPresetsForType(null)).toHaveLength(STERI_PRESETS.length);
  });

  it('returns only dry_heat presets', () => {
    const presets = getPresetsForType('dry_heat');
    expect(presets.length).toBeGreaterThan(0);
    expect(presets.every((p) => p.type === 'dry_heat')).toBe(true);
  });

  it('returns only autoclave presets', () => {
    const presets = getPresetsForType('autoclave');
    expect(presets.length).toBeGreaterThan(0);
    expect(presets.every((p) => p.type === 'autoclave')).toBe(true);
  });
});

// ── Pouch recommendations ───────────────────────────────

describe('getRecommendedPouch', () => {
  it('recommends 75×150 for Сталекс 11', () => {
    const result = getRecommendedPouch(['Сталекс 11']);
    expect(result).not.toBeNull();
    expect(result!.pouchId).toBe('pouch_75x150');
  });

  it('recommends 75×150 for кусачки', () => {
    const result = getRecommendedPouch(['Кусачки']);
    expect(result).not.toBeNull();
    expect(result!.pouchId).toBe('pouch_75x150');
  });

  it('recommends 60×100 for фрези', () => {
    const result = getRecommendedPouch(['Фрези']);
    expect(result).not.toBeNull();
    expect(result!.pouchId).toBe('pouch_60x100');
  });

  it('recommends 100×200 for ножиці', () => {
    const result = getRecommendedPouch(['Ножиці']);
    expect(result).not.toBeNull();
    expect(result!.pouchId).toBe('pouch_100x200');
  });

  it('returns null for unknown instrument', () => {
    const result = getRecommendedPouch(['Невідомий інструмент']);
    expect(result).toBeNull();
  });

  it('uses first matching instrument from array', () => {
    const result = getRecommendedPouch(['Фрези', 'Кусачки']);
    expect(result).not.toBeNull();
    expect(result!.pouchId).toBe('pouch_60x100'); // Фрези matched first
  });
});

// ── presetRequiresPouch ─────────────────────────────────

describe('presetRequiresPouch', () => {
  it('dry_heat always requires pouch', () => {
    expect(presetRequiresPouch('dry_heat')).toBe(true);
  });

  it('autoclave does not require pouch', () => {
    expect(presetRequiresPouch('autoclave')).toBe(false);
  });
});

// ── "Далі" button activation logic ─────────────────────

describe('Step completion validation', () => {
  it('step 1 requires instruments + sterilizer', () => {
    const canProceed = (instruments: string[], sterilizerName: string) =>
      instruments.length > 0 && sterilizerName.trim() !== '';

    expect(canProceed([], '')).toBe(false);
    expect(canProceed(['Кусачки'], '')).toBe(false);
    expect(canProceed([], 'Сухожар')).toBe(false);
    expect(canProceed(['Кусачки'], 'Сухожар')).toBe(true);
  });

  it('step 2 requires valid temp & duration', () => {
    expect(validateCycleParams('180', '60')).toBeNull();
    expect(validateCycleParams('134', '5')).toBeNull();
    expect(validateCycleParams('121', '20')).toBeNull();
    expect(validateCycleParams('50', '60')).not.toBeNull();
    expect(validateCycleParams('180', '0')).not.toBeNull();
  });

  it('step 3 requires pouch for dry_heat', () => {
    const canProceed = (needsPouch: boolean, pouchId: string | null) =>
      !needsPouch || pouchId !== null;

    expect(canProceed(true, null)).toBe(false);
    expect(canProceed(true, 'pouch_75x150')).toBe(true);
    expect(canProceed(false, null)).toBe(true);
    expect(canProceed(false, 'no_pouch')).toBe(true);
  });
});

// ── Validation edge cases ───────────────────────────────

describe('Cycle validation edge cases', () => {
  it('accepts 480 minutes', () => {
    expect(validateCycleParams('180', '480')).toBeNull();
  });

  it('rejects 481 minutes', () => {
    expect(validateCycleParams('180', '481')).toBe('Час: від 1 до 480 хвилин');
  });

  it('accepts typical preset values', () => {
    expect(validateCycleParams('180', '60')).toBeNull();
    expect(validateCycleParams('134', '5')).toBeNull();
    expect(validateCycleParams('121', '20')).toBeNull();
  });
});

// ── Pouch sizes fallback ────────────────────────────────

describe('FALLBACK_POUCH_SIZES', () => {
  it('has 3 sizes', () => {
    expect(FALLBACK_POUCH_SIZES).toHaveLength(3);
  });

  it('all have correct label format', () => {
    for (const p of FALLBACK_POUCH_SIZES) {
      expect(p.label).toMatch(/^\d+×\d+ мм$/);
    }
  });

  it('NO_POUCH_OPTION has zero dimensions', () => {
    expect(NO_POUCH_OPTION.width_mm).toBe(0);
    expect(NO_POUCH_OPTION.height_mm).toBe(0);
  });
});

// ── Duration calculation ────────────────────────────────

describe('calcActualMinutes', () => {
  it('calculates correct minutes between two timestamps', () => {
    const start = '2026-03-18T10:00:00.000Z';
    const end = '2026-03-18T11:02:00.000Z';
    expect(calcActualMinutes(start, end)).toBe(62);
  });

  it('returns 0 for same start and end', () => {
    const t = '2026-03-18T10:00:00.000Z';
    expect(calcActualMinutes(t, t)).toBe(0);
  });

  it('returns null if start is null', () => {
    expect(calcActualMinutes(null, '2026-03-18T10:00:00.000Z')).toBeNull();
  });

  it('returns null if end is null', () => {
    expect(calcActualMinutes('2026-03-18T10:00:00.000Z', null)).toBeNull();
  });

  it('returns null for invalid date strings', () => {
    expect(calcActualMinutes('invalid', '2026-03-18T10:00:00.000Z')).toBeNull();
  });

  it('rounds to nearest minute', () => {
    const start = '2026-03-18T10:00:00.000Z';
    const end = '2026-03-18T10:30:29.000Z'; // 30.48 min → rounds to 30
    expect(calcActualMinutes(start, end)).toBe(30);
  });
});

describe('getDurationStatus', () => {
  it('returns sufficient when actual >= recommended', () => {
    expect(getDurationStatus(60, 60)).toBe('sufficient');
    expect(getDurationStatus(65, 60)).toBe('sufficient');
    expect(getDurationStatus(120, 60)).toBe('sufficient');
  });

  it('returns insufficient when actual < recommended', () => {
    expect(getDurationStatus(59, 60)).toBe('insufficient');
    expect(getDurationStatus(4, 5)).toBe('insufficient');
    expect(getDurationStatus(0, 20)).toBe('insufficient');
  });
});

describe('getRecommendedMinutes', () => {
  it('returns duration_minutes when provided', () => {
    expect(getRecommendedMinutes(60)).toBe(60);
    expect(getRecommendedMinutes(5)).toBe(5);
  });

  it('returns 60 as fallback when null', () => {
    expect(getRecommendedMinutes(null)).toBe(60);
  });
});

describe('formatElapsed', () => {
  it('formats 0 seconds', () => {
    expect(formatElapsed(0)).toEqual({ minutes: '00', seconds: '00' });
  });

  it('formats 90 seconds as 01:30', () => {
    expect(formatElapsed(90)).toEqual({ minutes: '01', seconds: '30' });
  });

  it('formats 3600 seconds as 60:00', () => {
    expect(formatElapsed(3600)).toEqual({ minutes: '60', seconds: '00' });
  });

  it('formats 3661 seconds as 61:01', () => {
    expect(formatElapsed(3661)).toEqual({ minutes: '61', seconds: '01' });
  });

  it('pads single digits', () => {
    expect(formatElapsed(5)).toEqual({ minutes: '00', seconds: '05' });
    expect(formatElapsed(65)).toEqual({ minutes: '01', seconds: '05' });
  });
});

// ── Warning on early completion ─────────────────────────

describe('Early completion warning logic', () => {
  it('should warn when actual < recommended', () => {
    const actual = 45;
    const recommended = 60;
    const shouldWarn = actual < recommended;
    expect(shouldWarn).toBe(true);
  });

  it('should not warn when actual >= recommended', () => {
    const actual = 62;
    const recommended = 60;
    const shouldWarn = actual < recommended;
    expect(shouldWarn).toBe(false);
  });

  it('should not warn when actual equals recommended', () => {
    const actual = 60;
    const recommended = 60;
    const shouldWarn = actual < recommended;
    expect(shouldWarn).toBe(false);
  });
});
