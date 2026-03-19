/**
 * Tests for solution date logic: addDays, expiry calculations, timezone safety.
 */

// Replicate the FIXED addDays from solution/add.tsx
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// Replicate getStatus from solutions.tsx (FIXED threshold)
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

// Replicate getProgress from solutions.tsx
function getProgress(openedAt: string, expiresAt: string): number {
  const start = new Date(openedAt).getTime();
  const end = new Date(expiresAt).getTime();
  if (isNaN(start) || isNaN(end)) return 1;
  const now = Date.now();
  const total = end - start;
  if (total <= 0) return 1;
  const elapsed = now - start;
  return Math.min(1, Math.max(0, elapsed / total));
}

describe('addDays', () => {
  it('adds 14 days correctly', () => {
    expect(addDays('2026-03-12', 14)).toBe('2026-03-26');
  });

  it('handles month overflow', () => {
    expect(addDays('2026-03-25', 14)).toBe('2026-04-08');
  });

  it('handles year overflow', () => {
    expect(addDays('2026-12-25', 14)).toBe('2027-01-08');
  });

  it('handles leap year', () => {
    expect(addDays('2028-02-20', 14)).toBe('2028-03-05');
  });

  it('handles non-leap year February', () => {
    expect(addDays('2026-02-20', 14)).toBe('2026-03-06');
  });

  it('handles 28-day shelf life', () => {
    expect(addDays('2026-03-01', 28)).toBe('2026-03-29');
  });

  it('returns correct result regardless of timezone (no UTC parsing)', () => {
    // This was the old bug: new Date('2026-03-31') in UTC-5 = March 30 local
    // Our fixed version uses local Date constructor, so no timezone issue
    const result = addDays('2026-03-31', 14);
    expect(result).toBe('2026-04-14');
  });

  it('handles adding 0 days', () => {
    expect(addDays('2026-05-10', 0)).toBe('2026-05-10');
  });

  it('handles adding 1 day from leap day', () => {
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
  });

  it('handles negative days (subtraction)', () => {
    expect(addDays('2026-03-15', -10)).toBe('2026-03-05');
  });

  it('handles negative days crossing month boundary', () => {
    expect(addDays('2026-03-05', -10)).toBe('2026-02-23');
  });

  it('handles very large day values', () => {
    expect(addDays('2026-01-01', 365)).toBe('2027-01-01');
  });

  it('pads single-digit months and days', () => {
    expect(addDays('2026-01-01', 0)).toBe('2026-01-01');
    expect(addDays('2026-09-09', 0)).toBe('2026-09-09');
  });
});

describe('getStatus', () => {
  it('returns expired for past dates', () => {
    const past = new Date();
    past.setDate(past.getDate() - 1);
    const { status } = getStatus(past.toISOString());
    expect(status).toBe('expired');
  });

  it('returns expiring for dates within 3 days', () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 2);
    const { status, daysLeft } = getStatus(soon.toISOString());
    expect(status).toBe('expiring');
    expect(daysLeft).toBeGreaterThan(0);
    expect(daysLeft).toBeLessThanOrEqual(3);
  });

  it('returns active for dates beyond 3 days', () => {
    const future = new Date();
    future.setDate(future.getDate() + 10);
    const { status } = getStatus(future.toISOString());
    expect(status).toBe('active');
  });

  it('returns expired for invalid date strings', () => {
    const { status } = getStatus('not-a-date');
    expect(status).toBe('expired');
  });

  it('returns expired when daysLeft is exactly 0', () => {
    // Edge case: expires at current time
    const { status } = getStatus(new Date().toISOString());
    expect(status).toBe('expired');
  });

  it('returns expiring for exactly 3 days left', () => {
    const threeDays = new Date();
    threeDays.setDate(threeDays.getDate() + 2);
    threeDays.setHours(threeDays.getHours() + 12);
    const { status, daysLeft } = getStatus(threeDays.toISOString());
    expect(status).toBe('expiring');
    expect(daysLeft).toBe(3);
  });

  it('returns active for just over 3 days', () => {
    const future = new Date();
    future.setDate(future.getDate() + 4);
    const { status, daysLeft } = getStatus(future.toISOString());
    expect(status).toBe('active');
    expect(daysLeft).toBe(4);
  });

  it('returns negative daysLeft for far past dates', () => {
    const farPast = new Date();
    farPast.setDate(farPast.getDate() - 30);
    const { status, daysLeft } = getStatus(farPast.toISOString());
    expect(status).toBe('expired');
    expect(daysLeft).toBeLessThan(0);
  });

  it('handles empty string as invalid date', () => {
    const { status, daysLeft } = getStatus('');
    expect(status).toBe('expired');
    expect(daysLeft).toBe(0);
  });
});

describe('getProgress', () => {
  it('returns 0 when opened just now with future expiry', () => {
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + 14);
    const progress = getProgress(now.toISOString(), future.toISOString());
    expect(progress).toBeCloseTo(0, 1);
  });

  it('returns 1 when fully expired', () => {
    const past1 = new Date();
    past1.setDate(past1.getDate() - 28);
    const past2 = new Date();
    past2.setDate(past2.getDate() - 14);
    const progress = getProgress(past1.toISOString(), past2.toISOString());
    expect(progress).toBe(1);
  });

  it('returns 1 for invalid dates', () => {
    expect(getProgress('invalid', '2026-03-01')).toBe(1);
    expect(getProgress('2026-03-01', 'invalid')).toBe(1);
  });

  it('returns 1 when end equals start', () => {
    const date = new Date().toISOString();
    expect(getProgress(date, date)).toBe(1);
  });

  it('is between 0 and 1 for ongoing solution', () => {
    const opened = new Date();
    opened.setDate(opened.getDate() - 7);
    const expires = new Date();
    expires.setDate(expires.getDate() + 7);
    const progress = getProgress(opened.toISOString(), expires.toISOString());
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThan(1);
    expect(progress).toBeCloseTo(0.5, 1);
  });

  it('clamps to 0 when openedAt is in the future', () => {
    const futureOpen = new Date();
    futureOpen.setDate(futureOpen.getDate() + 5);
    const futureExpiry = new Date();
    futureExpiry.setDate(futureExpiry.getDate() + 19);
    const progress = getProgress(futureOpen.toISOString(), futureExpiry.toISOString());
    expect(progress).toBe(0);
  });

  it('clamps to 1 when end is before start', () => {
    const later = new Date();
    later.setDate(later.getDate() - 5);
    const earlier = new Date();
    earlier.setDate(earlier.getDate() - 10);
    const progress = getProgress(later.toISOString(), earlier.toISOString());
    expect(progress).toBe(1);
  });

  it('handles both dates being invalid', () => {
    expect(getProgress('bad', 'also-bad')).toBe(1);
  });
});
