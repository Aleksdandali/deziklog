import { FONT } from './constants';

/**
 * @expo-google-fonts/inter loads each weight as a SEPARATE named family, and
 * React Native IGNORES the `fontWeight` style prop once a static named family
 * is set. So we translate a numeric/string fontWeight into the matching Inter
 * family here — in ONE place. If a new weight is introduced, update both this
 * map and the useFonts() call in app/_layout.tsx.
 */
const WEIGHT_TO_FAMILY: Record<string, string> = {
  '100': FONT.extralight, // no Thin loaded; nearest is ExtraLight
  '200': FONT.extralight,
  '300': FONT.light,
  '400': FONT.regular,
  '500': FONT.medium,
  '600': FONT.semibold,
  '700': FONT.bold,
  '800': FONT.extrabold,
  '900': FONT.extrabold, // no Black loaded; nearest is ExtraBold
  normal: FONT.regular,
  bold: FONT.bold,
};

export function fontFamilyForWeight(weight?: string | number | null): string {
  if (weight == null) return FONT.regular;
  return WEIGHT_TO_FAMILY[String(weight)] ?? FONT.regular;
}
