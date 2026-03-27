import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth-context';
import { COLORS, FONT, RADIUS, SHADOW, MS_PER_DAY } from '../../lib/constants';
import { getCached, setCache } from '../../lib/cache';
import type { SterilizationSession } from '../../lib/api';
import type { Solution } from '../../lib/types';
import { SkeletonEntryCard } from '../../components/Skeleton';
import Skeleton from '../../components/Skeleton';
import ActiveTimerWidget from '../../components/ActiveTimerWidget';

function formatDuration(minutes: number | null): string {
  if (minutes == null) return '--';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}г ${m}хв`;
  return `${m} хв`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

export default function HomeScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [sessions, setSessions] = useState<SterilizationSession[]>([]);
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [profileName, setProfileName] = useState('');
  const [salonName, setSalonName] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  const loadData = useCallback(async (isRefresh = false) => {
    if (!userId) return;
    if (isRefresh) setRefreshing(true);

    if (initialLoad) {
      const [cachedSessions, cachedProfile, cachedSolutions] = await Promise.all([
        getCached<SterilizationSession[]>(`home_sessions_${userId}`),
        getCached<{ name: string; salon_name: string }>(`home_profile_${userId}`),
        getCached<Solution[]>(`home_solutions_${userId}`),
      ]);
      if (cachedSessions) setSessions(cachedSessions);
      if (cachedProfile) { setProfileName(cachedProfile.name); setSalonName(cachedProfile.salon_name); }
      if (cachedSolutions) setSolutions(cachedSolutions);
      if (cachedSessions || cachedProfile) setInitialLoad(false);
    }

    try {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const [sessRes, profileRes] = await Promise.all([
        supabase
          .from('sterilization_sessions').select('*')
          .eq('user_id', userId).eq('status', 'completed')
          .gte('created_at', startOfMonth.toISOString())
          .order('created_at', { ascending: false }),
        supabase
          .from('profiles').select('name, salon_name')
          .eq('id', userId).maybeSingle(),
      ]);

      const newSessions = sessRes.data ?? [];
      setSessions(newSessions);
      setCache(`home_sessions_${userId}`, newSessions);

      if (profileRes.data) {
        setProfileName(profileRes.data.name ?? '');
        setSalonName(profileRes.data.salon_name ?? '');
        setCache(`home_profile_${userId}`, { name: profileRes.data.name ?? '', salon_name: profileRes.data.salon_name ?? '' });
      }

      const solDetailRes = await supabase
        .from('solutions').select('*')
        .eq('user_id', userId)
        .order('expires_at', { ascending: true }).limit(5);
      const newSolutions = solDetailRes.data ?? [];
      setSolutions(newSolutions);
      setCache(`home_solutions_${userId}`, newSolutions);
    } catch (err) {
      console.warn('Home: failed to load data:', err);
    } finally {
      setRefreshing(false);
      setInitialLoad(false);
    }
  }, [userId, initialLoad]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const todaySessions = sessions.filter((s) => new Date(s.created_at) >= startOfDay);
  const firstName = profileName.split(' ')[0] || '';

  return (
    <SafeAreaView style={s.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor={COLORS.brand} />}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {/* Header */}
        <View style={s.header}>
          {initialLoad && !profileName ? (
            <>
              <Skeleton width={200} height={28} borderRadius={RADIUS.sm} />
              <Skeleton width={140} height={14} borderRadius={6} style={{ marginTop: 8 }} />
            </>
          ) : (
            <>
              <Text style={s.greeting}>
                {firstName ? `Привіт, ${firstName}` : 'Привіт'}
              </Text>
              {salonName ? <Text style={s.salon}>{salonName}</Text> : null}
            </>
          )}
        </View>

        {/* Active Timer */}
        <View style={s.section}>
          <ActiveTimerWidget />
        </View>

        {/* Main CTA */}
        <View style={s.section}>
          <TouchableOpacity
            activeOpacity={0.92}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push('/new-cycle');
            }}
            style={s.ctaCard}
          >
            <View style={s.ctaIconWrap}>
              <Feather name="plus" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.ctaTitle}>Новий цикл</Text>
              <Text style={s.ctaSubtitle}>Розпочати стерилізацію</Text>
            </View>
            <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={s.section}>
          <View style={s.statsRow}>
            <View style={s.statCard}>
              <Text style={s.statValue}>{todaySessions.length}</Text>
              <Text style={s.statLabel}>Сьогодні</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statValue}>{sessions.length}</Text>
              <Text style={s.statLabel}>Цей місяць</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statValue}>{solutions.length}</Text>
              <Text style={s.statLabel}>Розчинів</Text>
            </View>
          </View>
        </View>

        {/* Recent */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Останні записи</Text>
            {sessions.length > 3 && (
              <TouchableOpacity onPress={() => router.push('/(tabs)/journal')} activeOpacity={0.7}>
                <Text style={s.seeAll}>Всі</Text>
              </TouchableOpacity>
            )}
          </View>

          {initialLoad && sessions.length === 0 ? (
            <>
              <SkeletonEntryCard />
              <SkeletonEntryCard />
            </>
          ) : sessions.length === 0 ? (
            <View style={s.emptyCard}>
              <Feather name="clipboard" size={28} color={COLORS.textTertiary} />
              <Text style={s.emptyTitle}>Записів поки немає</Text>
              <Text style={s.emptyText}>Запустіть перший цикл стерилізації</Text>
            </View>
          ) : (
            sessions.slice(0, 3).map((sess) => {
              const passed = sess.result === 'success';
              return (
                <View key={sess.id} style={s.entryCard}>
                  <View style={[s.entryDot, { backgroundColor: passed ? COLORS.success : COLORS.danger }]} />
                  <View style={s.entryBody}>
                    <Text style={s.entryInstruments} numberOfLines={1}>{sess.instrument_names}</Text>
                    <Text style={s.entryMeta}>{sess.packet_type} · {sess.sterilizer_name}</Text>
                  </View>
                  <View style={s.entryRight}>
                    <Text style={s.entryDuration}>{formatDuration(sess.duration_minutes)}</Text>
                    <Text style={s.entryTime}>{formatTime(sess.created_at)}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Solutions */}
        {solutions.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Розчини</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/solutions')} activeOpacity={0.7}>
                <Text style={s.seeAll}>Всі</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {solutions.map((sol) => {
                const expiresMs = new Date(sol.expires_at).getTime();
                const daysLeft = isNaN(expiresMs) ? 0 : Math.ceil((expiresMs - Date.now()) / MS_PER_DAY);
                const isExpired = isNaN(expiresMs) || daysLeft <= 0;
                const isWarning = !isExpired && daysLeft <= 3;
                const dotColor = isExpired ? COLORS.danger : isWarning ? COLORS.warning : COLORS.success;

                return (
                  <View key={sol.id} style={s.solCard}>
                    <View style={s.solTop}>
                      <View style={[s.solDot, { backgroundColor: dotColor }]} />
                      <Text style={s.solName} numberOfLines={1}>{sol.name}</Text>
                    </View>
                    <Text style={s.solDays}>
                      {isExpired ? 'Прострочено' : `${daysLeft} дн.`}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  // Header
  header: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 4 },
  greeting: { fontSize: 28, fontFamily: FONT.bold, color: COLORS.text, letterSpacing: -0.5 },
  salon: { fontSize: 15, fontFamily: FONT.regular, color: COLORS.textSecondary, marginTop: 4 },

  section: { paddingHorizontal: 24, marginTop: 24 },

  // CTA
  ctaCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    paddingVertical: 20, paddingHorizontal: 20,
    borderRadius: RADIUS.lg, backgroundColor: COLORS.brand,
    ...SHADOW.md,
  },
  ctaIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  ctaTitle: { fontSize: 17, fontFamily: FONT.semibold, color: '#fff' },
  ctaSubtitle: { fontSize: 13, fontFamily: FONT.regular, color: 'rgba(255,255,255,0.7)', marginTop: 2 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    paddingVertical: 16, paddingHorizontal: 12, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  statValue: { fontSize: 28, fontFamily: FONT.bold, color: COLORS.text },
  statLabel: { fontSize: 12, fontFamily: FONT.medium, color: COLORS.textSecondary, marginTop: 4 },

  // Section header
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontFamily: FONT.semibold, color: COLORS.text },
  seeAll: { fontSize: 14, fontFamily: FONT.medium, color: COLORS.brand },

  // Entry cards
  entryCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 16,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 8,
  },
  entryDot: { width: 8, height: 8, borderRadius: 4 },
  entryBody: { flex: 1 },
  entryInstruments: { fontSize: 15, fontFamily: FONT.medium, color: COLORS.text },
  entryMeta: { fontSize: 13, fontFamily: FONT.regular, color: COLORS.textSecondary, marginTop: 2 },
  entryRight: { alignItems: 'flex-end' },
  entryDuration: { fontSize: 15, fontFamily: FONT.bold, color: COLORS.text, fontVariant: ['tabular-nums'] },
  entryTime: { fontSize: 12, fontFamily: FONT.regular, color: COLORS.textTertiary, marginTop: 2 },

  // Empty
  emptyCard: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    padding: 32, alignItems: 'center', gap: 8,
  },
  emptyTitle: { fontSize: 16, fontFamily: FONT.semibold, color: COLORS.text },
  emptyText: { fontSize: 13, fontFamily: FONT.regular, color: COLORS.textSecondary },

  // Solutions
  solCard: {
    width: 140, backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: 16,
  },
  solTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  solDot: { width: 8, height: 8, borderRadius: 4 },
  solName: { fontSize: 14, fontFamily: FONT.medium, color: COLORS.text, flex: 1 },
  solDays: { fontSize: 13, fontFamily: FONT.regular, color: COLORS.textSecondary },
});
