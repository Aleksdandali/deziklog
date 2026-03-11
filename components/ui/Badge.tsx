import React from 'react';
import { View, Text } from 'react-native';

type BadgeVariant = 'success' | 'error' | 'primary' | 'warning' | 'neutral';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

export function Badge({ label, variant = 'primary' }: BadgeProps) {
  const styles: Record<BadgeVariant, string> = {
    success: 'bg-green-100',
    error: 'bg-red-100',
    primary: 'bg-primary-light',
    warning: 'bg-yellow-100',
    neutral: 'bg-gray-100',
  };

  const textStyles: Record<BadgeVariant, string> = {
    success: 'text-success',
    error: 'text-error',
    primary: 'text-primary',
    warning: 'text-warning',
    neutral: 'text-text-secondary',
  };

  return (
    <View className={`px-2.5 py-1 rounded-full self-start ${styles[variant]}`}>
      <Text className={`text-xs font-semibold ${textStyles[variant]}`}>{label}</Text>
    </View>
  );
}
