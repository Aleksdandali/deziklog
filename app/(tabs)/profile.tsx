import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Switch,
  Alert,
  Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Trash2, ChevronRight } from 'lucide-react-native';

import { getProfile, updateProfile, clearAllData } from '@/lib/db';
import { COLORS } from '@/lib/constants';
import type { UserProfile } from '@/lib/types';

import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';

const INTERVAL_OPTIONS = [
  { value: '1', label: '1 година' },
  { value: '2', label: '2 години' },
  { value: '3', label: '3 години' },
  { value: '4', label: '4 години' },
  { value: '6', label: '6 годин' },
  { value: '8', label: '8 годин' },
];

export default function ProfileScreen() {
  const [profile, setProfile] = useState<UserProfile>({
    name: '',
    language: 'uk',
    reminderEnabled: true,
    reminderIntervalHours: 2,
  });
  const [saved, setSaved] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const p = getProfile();
      setProfile(p);
    }, [])
  );

  const handleSave = () => {
    try {
      updateProfile(profile);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      Alert.alert('Помилка', 'Не вдалося зберегти профіль');
    }
  };

  const handlePickLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setProfile((p) => ({ ...p, salonLogoUri: result.assets[0].uri }));
    }
  };

  const handleClearData = () => {
    Alert.alert(
      'Видалити всі дані?',
      'Ця дія незворотна. Всі записи журналу та стерилізатори будуть видалені.',
      [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Видалити',
          style: 'destructive',
          onPress: () => {
            try {
              clearAllData();
              Alert.alert('Готово', 'Всі дані видалено');
            } catch {
              Alert.alert('Помилка', 'Не вдалося видалити дані');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-2xl font-bold text-[#1B1B1B] mb-6">Профіль</Text>

        {/* Avatar / Logo */}
        <View className="items-center mb-6">
          <TouchableOpacity onPress={handlePickLogo} activeOpacity={0.8}>
            {profile.salonLogoUri ? (
              <Image
                source={{ uri: profile.salonLogoUri }}
                className="w-24 h-24 rounded-full"
              />
            ) : (
              <View className="w-24 h-24 rounded-full bg-primary-light items-center justify-center">
                <Camera size={32} color={COLORS.primary} />
              </View>
            )}
            <View className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-primary items-center justify-center">
              <Camera size={14} color={COLORS.white} />
            </View>
          </TouchableOpacity>
          <Text className="text-xs text-text-secondary mt-2">Логотип салону</Text>
        </View>

        {/* Personal Info */}
        <View className="bg-white rounded-2xl p-4 gap-4 mb-4">
          <Text className="text-base font-semibold text-[#1B1B1B]">Особиста інформація</Text>
          <Input
            label="Ім'я"
            value={profile.name}
            onChangeText={(v) => setProfile((p) => ({ ...p, name: v }))}
            placeholder="Ім'я та прізвище"
          />
          <Input
            label="Телефон"
            value={profile.phone ?? ''}
            onChangeText={(v) => setProfile((p) => ({ ...p, phone: v }))}
            placeholder="+380 XX XXX XX XX"
            keyboardType="phone-pad"
          />
          <Input
            label="Email"
            value={profile.email ?? ''}
            onChangeText={(v) => setProfile((p) => ({ ...p, email: v }))}
            placeholder="email@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        {/* Salon Info */}
        <View className="bg-white rounded-2xl p-4 gap-4 mb-4">
          <Text className="text-base font-semibold text-[#1B1B1B]">Інформація про салон</Text>
          <Input
            label="Назва салону"
            value={profile.salonName ?? ''}
            onChangeText={(v) => setProfile((p) => ({ ...p, salonName: v }))}
            placeholder="Nail Studio..."
          />
          <Input
            label="Адреса"
            value={profile.salonAddress ?? ''}
            onChangeText={(v) => setProfile((p) => ({ ...p, salonAddress: v }))}
            placeholder="вул. Хрещатик, 1, Київ"
          />
        </View>

        {/* Reminders */}
        <View className="bg-white rounded-2xl p-4 gap-4 mb-4">
          <Text className="text-base font-semibold text-[#1B1B1B]">Нагадування</Text>
          <View className="flex-row items-center justify-between">
            <Text className="text-base text-[#1B1B1B]">Нагадувати про стерилізацію</Text>
            <Switch
              value={profile.reminderEnabled}
              onValueChange={(v) => setProfile((p) => ({ ...p, reminderEnabled: v }))}
              trackColor={{ false: COLORS.border, true: COLORS.primary }}
              thumbColor={COLORS.white}
            />
          </View>
          {profile.reminderEnabled && (
            <Select
              label="Інтервал"
              value={String(profile.reminderIntervalHours)}
              options={INTERVAL_OPTIONS}
              onSelect={(v) => setProfile((p) => ({ ...p, reminderIntervalHours: Number(v) }))}
            />
          )}
        </View>

        {/* Save Button */}
        <Button
          label={saved ? 'Збережено!' : 'Зберегти'}
          onPress={handleSave}
          haptic
        />

        {/* Language (stub) */}
        <View className="bg-white rounded-2xl p-4 mt-4">
          <TouchableOpacity className="flex-row items-center justify-between" activeOpacity={0.7}>
            <Text className="text-base text-[#1B1B1B]">Мова</Text>
            <View className="flex-row items-center gap-2">
              <Text className="text-sm text-text-secondary">Українська</Text>
              <ChevronRight size={16} color={COLORS.textSecondary} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Danger Zone */}
        <TouchableOpacity
          onPress={handleClearData}
          className="mt-6 items-center"
          activeOpacity={0.7}
        >
          <View className="flex-row items-center gap-2">
            <Trash2 size={14} color={COLORS.error} />
            <Text className="text-sm text-error">Видалити всі дані</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
