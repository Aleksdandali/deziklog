import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Image,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { X, Camera, Check, ShoppingBag } from 'lucide-react-native';

import { completeCycle, addConsumption } from '@/lib/db';
import { cancelNotification } from '@/lib/notifications';
import { useAppStore } from '@/lib/store';
import { COLORS } from '@/lib/constants';
import type { IndicatorResult } from '@/lib/types';

import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function CompleteCycleScreen() {
  const router = useRouter();
  const { activeTimer, setActiveTimer } = useAppStore();

  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [result, setResult] = useState<IndicatorResult | undefined>();
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const handlePickPhoto = async () => {
    Alert.alert(
      'Фото індикатора',
      'Оберіть джерело',
      [
        {
          text: 'Камера',
          onPress: async () => {
            const r = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              quality: 0.85,
            });
            if (!r.canceled) setPhotoUri(r.assets[0].uri);
          },
        },
        {
          text: 'Галерея',
          onPress: async () => {
            const r = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              quality: 0.85,
            });
            if (!r.canceled) setPhotoUri(r.assets[0].uri);
          },
        },
        { text: 'Скасувати', style: 'cancel' },
      ]
    );
  };

  const handleSave = async () => {
    if (!result) {
      Alert.alert('Оберіть результат індикатора');
      return;
    }
    if (!activeTimer) {
      router.replace('/');
      return;
    }

    if (result === 'failed') {
      Alert.alert(
        'Увага!',
        'Інструменти потребують повторної стерилізації.',
        [{ text: 'Зрозуміло', onPress: () => doSave() }]
      );
    } else {
      doSave();
    }
  };

  const doSave = async () => {
    if (!activeTimer || !result) return;

    try {
      setLoading(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      completeCycle(
        activeTimer.cycleId,
        result,
        photoUri,
        note.trim() || undefined,
        new Date().toISOString()
      );

      addConsumption(activeTimer.cycleId, 'pack', 'Крафт-пакет');

      if (activeTimer.notificationId) {
        await cancelNotification(activeTimer.notificationId);
      }

      setActiveTimer(null);
      setSaved(true);
    } catch (e) {
      Alert.alert('Помилка', 'Не вдалося зберегти результат');
    } finally {
      setLoading(false);
    }
  };

  if (saved) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center px-6">
        <View className="w-16 h-16 rounded-full bg-green-100 items-center justify-center mb-4">
          <Check size={32} color={COLORS.success} strokeWidth={2.5} />
        </View>
        <Text className="text-2xl font-bold text-[#1B1B1B] mb-2">Збережено!</Text>
        <Text className="text-sm text-text-secondary text-center mb-8">
          Цикл стерилізації зафіксовано в журналі
        </Text>

        <View className="w-full gap-3">
          <Button
            label="На головну"
            onPress={() => router.replace('/')}
          />
          <Button
            label="Потрібні матеріали?"
            onPress={() => router.replace('/(tabs)/catalog')}
            variant="outline"
            icon={<ShoppingBag size={16} color={COLORS.primary} />}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
        <Text className="text-xl font-bold text-[#1B1B1B]">Результат</Text>
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
        {/* Photo picker */}
        <View className="mb-5">
          <Text className="text-sm font-medium text-[#1B1B1B] mb-2">Фото індикатора</Text>
          <TouchableOpacity
            onPress={handlePickPhoto}
            className="rounded-2xl overflow-hidden"
            activeOpacity={0.8}
          >
            {photoUri ? (
              <Image
                source={{ uri: photoUri }}
                className="w-full h-48 rounded-2xl"
                resizeMode="cover"
              />
            ) : (
              <View className="h-40 bg-surface border-2 border-dashed border-border rounded-2xl items-center justify-center gap-2">
                <View className="w-12 h-12 rounded-full bg-primary-light items-center justify-center">
                  <Camera size={22} color={COLORS.primary} />
                </View>
                <Text className="text-sm text-text-secondary">Натисніть, щоб додати фото</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Result selection */}
        <View className="mb-5">
          <Text className="text-sm font-medium text-[#1B1B1B] mb-2">
            Результат індикатора <Text className="text-error">*</Text>
          </Text>
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={() => setResult('passed')}
              className={`flex-1 h-16 rounded-xl items-center justify-center border-2 gap-1 ${
                result === 'passed'
                  ? 'border-success bg-green-50'
                  : 'border-border bg-surface'
              }`}
              activeOpacity={0.8}
            >
              <View className={`w-6 h-6 rounded-full items-center justify-center ${result === 'passed' ? 'bg-success' : 'bg-border'}`}>
                <Check size={14} color={COLORS.white} strokeWidth={2.5} />
              </View>
              <Text
                className={`text-sm font-semibold ${
                  result === 'passed' ? 'text-success' : 'text-text-secondary'
                }`}
              >
                Спрацював
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setResult('failed')}
              className={`flex-1 h-16 rounded-xl items-center justify-center border-2 gap-1 ${
                result === 'failed'
                  ? 'border-error bg-red-50'
                  : 'border-border bg-surface'
              }`}
              activeOpacity={0.8}
            >
              <View className={`w-6 h-6 rounded-full border-2 items-center justify-center ${result === 'failed' ? 'border-error bg-red-50' : 'border-border'}`}>
                <X size={14} color={result === 'failed' ? COLORS.error : COLORS.textTertiary} strokeWidth={2.5} />
              </View>
              <Text
                className={`text-sm font-semibold ${
                  result === 'failed' ? 'text-error' : 'text-text-secondary'
                }`}
              >
                Не спрацював
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Note */}
        <View className="mb-6">
          <Input
            label="Примітка (необов'язково)"
            value={note}
            onChangeText={setNote}
            placeholder="Додаткова інформація..."
            multiline
            numberOfLines={3}
          />
        </View>

        <Button
          label="Зберегти"
          onPress={handleSave}
          loading={loading}
          haptic
        />
      </ScrollView>
    </SafeAreaView>
  );
}
