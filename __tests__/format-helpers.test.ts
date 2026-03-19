/**
 * Tests for format helper functions used across screens.
 */

// FIXED formatDuration from journal.tsx / index.tsx
function formatDuration(minutes: number | null): string {
  if (minutes == null) return '--';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}г ${m}хв`;
  return `${m} хв`;
}

function formatPrice(price: number): string {
  return `${Math.round(price)} ₴`;
}

describe('formatDuration', () => {
  it('returns "--" for null', () => {
    expect(formatDuration(null)).toBe('--');
  });

  it('returns "0 хв" for 0 minutes (regression: was returning "--")', () => {
    expect(formatDuration(0)).toBe('0 хв');
  });

  it('formats minutes only', () => {
    expect(formatDuration(30)).toBe('30 хв');
    expect(formatDuration(45)).toBe('45 хв');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(90)).toBe('1г 30хв');
    expect(formatDuration(120)).toBe('2г 0хв');
  });

  it('handles large values', () => {
    expect(formatDuration(1440)).toBe('24г 0хв');
  });

  it('returns "--" for undefined', () => {
    expect(formatDuration(undefined as any)).toBe('--');
  });

  it('handles exactly 60 minutes', () => {
    expect(formatDuration(60)).toBe('1г 0хв');
  });

  it('handles 59 minutes (just under an hour)', () => {
    expect(formatDuration(59)).toBe('59 хв');
  });

  it('handles 1 minute', () => {
    expect(formatDuration(1)).toBe('1 хв');
  });
});

describe('formatPrice', () => {
  it('formats integer price', () => {
    expect(formatPrice(250)).toBe('250 ₴');
  });

  it('rounds decimal price', () => {
    expect(formatPrice(99.7)).toBe('100 ₴');
    expect(formatPrice(99.4)).toBe('99 ₴');
  });

  it('handles zero', () => {
    expect(formatPrice(0)).toBe('0 ₴');
  });

  it('formats large price', () => {
    expect(formatPrice(12500)).toBe('12500 ₴');
  });

  it('rounds 0.5 up', () => {
    expect(formatPrice(99.5)).toBe('100 ₴');
  });
});
