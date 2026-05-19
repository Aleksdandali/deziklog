import { useState } from 'react';
import {
  Image, View, StyleSheet,
  type ImageResizeMode,
  type StyleProp,
  type ViewStyle,
  type LayoutChangeEvent,
} from 'react-native';
import { exifRotationDeg } from './CameraCapture';

interface RotatedImageProps {
  uri: string;
  /** EXIF Orientation value (1, 3, 6, 8). Anything else is treated as no rotation. */
  orientation?: number;
  /** Outer container style — provides the visible bounds (width/height/borderRadius). */
  style?: StyleProp<ViewStyle>;
  resizeMode?: ImageResizeMode;
}

/**
 * Image wrapper that applies EXIF rotation visually for containers of any
 * size. For 90°/270° we swap the inner image's logical W/H and recenter so
 * the rotated bounding box exactly fills the container — no letterboxing
 * and no axis mismatch like a plain `transform: rotate` would cause.
 *
 * The container measures itself via onLayout. Image is rendered only after
 * the size is known to avoid one flash of mis-sized content.
 */
export default function RotatedImage({ uri, orientation, style, resizeMode = 'cover' }: RotatedImageProps) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const deg = exifRotationDeg(orientation);
  const swap = deg === 90 || deg === 270;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }));
  };

  return (
    <View style={[styles.container, style]} onLayout={onLayout}>
      {size && (
        <Image
          source={{ uri }}
          resizeMode={resizeMode}
          style={
            swap
              ? {
                  position: 'absolute',
                  width: size.h,
                  height: size.w,
                  top: (size.h - size.w) / 2,
                  left: (size.w - size.h) / 2,
                  transform: [{ rotate: `${deg}deg` }],
                }
              : { ...StyleSheet.absoluteFillObject, transform: [{ rotate: `${deg}deg` }] }
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
});
