import React from 'react';
import { View, Text } from 'react-native';
import { ClipboardList } from 'lucide-react-native';
import { COLORS } from '@/lib/constants';

interface EmptyStateProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
}

export function EmptyState({ title, subtitle, icon }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center py-16 px-8">
      <View className="w-16 h-16 rounded-full bg-primary-light items-center justify-center mb-4">
        {icon || <ClipboardList size={28} color={COLORS.primary} />}
      </View>
      <Text className="text-lg font-semibold text-[#1B1B1B] text-center mb-2">{title}</Text>
      {subtitle && (
        <Text className="text-sm text-text-secondary text-center leading-5">{subtitle}</Text>
      )}
    </View>
  );
}
