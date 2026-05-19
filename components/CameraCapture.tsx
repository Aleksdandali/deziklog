import React, { useRef } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, SafeAreaView, Linking } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../lib/constants';

/**
 * EXIF Orientation → degrees of clockwise rotation needed to display upright.
 * iPhones write Orientation=6 (90° CW) for back-camera portrait shots.
 */
function rotationFromExif(orientation: number | undefined): number {
  switch (orientation) {
    case 3: return 180;
    case 6: return 90;
    case 8: return 270;
    default: return 0;
  }
}

/**
 * Rotate the image pixels to match the EXIF Orientation and re-encode as a
 * fresh JPEG without EXIF metadata. After this, every downstream consumer
 * (RN <Image>, expo-image, Supabase preview, comparison thumbnails) can
 * render the URI naively without needing rotation transforms.
 *
 * No-op when rotation is 0° — avoids a pointless re-encode.
 */
async function normalizeOrientation(uri: string, orientation: number | undefined): Promise<string> {
  const deg = rotationFromExif(orientation);
  if (deg === 0) return uri;
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ rotate: deg }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
    );
    return result.uri;
  } catch (err) {
    if (__DEV__) console.warn('[CameraCapture] orientation normalize failed:', err);
    return uri;
  }
}

interface CameraCaptureProps {
  label: string;
  onCapture: (uri: string) => void;
  onClose: () => void;
}

export default function CameraCapture({ label, onCapture, onClose }: CameraCaptureProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const takePicture = async () => {
    if (!cameraRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // `exif: true` — iPhones return landscape pixel data + Orientation flag
    // for portrait shots. We read that flag and physically rotate the
    // pixels via ImageManipulator so the URI is upright everywhere.
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.7, base64: false, exif: true });
    if (!photo?.uri) return;
    const orientation = (photo as { exif?: { Orientation?: number } }).exif?.Orientation;
    const upright = await normalizeOrientation(photo.uri, orientation);
    onCapture(upright);
  };

  const pickFromGallery = async () => {
    onClose();
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      exif: true,
    });
    if (res.canceled) return;
    const asset = res.assets[0];
    const orientation = (asset.exif as { Orientation?: number } | undefined)?.Orientation;
    const upright = await normalizeOrientation(asset.uri, orientation);
    onCapture(upright);
  };

  if (!permission) return null;

  if (!permission.granted) {
    // After the user denies once, iOS will not show the system dialog again
    // and `requestPermission()` silently returns the existing denied status —
    // the button looks broken. Route to Settings instead.
    const blocked = !permission.canAskAgain;
    const onPermPress = blocked
      ? () => { Linking.openSettings(); }
      : requestPermission;
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionContainer}>
          <Feather name="camera" size={48} color={COLORS.brand} />
          <Text style={styles.permTitle}>Потрібен доступ до камери</Text>
          <Text style={styles.permText}>
            {blocked
              ? 'Доступ до камери заблоковано. Відкрийте Налаштування і дозвольте камеру для Dezik Log.'
              : 'Щоб фотографувати індикатори, дозвольте камеру'}
          </Text>
          <TouchableOpacity style={styles.permBtn} onPress={onPermPress}>
            <Text style={styles.permBtnText}>{blocked ? 'Відкрити Налаштування' : 'Дозволити'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.permCancel} onPress={onClose}>
            <Text style={styles.permCancelText}>Скасувати</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.cameraWrap}>
      <CameraView ref={cameraRef} style={styles.cameraView} facing="back">
        <SafeAreaView style={styles.cameraOverlay}>
          <View style={styles.cameraTop}>
            <TouchableOpacity style={styles.cameraClose} onPress={onClose}>
              <Feather name="x" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.cameraLabel}>{label}</Text>
            <TouchableOpacity style={styles.cameraGallery} onPress={pickFromGallery}>
              <Feather name="image" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={styles.cameraBottom}>
            <TouchableOpacity style={styles.shutter} onPress={takePicture} activeOpacity={0.7}>
              <View style={styles.shutterInner} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  cameraWrap: { flex: 1, backgroundColor: '#000' },
  cameraView: { flex: 1 },
  cameraOverlay: { flex: 1, justifyContent: 'space-between' },
  cameraTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  cameraClose: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  cameraLabel: { fontSize: 15, fontWeight: '700', color: '#fff' },
  cameraGallery: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  cameraBottom: { alignItems: 'center', paddingBottom: 32 },
  shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)' },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },
  permissionContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  permTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  permText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },
  permBtn: { height: 50, borderRadius: 14, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', marginTop: 8 },
  permBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  permCancel: { padding: 12 },
  permCancelText: { fontSize: 14, color: COLORS.textSecondary },
});
