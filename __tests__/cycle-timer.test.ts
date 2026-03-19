/**
 * Tests for sterilization cycle timer logic.
 * Extracted from app/cycle/index.tsx.
 */

// Timer calculation logic from cycle/index.tsx
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

// Ring progress visual calculation
const RING_R = 95;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

function calcDashOffset(progress: number) {
  return RING_CIRCUMFERENCE * (1 - progress);
}

function calcDotPosition(progress: number) {
  const RING_CX = 130; // RING_SIZE / 2
  const RING_CY = 130;
  const progressAngle = progress * 2 * Math.PI - Math.PI / 2;
  const dotX = RING_CX + RING_R * Math.cos(progressAngle);
  const dotY = RING_CY + RING_R * Math.sin(progressAngle);
  return { dotX, dotY };
}

describe('Timer calculations', () => {
  describe('calcRemaining', () => {
    it('shows full time at start', () => {
      const { remaining, remainMin, remainSec } = calcRemaining(1800, 0); // 30 min
      expect(remaining).toBe(1800);
      expect(remainMin).toBe('30');
      expect(remainSec).toBe('00');
    });

    it('counts down correctly', () => {
      const { remaining, remainMin, remainSec } = calcRemaining(1800, 600); // 20 min left
      expect(remaining).toBe(1200);
      expect(remainMin).toBe('20');
      expect(remainSec).toBe('00');
    });

    it('shows seconds correctly', () => {
      const { remainMin, remainSec } = calcRemaining(1800, 1750); // 50 sec left
      expect(remainMin).toBe('00');
      expect(remainSec).toBe('50');
    });

    it('never goes below zero', () => {
      const { remaining } = calcRemaining(1800, 5000); // way past
      expect(remaining).toBe(0);
    });

    it('pads single digits with leading zero', () => {
      const { remainMin, remainSec } = calcRemaining(65, 0);
      expect(remainMin).toBe('01');
      expect(remainSec).toBe('05');
    });

    it('handles exactly 1 second remaining', () => {
      const { remaining, remainMin, remainSec } = calcRemaining(100, 99);
      expect(remaining).toBe(1);
      expect(remainMin).toBe('00');
      expect(remainSec).toBe('01');
    });

    it('handles zero duration', () => {
      const { remaining, remainMin, remainSec } = calcRemaining(0, 0);
      expect(remaining).toBe(0);
      expect(remainMin).toBe('00');
      expect(remainSec).toBe('00');
    });

    it('handles very long duration (2 hours)', () => {
      const { remaining, remainMin, remainSec } = calcRemaining(7200, 0);
      expect(remaining).toBe(7200);
      expect(remainMin).toBe('120');
      expect(remainSec).toBe('00');
    });
  });

  describe('calcProgress', () => {
    it('returns 0 at start', () => {
      expect(calcProgress(1800, 0)).toBe(0);
    });

    it('returns 0.5 at halfway', () => {
      expect(calcProgress(1800, 900)).toBe(0.5);
    });

    it('returns 1 at completion', () => {
      expect(calcProgress(1800, 1800)).toBe(1);
    });

    it('caps at 1 when elapsed exceeds duration', () => {
      expect(calcProgress(1800, 3600)).toBe(1);
    });

    it('returns 0 when duration is 0 (prevents division by zero)', () => {
      expect(calcProgress(0, 100)).toBe(0);
    });
  });

  describe('calcElapsed', () => {
    it('calculates elapsed seconds from timestamps', () => {
      const start = 1000000;
      const now = 1030000; // 30 seconds later
      expect(calcElapsed(start, now)).toBe(30);
    });

    it('floors partial seconds', () => {
      const start = 1000000;
      const now = 1001500; // 1.5 seconds
      expect(calcElapsed(start, now)).toBe(1);
    });

    it('handles background resume (large time jumps)', () => {
      const start = 1000000;
      const now = 1000000 + 600 * 1000; // 10 minutes later (background)
      expect(calcElapsed(start, now)).toBe(600);
    });
  });

  describe('Ring visual calculations', () => {
    it('full ring (no progress) has full dash offset', () => {
      expect(calcDashOffset(0)).toBeCloseTo(RING_CIRCUMFERENCE);
    });

    it('completed ring has zero dash offset', () => {
      expect(calcDashOffset(1)).toBeCloseTo(0);
    });

    it('half progress has half offset', () => {
      expect(calcDashOffset(0.5)).toBeCloseTo(RING_CIRCUMFERENCE * 0.5);
    });

    it('dot starts at top (12 o\'clock position)', () => {
      const { dotX, dotY } = calcDotPosition(0);
      expect(dotX).toBeCloseTo(130); // center X
      expect(dotY).toBeCloseTo(130 - 95); // top
    });

    it('dot at 25% is at 3 o\'clock', () => {
      const { dotX, dotY } = calcDotPosition(0.25);
      expect(dotX).toBeCloseTo(130 + 95); // right
      expect(dotY).toBeCloseTo(130); // center Y
    });

    it('dot at 50% is at 6 o\'clock', () => {
      const { dotX, dotY } = calcDotPosition(0.5);
      expect(dotX).toBeCloseTo(130); // center X
      expect(dotY).toBeCloseTo(130 + 95); // bottom
    });
  });
});

describe('Temperature & duration validation', () => {
  // Validation rules from cycle/index.tsx handleStep1Next
  function validateCycleParams(temperature: string, duration: string) {
    const temp = parseInt(temperature, 10);
    const dur = parseInt(duration, 10);
    if (!temp || temp < 100 || temp > 300) return 'Температура: 100–300 °C';
    if (!dur || dur < 1) return 'Час: мінімум 1 хвилина';
    return null;
  }

  it('accepts valid params: 180°C, 30 min', () => {
    expect(validateCycleParams('180', '30')).toBeNull();
  });

  it('accepts boundary: 100°C', () => {
    expect(validateCycleParams('100', '30')).toBeNull();
  });

  it('accepts boundary: 300°C', () => {
    expect(validateCycleParams('300', '30')).toBeNull();
  });

  it('rejects temperature below 100', () => {
    expect(validateCycleParams('99', '30')).toBe('Температура: 100–300 °C');
  });

  it('rejects temperature above 300', () => {
    expect(validateCycleParams('301', '30')).toBe('Температура: 100–300 °C');
  });

  it('rejects non-numeric temperature', () => {
    expect(validateCycleParams('abc', '30')).toBe('Температура: 100–300 °C');
  });

  it('rejects zero duration', () => {
    expect(validateCycleParams('180', '0')).toBe('Час: мінімум 1 хвилина');
  });

  it('accepts 1 minute duration', () => {
    expect(validateCycleParams('180', '1')).toBeNull();
  });

  it('rejects empty temperature string', () => {
    expect(validateCycleParams('', '30')).toBe('Температура: 100–300 °C');
  });

  it('rejects empty duration string', () => {
    expect(validateCycleParams('180', '')).toBe('Час: мінімум 1 хвилина');
  });

  it('truncates float temperature to integer', () => {
    // parseInt('180.5', 10) = 180
    expect(validateCycleParams('180.5', '30')).toBeNull();
  });

  it('rejects negative temperature', () => {
    expect(validateCycleParams('-50', '30')).toBe('Температура: 100–300 °C');
  });

  it('rejects negative duration', () => {
    expect(validateCycleParams('180', '-5')).toBe('Час: мінімум 1 хвилина');
  });

  it('accepts maximum boundary temperature 300°C with 1 min', () => {
    expect(validateCycleParams('300', '1')).toBeNull();
  });
});
