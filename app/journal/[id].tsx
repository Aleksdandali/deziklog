import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Image,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, CheckCircle, XCircle, Clock, Flame, Wind, Package, ShoppingBag } from 'lucide-react-native';

import { getCycle } from '@/lib/db';
import { COLORS } from '@/lib/constants';
import type { Cycle } from '@/lib/types';
import { Badge } from '@/components/ui/Badge';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('uk-UA', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

export default function JournalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [cycle, setCycle] = useState<Cycle | null>(null);

  useEffect(() => {
    if (!id) return;
    setCycle(getCycle(id));
  }, [id]);

  if (!cycle) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center">
        <Text className="text-text-secondary">Запис не знайдено</Text>
      </SafeAreaView>
    );
  }

  const isPassed = cycle.indicatorResult === 'passed';
  const isFailed = cycle.indicatorResult === 'failed';
  const isRunning = cycle.status === 'running';
  const isDryHeat = cycle.sterilizationType === 'dry_heat';

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {/* Header */}
      <View className="flex-row items-center gap-3 px-4 pt-4 pb-2">
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-9 h-9 rounded-full bg-white items-center justify-center shadow-sm"
          activeOpacity={0.8}
        >
          <ChevronLeft size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-[#1B1B1B] flex-1">Деталі запису</Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Status banner */}
        {isPassed && (
          <View className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-4 flex-row items-center gap-3">
            <CheckCircle size={24} color={COLORS.success} />
            <Text className="text-base font-semibold text-success">Індикатор спрацював</Text>
          </View>
        )}
        {isFailed && (
          <View className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4 flex-row items-center gap-3">
            <XCircle size={24} color={COLORS.error} />
            <Text className="text-base font-semibold text-error">Індикатор не спрацював</Text>
          </View>
        )}
        {isRunning && (
          <View className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 mb-4 flex-row items-center gap-3">
            <Clock size={24} color={COLORS.warning} />
            <Text className="text-base font-semibold text-warning">В процесі</Text>
          </View>
        )}

        {/* Indicator photo */}
        {cycle.indicatorPhotoUri && (
          <View className="mb-4">
            <Text className="text-sm font-semibold text-text-secondary mb-2">Фото індикатора</Text>
            <Image
              source={{ uri: cycle.indicatorPhotoUri }}
              className="w-full h-52 rounded-2xl"
              resizeMode="cover"
            />
          </View>
        )}

        {/* Main info */}
        <View className="bg-white rounded-2xl p-4 mb-4">
          <View className="flex-row items-center gap-2 mb-4">
            <View className="w-9 h-9 rounded-full bg-primary-light items-center justify-center">
              {isDryHeat ? (
                <Flame size={18} color={COLORS.primary} />
              ) : (
                <Wind size={18} color={COLORS.primary} />
              )}
            </View>
            <View>
              <Text className="text-base font-bold text-[#1B1B1B]">
                {cycle.sterilizerName || 'Стерилізатор'}
              </Text>
              <Text className="text-xs text-text-secondary">
                {isDryHeat ? 'Сухожар' : 'Автоклав'}
              </Text>
            </View>
          </View>

          <View className="gap-3">
            <InfoRow label="Дата початку" value={formatDate(cycle.startedAt)} />
            {cycle.completedAt && (
              <InfoRow label="Дата завершення" value={formatDate(cycle.completedAt)} />
            )}
            <InfoRow label="Температура" value={`${cycle.temperature}°C`} />
            <InfoRow label="Тривалість" value={`${cycle.durationMinutes} хвилин`} />
            {cycle.instruments && (
              <InfoRow label="Інструменти" value={cycle.instruments} />
            )}
            {cycle.note && (
              <InfoRow label="Примітка" value={cycle.note} />
            )}
          </View>
        </View>

        {/* Materials suggestion block */}
        <View className="bg-primary-light rounded-2xl p-4 border border-primary/10">
          <Text className="text-sm font-semibold text-[#1B1B1B] mb-3">Потрібні матеріали?</Text>

          <View className="gap-2">
            <TouchableOpacity
              onPress={() => router.push('/catalog/kraft-packs')}
              className="flex-row items-center gap-3 bg-white rounded-xl p-3"
              activeOpacity={0.8}
            >
              <Package size={18} color={COLORS.primary} />
              <Text className="text-sm font-semibold text-primary flex-1">Пакети для стерилізації</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => Linking.openURL('https://dezik.com.ua/paketi-dlya-sterilizacii/?utm_source=deziklog&utm_medium=app&utm_campaign=journal_detail')}
              className="flex-row items-center gap-3 bg-primary rounded-xl p-3"
              activeOpacity={0.85}
            >
              <ShoppingBag size={18} color={COLORS.white} />
              <Text className="text-sm font-semibold text-white flex-1">Замовити на dezik.com.ua</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-start justify-between gap-4">
      <Text className="text-sm text-text-secondary flex-shrink-0">{label}</Text>
      <Text className="text-sm font-medium text-[#1B1B1B] flex-1 text-right">{value}</Text>
    </View>
  );
}
