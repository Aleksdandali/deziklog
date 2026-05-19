import {
  View, StyleSheet,
  type ImageResizeMode,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Image as ExpoImage, type ImageContentFit } from 'expo-image';

interface RotatedImageProps {
  uri: string;
  /**
   * @deprecated EXIF orientation is now baked into the pixels at capture
   * (see `components/CameraCapture.tsx`) and `expo-image` honors EXIF for
   * any legacy photos still uploaded with the tag set. The prop is kept
   * for backward compatibility with existing call sites but is ignored.
   */
  orientation?: number | null;
  /** Outer container style — provides the visible bounds (width/height/borderRadius). */
  style?: StyleProp<ViewStyle>;
  resizeMode?: ImageResizeMode;
}

/**
 * Photo display component. Was previously responsible for compensating for
 * RN's <Image> ignoring EXIF rotation; that role is gone now — the orientation
 * is fixed at capture time. We still wrap expo-image in a View so callers can
 * keep their existing layout props (height, borderRadius, etc.).
 */
export default function RotatedImage({ uri, style, resizeMode = 'cover' }: RotatedImageProps) {
  const contentFit: ImageContentFit = resizeMode === 'contain' ? 'contain' : 'cover';
  return (
    <View style={[styles.container, style]}>
      <ExpoImage
        source={{ uri }}
        style={StyleSheet.absoluteFillObject}
        contentFit={contentFit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
});
