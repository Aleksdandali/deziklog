import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { CheckCircle, XCircle, Clock, Flame, Wind } from 'lucide-react-native';
import { COLORS } from '@/lib/constants';
import type { Cycle } from '@/lib/types';

interface CycleCardProps {
  cycle: Cycle;
  onPress?: () => void;
}

function formatDateTime(iso: string): { date: string; time: string } {
  try {
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' }),
      time: d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }),
    };
  } catch {
    return { date: '', time: '' };
  }
}

export function CycleCard({ cycle, onPress }: CycleCardProps) {
  const { date, time } = formatDateTime(cycle.startedAt);
  const isPassed = cycle.indicatorResult === 'passed';
  const isFailed = cycle.indicatorResult === 'failed';
  const isRunning = cycle.status === 'running';
  const isDryHeat = cycle.sterilizationType === 'dry_heat';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className="bg-white rounded-2xl p-4 mb-3 shadow-sm"
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <View className="flex-row items-center gap-2 mb-1">
            <View className="w-7 h-7 rounded-full bg-primary-light items-center justify-center">
              {isDryHeat ? (
                <Flame size={14} color={COLORS.primary} />
              ) : (
                <Wind size={14} color={COLORS.primary} />
              )}
            </View>
            <Text className="text-base font-semibold text-[#1B1B1B]" numberOfLines={1}>
              {cycle.sterilizerName || 'Стерилізатор'}
            </Text>
          </View>

          <Text className="text-sm text-text-secondary mb-2">
            {cycle.temperature}°C · {cycle.durationMinutes} хв
            {isDryHeat ? ' · Сухожар' : ' · Автоклав'}
          </Text>

          {cycle.instruments ? (
            <Text className="text-sm text-text-secondary" numberOfLines={1}>
              {cycle.instruments}
            </Text>
          ) : null}
        </View>

        <View className="items-end ml-3">
          <Text className="text-sm font-semibold text-[#1B1B1B]">{date}</Text>
          <Text className="text-xs text-text-secondary mb-2">{time}</Text>

          {isRunning ? (
            <View className="flex-row items-center gap-1 bg-yellow-100 rounded-full px-2 py-0.5">
              <Clock size={12} color={COLORS.warning} />
              <Text className="text-xs font-semibold text-warning">В процесі</Text>
            </View>
          ) : isPassed ? (
            <View className="flex-row items-center gap-1 bg-green-100 rounded-full px-2 py-0.5">
              <CheckCircle size={12} color={COLORS.success} />
              <Text className="text-xs font-semibold text-success">Спрацював</Text>
            </View>
          ) : isFailed ? (
            <View className="flex-row items-center gap-1 bg-red-100 rounded-full px-2 py-0.5">
              <XCircle size={12} color={COLORS.error} />
              <Text className="text-xs font-semibold text-error">Не спрацював</Text>
            </View>
          ) : (
            <View className="bg-gray-100 rounded-full px-2 py-0.5">
              <Text className="text-xs font-semibold text-text-secondary">Завершено</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}
