import React, { useRef } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, SafeAreaView, Linking } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../lib/constants';

/**
 * EXIF Orientation value → degrees of clockwise rotation needed to display
 * the image upright. iPhones write 6 for back-camera portrait shots; RN's
 * <Image> ignores EXIF, so callers must apply this rotation via `transform`.
 */
export function exifRotationDeg(orientation: number | undefined): number {
  switch (orientation) {
    case 3: return 180;
    case 6: return 90;
    case 8: return 270;
    default: return 0;
  }
}

interface CameraCaptureProps {
  label: string;
  onCapture: (uri: string, exifOrientation?: number) => void;
  onClose: () => void;
}

export default function CameraCapture({ label, onCapture, onClose }: CameraCaptureProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const takePicture = async () => {
    if (!cameraRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // `exif: true` — iPhones write landscape pixel data + an EXIF rotate flag
    // (e.g. Orientation=6 for 90°CW). RN's <Image> does NOT apply EXIF on its
    // own, so we surface the value to the caller to rotate via CSS transform.
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.7, base64: false, exif: true });
    if (photo?.uri) {
      const orientation = (photo as { exif?: { Orientation?: number } }).exif?.Orientation;
      onCapture(photo.uri, orientation);
    }
  };

  const pickFromGallery = async () => {
    onClose();
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!res.canceled) onCapture(res.assets[0].uri);
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
