import { COLORS } from '../lib/constants';

describe('COLORS', () => {
  it('exports all required color keys', () => {
    const requiredKeys = [
      'brand', 'brandDark', 'cardBg', 'white', 'text',
      'textSecondary', 'success', 'danger', 'warning', 'border', 'bg',
    ];
    for (const key of requiredKeys) {
      expect(COLORS).toHaveProperty(key);
    }
  });

  it('all values are valid hex color strings', () => {
    for (const [key, value] of Object.entries(COLORS)) {
      expect(value).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('brand color is the expected value', () => {
    expect(COLORS.brand).toBe('#4b569e');
  });
});
