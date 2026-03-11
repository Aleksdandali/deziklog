import React from 'react';
import { View, Text } from 'react-native';
import { COLORS } from '@/lib/constants';

interface StatsBlockProps {
  total: number;
  passed: number;
  failed: number;
}

interface StatCardProps {
  label: string;
  value: number;
  color: string;
  bgColor: string;
}

function StatCard({ label, value, color, bgColor }: StatCardProps) {
  return (
    <View className="flex-1 rounded-2xl p-3 items-center" style={{ backgroundColor: bgColor }}>
      <Text className="text-2xl font-bold" style={{ color }}>
        {value}
      </Text>
      <Text className="text-xs text-text-secondary text-center mt-0.5 leading-4">{label}</Text>
    </View>
  );
}

export function StatsBlock({ total, passed, failed }: StatsBlockProps) {
  return (
    <View className="flex-row gap-3">
      <StatCard
        label="Всього"
        value={total}
        color={COLORS.primary}
        bgColor={COLORS.primaryLight}
      />
      <StatCard
        label="Успішних"
        value={passed}
        color={COLORS.success}
        bgColor="#E8F5E9"
      />
      <StatCard
        label="Невдалих"
        value={failed}
        color={COLORS.error}
        bgColor="#FFEBEE"
      />
    </View>
  );
}
