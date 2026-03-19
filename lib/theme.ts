import { StyleSheet } from 'react-native';
import { COLORS } from './constants';

export { COLORS };

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 32,
} as const;

export const RADII = {
  sm: 10,
  md: 12,
  lg: 14,
  xl: 16,
  pill: 40,
} as const;

export const TYPOGRAPHY = {
  h1: { fontSize: 26, fontWeight: '800' as const, color: COLORS.text },
  h2: { fontSize: 22, fontWeight: '700' as const, color: COLORS.text },
  h3: { fontSize: 18, fontWeight: '700' as const, color: COLORS.text },
  body: { fontSize: 14, fontWeight: '400' as const, color: COLORS.text },
  bodyBold: { fontSize: 14, fontWeight: '600' as const, color: COLORS.text },
  caption: { fontSize: 12, fontWeight: '400' as const, color: COLORS.textSecondary },
  label: { fontSize: 11, fontWeight: '600' as const, textTransform: 'uppercase' as const, letterSpacing: 0.5, color: COLORS.textSecondary },
  timer: { fontSize: 48, fontWeight: '200' as const, color: COLORS.text, fontVariant: ['tabular-nums'] as any },
  fieldLabel: { fontSize: 12, fontWeight: '700' as const, color: COLORS.textSecondary, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  hint: { fontSize: 13, fontWeight: '400' as const, color: COLORS.textSecondary, lineHeight: 19 },
} as const;

export const SHADOWS = {
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

/** @deprecated Use STERI_PRESETS from lib/steri-config.ts instead */
export { STERI_PRESETS as CYCLE_PRESETS } from './steri-config';

/** Shared component styles reused across screens */
export const SHARED = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  screenContainerBg: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBar: {
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm + 2,
  },
  progSeg: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
  },
  progSegActive: {
    backgroundColor: COLORS.brand,
  },
  body: {
    padding: SPACING.xl,
    paddingBottom: 40,
  },
  primaryBtn: {
    flexDirection: 'row',
    height: 54,
    borderRadius: RADII.lg,
    backgroundColor: COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 24,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  gradientInner: {
    flexDirection: 'row',
    height: 54,
    borderRadius: RADII.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  gradientText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: RADII.pill,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  chipActive: {
    borderColor: COLORS.brand,
    backgroundColor: COLORS.brand,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  chipTextActive: {
    color: '#fff',
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg - 2,
    marginBottom: SPACING.sm + 2,
    ...({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
      elevation: 1,
    }),
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
  },
  stepSub: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
    marginBottom: 20,
    lineHeight: 20,
  },
});
