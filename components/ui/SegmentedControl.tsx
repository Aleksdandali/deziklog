import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface Option<T extends string> {
  label: string;
  value: T;
}

interface SegmentedControlProps<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <View className="flex-row bg-surface rounded-xl p-1 gap-1">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onChange(opt.value)}
            className={`flex-1 h-10 items-center justify-center rounded-lg ${
              active ? 'bg-primary shadow-sm' : ''
            }`}
            activeOpacity={0.8}
          >
            <Text className={`text-sm font-semibold ${active ? 'text-white' : 'text-text-secondary'}`}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
