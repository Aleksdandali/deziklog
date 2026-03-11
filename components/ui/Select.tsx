import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, SafeAreaView } from 'react-native';
import { ChevronDown, Check, X } from 'lucide-react-native';
import { COLORS } from '@/lib/constants';

export interface SelectOption {
  label: string;
  value: string;
}

interface SelectProps {
  label?: string;
  value?: string;
  options: SelectOption[];
  placeholder?: string;
  onSelect: (value: string) => void;
}

export function Select({ label, value, options, placeholder = 'Оберіть...', onSelect }: SelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View className="gap-1">
      {label && <Text className="text-sm font-medium text-[#1B1B1B] mb-1">{label}</Text>}
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
        className="h-12 bg-surface border border-border rounded-xl px-4 flex-row items-center justify-between"
      >
        <Text className={selected ? 'text-base text-[#1B1B1B]' : 'text-base text-text-tertiary'}>
          {selected ? selected.label : placeholder}
        </Text>
        <ChevronDown size={18} color={COLORS.textSecondary} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View className="flex-1 bg-black/40 justify-end">
          <SafeAreaView className="bg-white rounded-t-3xl">
            <View className="flex-row items-center justify-between px-5 pt-5 pb-3 border-b border-border">
              <Text className="text-lg font-semibold text-[#1B1B1B]">
                {label || 'Оберіть варіант'}
              </Text>
              <TouchableOpacity onPress={() => setOpen(false)} className="p-1">
                <X size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={options}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    onSelect(item.value);
                    setOpen(false);
                  }}
                  className="flex-row items-center justify-between px-5 py-4 border-b border-border/50"
                  activeOpacity={0.7}
                >
                  <Text
                    className={`text-base ${
                      item.value === value ? 'text-primary font-semibold' : 'text-[#1B1B1B]'
                    }`}
                  >
                    {item.label}
                  </Text>
                  {item.value === value && <Check size={18} color={COLORS.primary} />}
                </TouchableOpacity>
              )}
              contentContainerStyle={{ paddingBottom: 20 }}
            />
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}
