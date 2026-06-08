import { forwardRef } from 'react';
import {
  Text as RNText,
  TextInput as RNTextInput,
  StyleSheet,
  type TextProps,
  type TextInputProps,
  type TextStyle,
  type StyleProp,
} from 'react-native';
import { fontFamilyForWeight } from '../lib/fonts';

/**
 * Drop-in replacements for react-native's <Text> / <TextInput>.
 *
 * Inter is loaded as separate named weight-families, and RN ignores
 * `fontWeight` once a named family is set — so any text WITHOUT an explicit
 * fontFamily would render in the system font. These wrappers derive the
 * correct Inter face from `fontWeight` (via lib/fonts) and inject it.
 *
 * An explicit `fontFamily` is always preserved: the few screens already using
 * FONT.* (Inter_*) keep their styling, and intentional non-Inter families like
 * 'monospace' (debug/error banners) are NOT overwritten.
 *
 * Adopt by aliasing the import — bodies don't change:
 *   import { AppText as Text } from '<rel>/components/AppText';
 */
function withInter(style: StyleProp<TextStyle>): StyleProp<TextStyle> {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  if (flat.fontFamily) return style; // respect any explicit family
  return [style, { fontFamily: fontFamilyForWeight(flat.fontWeight) }];
}

export const AppText = forwardRef<RNText, TextProps>(({ style, ...rest }, ref) => (
  <RNText ref={ref} style={withInter(style)} {...rest} />
));
AppText.displayName = 'AppText';

export const AppTextInput = forwardRef<RNTextInput, TextInputProps>(({ style, ...rest }, ref) => (
  <RNTextInput ref={ref} style={withInter(style)} {...rest} />
));
AppTextInput.displayName = 'AppTextInput';
