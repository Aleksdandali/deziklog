import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';

/**
 * Instagram glyph on the official Instagram brand gradient — replaces the flat
 * monochrome blue tile so the share affordance reads as Instagram, not as a
 * generic app button. Diagonal (bottom-left → top-right) like the real logo.
 */
interface InstagramIconProps {
  size?: number;
  iconSize?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

// Official Instagram gradient stops. `as const` keeps it a readonly tuple so it
// satisfies LinearGradient's `[ColorValue, ColorValue, ...]` colors type.
const IG_GRADIENT = ['#feda75', '#fa7e1e', '#d62976', '#962fbf', '#4f5bd5'] as const;

export default function InstagramIcon({
  size = 36,
  iconSize = 20,
  borderRadius = 10,
  style,
}: InstagramIconProps) {
  return (
    <LinearGradient
      colors={IG_GRADIENT}
      start={{ x: 0, y: 1 }}
      end={{ x: 1, y: 0 }}
      style={[{ width: size, height: size, borderRadius, alignItems: 'center', justifyContent: 'center' }, style]}
    >
      <Feather name="instagram" size={iconSize} color="#FFFFFF" />
    </LinearGradient>
  );
}
