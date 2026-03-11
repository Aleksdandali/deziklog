import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { X, Camera } from 'lucide-react-native';
import { Image } from 'react-native';

import { addSterilizer } from '@/lib/db';
import { COLORS } from '@/lib/constants';
import type { SterilizationType } from '@/lib/types';

import { Input } from '@/components/ui/Input';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Button } from '@/components/ui/Button';

export default function AddSterilizerScreen() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [type, setType] = useState<SterilizationType>('dry_heat');
  const [serialNumber, setSerialNumber] = useState('');
  const [maintenanceDate, setMaintenanceDate] = useState('');
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const handlePickPhoto = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
    });
    if (!r.canceled) setPhotoUri(r.assets[0].uri);
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Введіть назву стерилізатора');
      return;
    }

    try {
      setLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      addSterilizer({
        name: name.trim(),
        type,
        serialNumber: serialNumber.trim() || undefined,
        maintenanceDate: maintenanceDate.trim() || undefined,
        photoUri,
      });

      router.back();
    } catch (e) {
      Alert.alert('Помилка', 'Не вдалося додати стерилізатор');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
        <Text className="text-xl font-bold text-[#1B1B1B]">Новий стерилізатор</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-9 h-9 rounded-full bg-surface items-center justify-center"
          activeOpacity={0.8}
        >
          <X size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Photo */}
        <View className="mb-5">
          <Text className="text-sm font-medium text-[#1B1B1B] mb-2">Фото (необов'язково)</Text>
          <TouchableOpacity onPress={handlePickPhoto} activeOpacity={0.8}>
            {photoUri ? (
              <Image
                source={{ uri: photoUri }}
                className="w-full h-36 rounded-2xl"
                resizeMode="cover"
              />
            ) : (
              <View className="h-32 bg-surface border-2 border-dashed border-border rounded-2xl items-center justify-center gap-2">
                <Camera size={24} color={COLORS.textSecondary} />
                <Text className="text-sm text-text-secondary">Додати фото</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View className="gap-4 mb-6">
          <Input
            label="Назва"
            value={name}
            onChangeText={setName}
            placeholder="Microstop M2, ГП-20..."
          />

          <View>
            <Text className="text-sm font-medium text-[#1B1B1B] mb-2">Тип</Text>
            <SegmentedControl
              options={[
                { label: 'Сухожар', value: 'dry_heat' },
                { label: 'Автоклав', value: 'autoclave' },
              ]}
              value={type}
              onChange={setType}
            />
          </View>

          <Input
            label="Серійний номер (необов'язково)"
            value={serialNumber}
            onChangeText={setSerialNumber}
            placeholder="SN-12345"
          />

          <Input
            label="Дата наступного ТО (необов'язково)"
            value={maintenanceDate}
            onChangeText={setMaintenanceDate}
            placeholder="2026-06-01"
          />
        </View>

        <Button label="Зберегти" onPress={handleSave} loading={loading} haptic />
      </ScrollView>
    </SafeAreaView>
  );
}
