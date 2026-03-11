import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Timer, ChevronRight } from 'lucide-react-native';
import { COLORS } from '@/lib/constants';
import { useAppStore } from '@/lib/store';

function formatRemaining(startedAt: string, durationMinutes: number): string {
  const endTime = new Date(startedAt).getTime() + durationMinutes * 60 * 1000;
  const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function ActiveTimerWidget() {
  const router = useRouter();
  const activeTimer = useAppStore((s) => s.activeTimer);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!activeTimer) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [activeTimer]);

  if (!activeTimer) return null;

  const remaining = formatRemaining(activeTimer.startedAt, activeTimer.durationMinutes);

  return (
    <TouchableOpacity
      onPress={() => router.push('/timer')}
      activeOpacity={0.85}
      className="bg-primary rounded-2xl p-4 flex-row items-center gap-3"
    >
      <View className="w-10 h-10 rounded-full bg-white/20 items-center justify-center">
        <Timer size={20} color={COLORS.white} />
      </View>
      <View className="flex-1">
        <Text className="text-white/80 text-xs font-medium">Стерилізація в процесі</Text>
        <Text className="text-white text-base font-semibold mt-0.5">
          {activeTimer.sterilizerName}
        </Text>
      </View>
      <View className="items-end gap-1">
        <Text className="text-white text-xl font-bold" style={{ fontVariant: ['tabular-nums'] }}>
          {remaining}
        </Text>
        <View className="flex-row items-center gap-1">
          <Text className="text-white/70 text-xs">Відкрити</Text>
          <ChevronRight size={12} color="rgba(255,255,255,0.7)" />
        </View>
      </View>
    </TouchableOpacity>
  );
}
