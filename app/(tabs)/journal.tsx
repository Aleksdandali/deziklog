import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { FileText } from 'lucide-react-native';

import { getCycles, getSterilizers, getProfile } from '@/lib/db';
import { generateSterilizationPDF } from '@/lib/pdf';
import { COLORS } from '@/lib/constants';
import type { Cycle, Sterilizer } from '@/lib/types';

import { CycleCard } from '@/components/CycleCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';

const PERIOD_OPTIONS = [
  { value: 'week', label: 'Тиждень' },
  { value: 'month', label: 'Місяць' },
  { value: 'quarter', label: 'Квартал' },
  { value: 'year', label: 'Рік' },
  { value: 'all', label: 'Все' },
];

export default function JournalScreen() {
  const router = useRouter();
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [sterilizers, setSterilizers] = useState<Sterilizer[]>([]);
  const [period, setPeriod] = useState('month');
  const [sterilizerId, setSterilizerId] = useState('all');
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(() => {
    try {
      const allSterilizers = getSterilizers();
      setSterilizers(allSterilizers);

      const filteredCycles = getCycles({
        period: period === 'all' ? undefined : period,
        sterilizerId: sterilizerId === 'all' ? undefined : sterilizerId,
      });
      setCycles(filteredCycles);
    } catch (e) {
      console.error('Journal load error:', e);
    }
  }, [period, sterilizerId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleExportPDF = async () => {
    try {
      setLoading(true);
      const profile = getProfile();
      const periodLabel = PERIOD_OPTIONS.find((p) => p.value === period)?.label ?? '';
      await generateSterilizationPDF(cycles, profile, periodLabel);
    } catch (e) {
      Alert.alert('Помилка', 'Не вдалося створити PDF');
    } finally {
      setLoading(false);
    }
  };

  const sterilizerOptions = [
    { value: 'all', label: 'Всі стерилізатори' },
    ...sterilizers.map((s) => ({ value: s.id, label: s.name })),
  ];

  const periodLabel = PERIOD_OPTIONS.find((p) => p.value === period)?.label ?? '';

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
        <Text className="text-2xl font-bold text-[#1B1B1B]">Журнал</Text>
        <TouchableOpacity
          onPress={handleExportPDF}
          disabled={loading || cycles.length === 0}
          className={`flex-row items-center gap-2 bg-primary-light rounded-xl px-3 py-2 ${
            loading || cycles.length === 0 ? 'opacity-40' : ''
          }`}
          activeOpacity={0.8}
        >
          <FileText size={16} color={COLORS.primary} />
          <Text className="text-sm font-semibold text-primary">PDF</Text>
        </TouchableOpacity>
      </View>

      {/* Filters */}
      <View className="px-4 pb-3">
        {/* Period filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-3"
          contentContainerStyle={{ gap: 8 }}
        >
          {PERIOD_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              onPress={() => setPeriod(opt.value)}
              className={`px-4 py-2 rounded-full border ${
                period === opt.value
                  ? 'bg-primary border-primary'
                  : 'bg-white border-border'
              }`}
              activeOpacity={0.8}
            >
              <Text
                className={`text-sm font-semibold ${
                  period === opt.value ? 'text-white' : 'text-text-secondary'
                }`}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Sterilizer filter */}
        {sterilizers.length > 0 && (
          <Select
            value={sterilizerId}
            options={sterilizerOptions}
            onSelect={setSterilizerId}
          />
        )}
      </View>

      {/* Counter */}
      {cycles.length > 0 && (
        <View className="px-4 mb-2">
          <Text className="text-sm text-text-secondary">
            {cycles.length} {cycles.length === 1 ? 'запис' : cycles.length < 5 ? 'записи' : 'записів'} · {periodLabel.toLowerCase()}
          </Text>
        </View>
      )}

      {/* List */}
      <FlatList
        data={cycles}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <CycleCard cycle={item} onPress={() => router.push(`/journal/${item.id}`)} />
        )}
        contentContainerStyle={{ padding: 16, paddingTop: 0 }}
        ListEmptyComponent={
          <EmptyState
            title="Записів ще немає"
            subtitle="Розпочніть новий цикл стерилізації та він з'явиться тут"
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}
