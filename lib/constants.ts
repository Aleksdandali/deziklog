export const COLORS = {
  // Brand (DEZIK catalog identity)
  brand: '#4b569e',
  brandDark: '#363f75',
  brandLight: '#eceef5',

  // Text
  text: '#111827',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',

  // Surfaces
  white: '#FFFFFF',
  bg: '#FAFBFC',
  surface: '#FFFFFF',
  cardBg: '#F3F4F6',

  // Borders
  border: '#E5E7EB',
  borderLight: '#F3F4F6',

  // Status
  success: '#22C55E',
  successBg: '#F0FDF4',
  danger: '#EF4444',
  dangerBg: '#FEF2F2',
  warning: '#F59E0B',
  warningBg: '#FFFBEB',
} as const;

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
} as const;

export const FONT = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const SHADOW = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
} as const;

/** Milliseconds in one day — used for daysLeft calculations */
export const MS_PER_DAY = 86_400_000;
