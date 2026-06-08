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

// Single canonical radius scale — superset of both legacy key sets.
// `RADII` (lib/theme.ts) is an alias of this object, so both name sets resolve here.
export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 14, // unified to the cycle-flow value (13 files); Home + Catalog shift 16→14
  xl: 20,
  full: 999, // pill button (constants legacy)
  pill: 40, // pill chip (theme legacy)
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
  extralight: 'Inter_200ExtraLight',
  light: 'Inter_300Light',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
} as const;

// Single canonical shadow object — both size-named (sm/md) and semantic-named
// (card/button) keys. `SHADOWS` (lib/theme.ts) is an alias of this object.
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
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  button: {
    shadowColor: COLORS.brand,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
} as const;

/** Milliseconds in one day — used for daysLeft calculations */
export const MS_PER_DAY = 86_400_000;

/**
 * Orders >= this amount (UAH) get free shipping (sender pays). Display-only on
 * the client — the server is authoritative (mirrors FREE_SHIPPING_THRESHOLD in
 * supabase/functions/_shared/shipping-policy.ts; keep the two values in sync).
 */
export const FREE_SHIPPING_THRESHOLD = 2000;
