import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { X, Check, Plus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { getSterilizers, addCycle } from '@/lib/db';
import { scheduleTimerNotification } from '@/lib/notifications';
import { useAppStore } from '@/lib/store';
import { COLORS, STERILIZATION_MODES } from '@/lib/constants';
import type { Sterilizer, SterilizationType } from '@/lib/types';

import { Select } from '@/components/ui/Select';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

type ModeId = string;

interface CustomMode {
  temp: string;
  duration: string;
}

export default function NewCycleScreen() {
  const router = useRouter();
  const setActiveTimer = useAppStore((s) => s.setActiveTimer);

  const [sterilizers, setSterilizers] = useState<Sterilizer[]>([]);
  const [sterilizerId, setSterilizerId] = useState('');
  const [type, setType] = useState<SterilizationType>('dry_heat');
  const [selectedModeId, setSelectedModeId] = useState<ModeId>('');
  const [customMode, setCustomMode] = useState(false);
  const [customValues, setCustomValues] = useState<CustomMode>({ temp: '', duration: '' });
  const [instruments, setInstruments] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const list = getSterilizers();
    setSterilizers(list);
    if (list.length > 0) {
      setSterilizerId(list[0].id);
      setType(list[0].type);
    }
  }, []);

  const modes = STERILIZATION_MODES[type];

  const handleTypeChange = (t: SterilizationType) => {
    setType(t);
    setSelectedModeId('');
    setCustomMode(false);
  };

  const handleSterilizerChange = (id: string) => {
    setSterilizerId(id);
    const s = sterilizers.find((x) => x.id === id);
    if (s) {
      setType(s.type);
      setSelectedModeId('');
      setCustomMode(false);
    }
  };

  const handleStart = async () => {
    if (!sterilizerId) {
      Alert.alert('Оберіть стерилізатор');
      return;
    }

    let temp: number;
    let duration: number;

    if (customMode) {
      temp = parseInt(customValues.temp, 10);
      duration = parseInt(customValues.duration, 10);
      if (isNaN(temp) || isNaN(duration) || temp <= 0 || duration <= 0) {
        Alert.alert('Введіть коректну температуру та час');
        return;
      }
    } else {
      if (!selectedModeId) {
        Alert.alert('Оберіть режим стерилізації');
        return;
      }
      const allModes = [...STERILIZATION_MODES.dry_heat, ...STERILIZATION_MODES.autoclave];
      const mode = allModes.find((m) => m.id === selectedModeId);
      if (!mode) return;
      temp = mode.temp;
      duration = mode.duration;
    }

    try {
      setLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      const sterilizer = sterilizers.find((s) => s.id === sterilizerId)!;
      const startedAt = new Date().toISOString();

      const cycleId = addCycle({
        sterilizerId,
        sterilizationType: type,
        temperature: temp,
        durationMinutes: duration,
        instruments: instruments.trim() || undefined,
        startedAt,
        status: 'running',
      });

      const notificationId = await scheduleTimerNotification(duration);

      setActiveTimer({
        cycleId,
        sterilizerId,
        sterilizerName: sterilizer.name,
        temperature: temp,
        durationMinutes: duration,
        startedAt,
        instruments: instruments.trim() || undefined,
        notificationId,
      });

      router.replace('/timer');
    } catch (e) {
      Alert.alert('Помилка', 'Не вдалося розпочати цикл');
    } finally {
      setLoading(false);
    }
  };

  const sterilizerOptions = sterilizers.map((s) => ({
    value: s.id,
    label: `${s.name} (${s.type === 'dry_heat' ? 'Сухожар' : 'Автоклав'})`,
  }));

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
        <Text className="text-xl font-bold text-[#1B1B1B]">Новий цикл</Text>
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
        {/* Sterilizer */}
        <View className="mb-5">
          {sterilizers.length === 0 ? (
            <View>
              <Text className="text-sm font-medium text-[#1B1B1B] mb-2">Стерилізатор</Text>
              <TouchableOpacity
                onPress={() => router.push('/sterilizer/add')}
                className="h-12 bg-surface border border-dashed border-primary/50 rounded-xl items-center justify-center flex-row gap-2"
                activeOpacity={0.8}
              >
                <Plus size={16} color={COLORS.primary} />
                <Text className="text-sm font-semibold text-primary">Додати стерилізатор</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <Select
                label="Стерилізатор"
                value={sterilizerId}
                options={sterilizerOptions}
                onSelect={handleSterilizerChange}
              />
              <TouchableOpacity
                onPress={() => router.push('/sterilizer/add')}
                className="mt-2 flex-row items-center gap-1"
                activeOpacity={0.7}
              >
                <Plus size={14} color={COLORS.primary} />
                <Text className="text-xs font-semibold text-primary">Додати ще один</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Type */}
        <View className="mb-5">
          <Text className="text-sm font-medium text-[#1B1B1B] mb-2">Тип стерилізації</Text>
          <SegmentedControl
            options={[
              { label: 'Сухожар', value: 'dry_heat' },
              { label: 'Автоклав', value: 'autoclave' },
            ]}
            value={type}
            onChange={handleTypeChange}
          />
        </View>

        {/* Mode */}
        <View className="mb-5">
          <Text className="text-sm font-medium text-[#1B1B1B] mb-2">Режим</Text>
          <View className="gap-2">
            {modes.map((mode) => {
              const active = selectedModeId === mode.id && !customMode;
              return (
                <TouchableOpacity
                  key={mode.id}
                  onPress={() => {
                    setSelectedModeId(mode.id);
                    setCustomMode(false);
                  }}
                  className={`h-14 rounded-xl px-4 flex-row items-center justify-between border ${
                    active
                      ? 'border-primary bg-primary-light'
                      : 'border-border bg-surface'
                  }`}
                  activeOpacity={0.8}
                >
                  <Text
                    className={`text-base font-semibold ${active ? 'text-primary' : 'text-[#1B1B1B]'}`}
                  >
                    {mode.label}
                  </Text>
                  {active && <Check size={18} color={COLORS.primary} />}
                </TouchableOpacity>
              );
            })}

            {/* Custom mode */}
            <TouchableOpacity
              onPress={() => {
                setCustomMode(true);
                setSelectedModeId('');
              }}
              className={`h-14 rounded-xl px-4 flex-row items-center justify-between border border-dashed ${
                customMode ? 'border-primary bg-primary-light' : 'border-border bg-surface'
              }`}
              activeOpacity={0.8}
            >
              <Text
                className={`text-base font-semibold ${customMode ? 'text-primary' : 'text-text-secondary'}`}
              >
                Свій режим
              </Text>
              {customMode && <Check size={18} color={COLORS.primary} />}
            </TouchableOpacity>

            {customMode && (
              <View className="flex-row gap-3 mt-1">
                <View className="flex-1">
                  <Input
                    label="Температура (°C)"
                    value={customValues.temp}
                    onChangeText={(v) => setCustomValues((c) => ({ ...c, temp: v }))}
                    placeholder="180"
                    keyboardType="numeric"
                  />
                </View>
                <View className="flex-1">
                  <Input
                    label="Час (хвилини)"
                    value={customValues.duration}
                    onChangeText={(v) => setCustomValues((c) => ({ ...c, duration: v }))}
                    placeholder="60"
                    keyboardType="numeric"
                  />
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Instruments */}
        <View className="mb-6">
          <Input
            label="Інструменти (необов'язково)"
            value={instruments}
            onChangeText={setInstruments}
            placeholder="Кусачки, пушер, фрези..."
          />
        </View>

        <Button
          label="Старт"
          onPress={handleStart}
          loading={loading}
          haptic
        />
      </ScrollView>
    </SafeAreaView>
  );
}
