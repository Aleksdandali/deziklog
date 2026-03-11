import React from 'react';
import { View, TouchableOpacity } from 'react-native';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onPress?: () => void;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({ children, className = '', onPress, padding = 'md' }: CardProps) {
  const paddingClass = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-5',
  }[padding];

  const base = `bg-white rounded-2xl shadow-sm ${paddingClass} ${className}`;

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} className={base}>
        {children}
      </TouchableOpacity>
    );
  }

  return <View className={base}>{children}</View>;
}
