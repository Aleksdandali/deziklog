import React from 'react';
import { View, Text, TouchableOpacity, Linking } from 'react-native';
import { ShoppingBag, X } from 'lucide-react-native';
import { COLORS } from '@/lib/constants';

interface SmartSuggestionProps {
  message: string;
  buyUrl: string;
  onDismiss?: () => void;
}

export function SmartSuggestion({ message, buyUrl, onDismiss }: SmartSuggestionProps) {
  return (
    <View className="bg-primary-light rounded-2xl p-4 border border-primary/20">
      <View className="flex-row items-start gap-3">
        <View className="w-9 h-9 rounded-full bg-primary items-center justify-center flex-shrink-0 mt-0.5">
          <ShoppingBag size={16} color={COLORS.white} />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-semibold text-[#1B1B1B] mb-1">Час поповнити запаси</Text>
          <Text className="text-sm text-text-secondary leading-5">{message}</Text>
          <TouchableOpacity
            onPress={() => Linking.openURL(buyUrl)}
            className="mt-3 bg-primary rounded-xl h-10 items-center justify-center"
            activeOpacity={0.85}
          >
            <Text className="text-white text-sm font-semibold">Замовити зі знижкою 10%</Text>
          </TouchableOpacity>
        </View>
        {onDismiss && (
          <TouchableOpacity onPress={onDismiss} className="p-1">
            <X size={16} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
