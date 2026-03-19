import React, { useRef } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, SafeAreaView } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../lib/constants';

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
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.7, base64: false });
    if (photo?.uri) onCapture(photo.uri);
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
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionContainer}>
          <Feather name="camera" size={48} color={COLORS.brand} />
          <Text style={styles.permTitle}>Потрібен доступ до камери</Text>
          <Text style={styles.permText}>Щоб фотографувати індикатори, дозвольте камеру</Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnText}>Дозволити</Text>
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
