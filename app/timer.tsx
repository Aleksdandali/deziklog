import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { X, Flame, Wind, BookOpen } from 'lucide-react-native';

import { cancelCycle } from '@/lib/db';
import { cancelNotification } from '@/lib/notifications';
import { useAppStore } from '@/lib/store';
import { COLORS, STERILIZATION_TIPS } from '@/lib/constants';

import { TimerRing } from '@/components/TimerRing';
import { Button } from '@/components/ui/Button';

function getRemainingSeconds(startedAt: string, durationMinutes: number): number {
  const endTime = new Date(startedAt).getTime() + durationMinutes * 60 * 1000;
  return Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
}

export default function TimerScreen() {
  const router = useRouter();
  const { activeTimer, setActiveTimer } = useAppStore();

  const [remaining, setRemaining] = useState(0);
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * STERILIZATION_TIPS.length));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tipIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalSeconds = (activeTimer?.durationMinutes ?? 0) * 60;

  useEffect(() => {
    if (!activeTimer) {
      router.replace('/');
      return;
    }

    const updateTimer = () => {
      const r = getRemainingSeconds(activeTimer.startedAt, activeTimer.durationMinutes);
      setRemaining(r);
    };

    updateTimer();
    intervalRef.current = setInterval(updateTimer, 1000);
    tipIntervalRef.current = setInterval(() => {
      setTipIndex((i) => (i + 1) % STERILIZATION_TIPS.length);
    }, 30000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (tipIntervalRef.current) clearInterval(tipIntervalRef.current);
    };
  }, [activeTimer]);

  const handleCancel = () => {
    Alert.alert(
      'Скасувати цикл?',
      'Цикл буде позначено як скасований.',
      [
        { text: 'Ні', style: 'cancel' },
        {
          text: 'Скасувати цикл',
          style: 'destructive',
          onPress: async () => {
            if (activeTimer) {
              try {
                cancelCycle(activeTimer.cycleId);
                if (activeTimer.notificationId) {
                  await cancelNotification(activeTimer.notificationId);
                }
              } catch {}
              setActiveTimer(null);
            }
            router.replace('/');
          },
        },
      ]
    );
  };

  const handleComplete = () => {
    router.replace('/complete-cycle');
  };

  if (!activeTimer) return null;

  const isDryHeat = activeTimer.durationMinutes >= 60;
  const tip = STERILIZATION_TIPS[tipIndex];
  const isFinished = remaining === 0;

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
        <Text className="text-xl font-bold text-[#1B1B1B]">Стерилізація</Text>
        <TouchableOpacity
          onPress={handleCancel}
          className="w-9 h-9 rounded-full bg-surface items-center justify-center"
          activeOpacity={0.8}
        >
          <X size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 32, alignItems: 'center' }}
        showsVerticalScrollIndicator={false}
      >
        {/* Timer Ring */}
        <View className="mt-6 mb-8">
          <TimerRing
            totalSeconds={totalSeconds}
            remainingSeconds={remaining}
            size={240}
          />
        </View>

        {/* Info Card */}
        <View className="w-full bg-surface rounded-2xl p-4 mb-6">
          <View className="flex-row items-center gap-2 mb-3">
            <View className="w-8 h-8 rounded-full bg-primary-light items-center justify-center">
              {isDryHeat ? (
                <Flame size={16} color={COLORS.primary} />
              ) : (
                <Wind size={16} color={COLORS.primary} />
              )}
            </View>
            <Text className="text-base font-semibold text-[#1B1B1B]">
              {activeTimer.sterilizerName}
            </Text>
          </View>

          <View className="flex-row gap-4">
            <View>
              <Text className="text-xs text-text-secondary">Температура</Text>
              <Text className="text-base font-bold text-[#1B1B1B]">{activeTimer.temperature}°C</Text>
            </View>
            <View>
              <Text className="text-xs text-text-secondary">Тривалість</Text>
              <Text className="text-base font-bold text-[#1B1B1B]">{activeTimer.durationMinutes} хв</Text>
            </View>
          </View>

          {activeTimer.instruments ? (
            <View className="mt-3 pt-3 border-t border-border">
              <Text className="text-xs text-text-secondary">Інструменти</Text>
              <Text className="text-sm text-[#1B1B1B] mt-0.5">{activeTimer.instruments}</Text>
            </View>
          ) : null}
        </View>

        {/* Tip Block */}
        <View className="w-full bg-primary-light rounded-2xl p-4 mb-6 border border-primary/10">
          <Text className="text-xs font-semibold text-primary mb-2">Порада</Text>
          <Text className="text-sm text-[#1B1B1B] leading-5">{tip.text}</Text>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/catalog')}
            className="flex-row items-center gap-1 mt-3"
            activeOpacity={0.7}
          >
            <BookOpen size={14} color={COLORS.primary} />
            <Text className="text-xs font-semibold text-primary">Більше порад → Матеріали</Text>
          </TouchableOpacity>
        </View>

        {/* Buttons */}
        <View className="w-full gap-3">
          <Button
            label="Завершити"
            onPress={handleComplete}
            disabled={!isFinished}
            haptic
          />
          <Button
            label="Скасувати"
            onPress={handleCancel}
            variant="danger"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
