import React, { useState, useEffect } from 'react';
import { View, StyleProp, ViewStyle, ImageStyle } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../lib/constants';

interface Props {
  uri: string | null | undefined;
  style: StyleProp<ImageStyle>;
  /** Style applied to the placeholder View when image is missing or failed to load */
  placeholderStyle?: StyleProp<ViewStyle>;
  iconSize?: number;
  iconColor?: string;
  contentFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  transition?: number;
  recyclingKey?: string;
}

/**
 * Product catalog image with onError fallback to a package-icon placeholder.
 * Many legacy product image URLs point to external dezik.com.ua hosts that may
 * 404 — this guarantees a clean visual fallback instead of a blank slot.
 */
export function ProductImage({
  uri,
  style,
  placeholderStyle,
  iconSize = 28,
  iconColor = COLORS.textTertiary,
  contentFit = 'contain',
  transition,
  recyclingKey,
}: Props) {
  const [errored, setErrored] = useState(false);

  // Reset error state if the source URI changes (e.g. FlatList row recycling)
  useEffect(() => {
    setErrored(false);
  }, [uri]);

  if (!uri || errored) {
    return (
      <View style={[style, placeholderStyle]}>
        <Feather name="package" size={iconSize} color={iconColor} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={style}
      contentFit={contentFit}
      cachePolicy="disk"
      transition={transition}
      recyclingKey={recyclingKey}
      onError={() => setErrored(true)}
    />
  );
}
