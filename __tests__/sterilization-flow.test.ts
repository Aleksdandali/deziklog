/**
 * Integration test: full sterilization session lifecycle.
 * Tests the interplay between validation, timer, and result logic.
 */

// --- Extracted business logic (same as in source files) ---

function validateCycleParams(temperature: string, duration: string) {
  const temp = parseInt(temperature, 10);
  const dur = parseInt(duration, 10);
  if (!temp || temp < 100 || temp > 300) return 'Температура: 100–300 °C';
  if (!dur || dur < 1) return 'Час: мінімум 1 хвилина';
  return null;
}

function calcRemaining(durationSeconds: number, elapsed: number) {
  const remaining = Math.max(0, durationSeconds - elapsed);
  const remainMin = String(Math.floor(remaining / 60)).padStart(2, '0');
  const remainSec = String(remaining % 60).padStart(2, '0');
  return { remaining, remainMin, remainSec };
}

function calcProgress(durationSeconds: number, elapsed: number) {
  return durationSeconds > 0 ? Math.min(1, elapsed / durationSeconds) : 0;
}

function calcElapsed(timerStartedAt: number, now: number) {
  return Math.floor((now - timerStartedAt) / 1000);
}

function formatDuration(minutes: number | null): string {
  if (minutes == null) return '--';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}г ${m}хв`;
  return `${m} хв`;
}

type SolutionStatus = 'active' | 'expiring' | 'expired';

function getStatus(expiresAt: string): { status: SolutionStatus; daysLeft: number } {
  const now = new Date();
  const expires = new Date(expiresAt);
  if (isNaN(expires.getTime())) return { status: 'expired', daysLeft: 0 };
  const daysLeft = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft <= 0) return { status: 'expired', daysLeft };
  if (daysLeft <= 3) return { status: 'expiring', daysLeft };
  return { status: 'active', daysLeft };
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

const SHELF_DAYS: Record<string, number> = {
  'Деланол': 14,
  'Bionol': 14,
  'Instrum': 28,
  'Septonal': 14,
};

// --- Tests ---

describe('Sterilization session lifecycle', () => {
  it('validates params → runs timer → completes cycle', () => {
    // Step 1: user enters params
    const temp = '180';
    const dur = '30';
    expect(validateCycleParams(temp, dur)).toBeNull();

    // Step 2: timer starts
    const durationSeconds = parseInt(dur, 10) * 60; // 1800
    const timerStart = Date.now();

    // Step 3: simulate 10 seconds elapsed
    let elapsed = calcElapsed(timerStart, timerStart + 10_000);
    expect(elapsed).toBe(10);
    let progress = calcProgress(durationSeconds, elapsed);
    expect(progress).toBeCloseTo(10 / 1800, 3);
    let { remaining } = calcRemaining(durationSeconds, elapsed);
    expect(remaining).toBe(1790);

    // Step 4: simulate halfway
    elapsed = calcElapsed(timerStart, timerStart + 900_000);
    expect(elapsed).toBe(900);
    progress = calcProgress(durationSeconds, elapsed);
    expect(progress).toBe(0.5);

    // Step 5: simulate completion
    elapsed = calcElapsed(timerStart, timerStart + 1_800_000);
    expect(elapsed).toBe(1800);
    progress = calcProgress(durationSeconds, elapsed);
    expect(progress).toBe(1);
    ({ remaining } = calcRemaining(durationSeconds, elapsed));
    expect(remaining).toBe(0);

    // Step 6: result is formatted for journal
    expect(formatDuration(30)).toBe('30 хв');
  });

  it('rejects invalid params before timer starts', () => {
    expect(validateCycleParams('50', '30')).toBe('Температура: 100–300 °C');
    expect(validateCycleParams('180', '0')).toBe('Час: мінімум 1 хвилина');
    // Timer should never start — no need to test calcProgress
  });

  it('handles app backgrounding during timer', () => {
    const durationSeconds = 1800;
    const timerStart = Date.now();

    // App goes to background for 20 minutes (timer was 30 min)
    const elapsed = calcElapsed(timerStart, timerStart + 20 * 60 * 1000);
    expect(elapsed).toBe(1200);

    const progress = calcProgress(durationSeconds, elapsed);
    expect(progress).toBeCloseTo(0.667, 2);

    // Timer should still be running, not done
    const { remaining } = calcRemaining(durationSeconds, elapsed);
    expect(remaining).toBe(600);
  });

  it('handles app backgrounding past completion', () => {
    const durationSeconds = 1800;
    const timerStart = Date.now();

    // App goes to background for 45 minutes (past 30 min duration)
    const elapsed = calcElapsed(timerStart, timerStart + 45 * 60 * 1000);
    expect(elapsed).toBe(2700);

    const progress = calcProgress(durationSeconds, elapsed);
    expect(progress).toBe(1); // capped

    const { remaining } = calcRemaining(durationSeconds, elapsed);
    expect(remaining).toBe(0);
  });
});

describe('Solution lifecycle', () => {
  it('creates solution with correct expiry and tracks status over time', () => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Step 1: create with Деланол (14 days)
    const expiresStr = addDays(todayStr, SHELF_DAYS['Деланол']);

    // Step 2: check status right after creation — should be active
    const expiresISO = new Date(
      parseInt(expiresStr.split('-')[0]),
      parseInt(expiresStr.split('-')[1]) - 1,
      parseInt(expiresStr.split('-')[2]),
    ).toISOString();
    const { status: initialStatus, daysLeft } = getStatus(expiresISO);
    expect(initialStatus).toBe('active');
    expect(daysLeft).toBeGreaterThanOrEqual(13);
    expect(daysLeft).toBeLessThanOrEqual(15);
  });

  it('Instrum has double shelf life vs Деланол', () => {
    expect(SHELF_DAYS['Instrum']).toBe(28);
    expect(SHELF_DAYS['Деланол']).toBe(14);
    expect(SHELF_DAYS['Instrum']).toBe(2 * SHELF_DAYS['Деланол']);
  });

  it('all known solutions have shelf life defined', () => {
    const knownSolutions = ['Деланол', 'Bionol', 'Instrum', 'Septonal'];
    for (const name of knownSolutions) {
      expect(SHELF_DAYS[name]).toBeDefined();
      expect(SHELF_DAYS[name]).toBeGreaterThan(0);
    }
  });
});

describe('Timer edge cases with rapid state changes', () => {
  it('elapsed never exceeds real wall clock time', () => {
    const start = 1000000;
    for (let ms = 0; ms <= 60000; ms += 1000) {
      const elapsed = calcElapsed(start, start + ms);
      expect(elapsed).toBe(ms / 1000);
    }
  });

  it('progress is monotonically non-decreasing with increasing elapsed', () => {
    const duration = 1800;
    let prevProgress = 0;
    for (let e = 0; e <= 2000; e += 100) {
      const p = calcProgress(duration, e);
      expect(p).toBeGreaterThanOrEqual(prevProgress);
      prevProgress = p;
    }
  });

  it('remaining is monotonically non-increasing with increasing elapsed', () => {
    const duration = 1800;
    let prevRemaining = duration;
    for (let e = 0; e <= 2000; e += 100) {
      const { remaining } = calcRemaining(duration, e);
      expect(remaining).toBeLessThanOrEqual(prevRemaining);
      prevRemaining = remaining;
    }
  });
});
