import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Bell, ChevronRight } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { getProfile, getMonthlyStats, getRecentCycles, getSmartSuggestion } from '@/lib/db';
import { COLORS } from '@/lib/constants';
import { useAppStore } from '@/lib/store';
import type { Cycle, UserProfile } from '@/lib/types';

import { ActiveTimerWidget } from '@/components/ActiveTimerWidget';
import { StatsBlock } from '@/components/StatsBlock';
import { CycleCard } from '@/components/CycleCard';
import { SmartSuggestion } from '@/components/SmartSuggestion';

export default function HomeScreen() {
  const router = useRouter();
  const activeTimer = useAppStore((s) => s.activeTimer);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState({ total: 0, passed: 0, failed: 0 });
  const [recentCycles, setRecentCycles] = useState<Cycle[]>([]);
  const [suggestion, setSuggestion] = useState<{ type: string; message: string; buyUrl: string } | null>(null);
  const [dismissedSuggestion, setDismissedSuggestion] = useState(false);

  useFocusEffect(
    useCallback(() => {
      try {
        const p = getProfile();
        setProfile(p);

        const now = new Date();
        const s = getMonthlyStats(now.getFullYear(), now.getMonth() + 1);
        setStats({
          total: s?.total ?? 0,
          passed: s?.passed ?? 0,
          failed: s?.failed ?? 0,
        });

        setRecentCycles(getRecentCycles(3));
        setSuggestion(getSmartSuggestion());
        setDismissedSuggestion(false);
      } catch (e) {
        console.error('Home load error:', e);
      }
    }, [])
  );

  const handleNewCycle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/new-cycle');
  };

  const now = new Date();
  const month = now.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' });

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between mb-6">
          <View>
            <Text className="text-sm text-text-secondary font-medium">Dezik Log</Text>
            <Text className="text-2xl font-bold text-[#1B1B1B] mt-0.5">
              {profile?.name ? `Привіт, ${profile.name.split(' ')[0]}!` : 'Привіт!'}
            </Text>
          </View>
          <TouchableOpacity
            className="w-10 h-10 rounded-full bg-white items-center justify-center shadow-sm"
            activeOpacity={0.8}
          >
            <Bell size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* CTA Button */}
        <TouchableOpacity
          onPress={handleNewCycle}
          activeOpacity={0.85}
          className="rounded-2xl overflow-hidden mb-4 shadow-sm"
          style={{
            shadowColor: COLORS.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 8,
            elevation: 5,
          }}
        >
          <LinearGradient
            colors={[COLORS.primary, COLORS.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            className="h-16 flex-row items-center justify-center gap-2 px-6"
          >
            <Text className="text-white text-lg font-bold">+ Новий цикл стерилізації</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Active Timer Widget */}
        {activeTimer && (
          <View className="mb-4">
            <ActiveTimerWidget />
          </View>
        )}

        {/* Stats */}
        <View className="mb-4">
          <Text className="text-sm font-semibold text-text-secondary mb-2 capitalize">{month}</Text>
          <StatsBlock
            total={stats.total}
            passed={stats.passed}
            failed={stats.failed}
          />
        </View>

        {/* Recent Cycles */}
        <View className="mb-4">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-base font-bold text-[#1B1B1B]">Останні записи</Text>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/journal')}
              className="flex-row items-center gap-1"
              activeOpacity={0.7}
            >
              <Text className="text-sm font-semibold text-primary">Всі</Text>
              <ChevronRight size={14} color={COLORS.primary} />
            </TouchableOpacity>
          </View>

          {recentCycles.length === 0 ? (
            <View className="bg-white rounded-2xl p-6 items-center">
              <Text className="text-text-secondary text-sm text-center">
                Немає записів. Розпочніть перший цикл стерилізації.
              </Text>
            </View>
          ) : (
            recentCycles.map((cycle) => (
              <CycleCard
                key={cycle.id}
                cycle={cycle}
                onPress={() => router.push(`/journal/${cycle.id}`)}
              />
            ))
          )}
        </View>

        {/* Smart Suggestion */}
        {suggestion && !dismissedSuggestion && (
          <SmartSuggestion
            message={suggestion.message}
            buyUrl={suggestion.buyUrl}
            onDismiss={() => setDismissedSuggestion(true)}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
