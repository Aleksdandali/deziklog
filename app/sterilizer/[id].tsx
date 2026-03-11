import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { X, Camera, Trash2 } from 'lucide-react-native';

import { getSterilizer, updateSterilizer, deleteSterilizer } from '@/lib/db';
import { COLORS } from '@/lib/constants';
import type { SterilizationType } from '@/lib/types';

import { Input } from '@/components/ui/Input';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Button } from '@/components/ui/Button';

export default function EditSterilizerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [name, setName] = useState('');
  const [type, setType] = useState<SterilizationType>('dry_heat');
  const [serialNumber, setSerialNumber] = useState('');
  const [maintenanceDate, setMaintenanceDate] = useState('');
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    const s = getSterilizer(id);
    if (s) {
      setName(s.name);
      setType(s.type);
      setSerialNumber(s.serialNumber ?? '');
      setMaintenanceDate(s.maintenanceDate ?? '');
      setPhotoUri(s.photoUri);
    }
  }, [id]);

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
    if (!name.trim() || !id) return;

    try {
      setLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      updateSterilizer(id, {
        name: name.trim(),
        type,
        serialNumber: serialNumber.trim() || undefined,
        maintenanceDate: maintenanceDate.trim() || undefined,
        photoUri,
      });

      router.back();
    } catch {
      Alert.alert('Помилка', 'Не вдалося зберегти');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Видалити стерилізатор?',
      'Записи циклів залишаться, але прив\'язка до стерилізатора буде втрачена.',
      [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Видалити',
          style: 'destructive',
          onPress: () => {
            if (id) {
              deleteSterilizer(id);
              router.back();
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
        <Text className="text-xl font-bold text-[#1B1B1B]">Редагувати</Text>
        <View className="flex-row items-center gap-2">
          <TouchableOpacity onPress={handleDelete} className="w-9 h-9 rounded-full bg-red-50 items-center justify-center" activeOpacity={0.8}>
            <Trash2 size={16} color={COLORS.error} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()} className="w-9 h-9 rounded-full bg-surface items-center justify-center" activeOpacity={0.8}>
            <X size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-5">
          <TouchableOpacity onPress={handlePickPhoto} activeOpacity={0.8}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} className="w-full h-36 rounded-2xl" resizeMode="cover" />
            ) : (
              <View className="h-32 bg-surface border-2 border-dashed border-border rounded-2xl items-center justify-center gap-2">
                <Camera size={24} color={COLORS.textSecondary} />
                <Text className="text-sm text-text-secondary">Додати фото</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View className="gap-4 mb-6">
          <Input label="Назва" value={name} onChangeText={setName} placeholder="Microstop M2..." />
          <View>
            <Text className="text-sm font-medium text-[#1B1B1B] mb-2">Тип</Text>
            <SegmentedControl
              options={[{ label: 'Сухожар', value: 'dry_heat' }, { label: 'Автоклав', value: 'autoclave' }]}
              value={type}
              onChange={setType}
            />
          </View>
          <Input label="Серійний номер" value={serialNumber} onChangeText={setSerialNumber} placeholder="SN-12345" />
          <Input label="Дата наступного ТО" value={maintenanceDate} onChangeText={setMaintenanceDate} placeholder="2026-06-01" />
        </View>

        <Button label="Зберегти зміни" onPress={handleSave} loading={loading} haptic />
      </ScrollView>
    </SafeAreaView>
  );
}
