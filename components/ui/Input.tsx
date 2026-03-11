import React, { useState } from 'react';
import { View, TextInput, Text, TextInputProps } from 'react-native';
import { COLORS } from '@/lib/constants';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  multiline?: boolean;
  numberOfLines?: number;
}

export function Input({ label, error, hint, multiline, numberOfLines = 3, style, ...props }: InputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View className="gap-1">
      {label && (
        <Text className="text-sm font-medium text-[#1B1B1B] mb-1">{label}</Text>
      )}
      <TextInput
        {...props}
        multiline={multiline}
        numberOfLines={multiline ? numberOfLines : undefined}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        placeholderTextColor={COLORS.textTertiary}
        className={`bg-surface rounded-xl px-4 py-3 text-base text-[#1B1B1B] border ${
          error ? 'border-error' : focused ? 'border-primary' : 'border-border'
        } ${multiline ? 'min-h-[80px]' : 'h-12'}`}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={style}
      />
      {error && <Text className="text-xs text-error mt-1">{error}</Text>}
      {hint && !error && <Text className="text-xs text-text-secondary mt-1">{hint}</Text>}
    </View>
  );
}
