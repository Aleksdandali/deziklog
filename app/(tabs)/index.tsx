import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../_layout';
import { COLORS } from '../../lib/constants';

interface CycleRow {
  id: string;
  instrument_name: string;
  sterilizer_name: string;
  packet_type: string;
  duration_minutes: number | null;
  result: string | null;
  created_at: string;
}

function formatDuration(minutes: number | null): string {
  if (!minutes) return '--';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}г ${m}хв`;
  return `${m} хв`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('uk-UA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

export default function HomeScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [cycles, setCycles] = useState<CycleRow[]>([]);
  const [solutionCount, setSolutionCount] = useState(0);
  const [instrumentCount, setInstrumentCount] = useState(0);
  const [solutions, setSolutions] = useState<any[]>([]);

  useFocusEffect(useCallback(() => {
    if (!userId) return;
    (async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const [cycleRes, solRes, instrRes] = await Promise.all([
        supabase
          .from('sterilization_cycles')
          .select('*')
          .eq('user_id', userId)
          .gte('created_at', startOfMonth.toISOString())
          .order('created_at', { ascending: false }),
        supabase
          .from('solutions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId),
        supabase
          .from('instruments')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId),
      ]);

      if (cycleRes.error) console.error('Cycles error:', cycleRes.error.message);
      if (solRes.error) console.error('Solutions error:', solRes.error.message);
      if (instrRes.error) console.error('Instruments error:', instrRes.error.message);

      setCycles(cycleRes.data ?? []);
      setSolutionCount(solRes.count ?? 0);
      setInstrumentCount(instrRes.count ?? 0);

      const solDetailRes = await supabase
        .from('solutions')
        .select('*')
        .eq('user_id', userId)
        .order('expires_at', { ascending: true })
        .limit(5);
      setSolutions(solDetailRes.data ?? []);
    })();
  }, [userId]));

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const todayCycles = cycles.filter(c => new Date(c.created_at) >= startOfDay);
  const monthCycles = cycles;

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <LinearGradient colors={[COLORS.brand, COLORS.brandDark]} style={styles.hero}>
          <SafeAreaView>
            <View style={styles.heroContent}>
              <Text style={styles.heroTitle}>Dezik Log</Text>
              <Text style={styles.heroSubtitle}>Журнал стерилізації</Text>

              <View style={styles.counters}>
                <CounterBox icon={<Feather name="clipboard" size={18} color={COLORS.white} />} value={todayCycles.length} label="Сьогодні" />
                <CounterBox icon={<Feather name="calendar" size={18} color={COLORS.white} />} value={monthCycles.length} label="Цей місяць" />
                <CounterBox icon={<Ionicons name="water-outline" size={18} color={COLORS.white} />} value={solutionCount} label="Розчинів" />
              </View>
            </View>
          </SafeAreaView>
        </LinearGradient>

        <View style={styles.body}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push('/cycle');
            }}
          >
            <LinearGradient colors={[COLORS.brand, COLORS.brandDark]} style={styles.ctaButton} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Feather name="plus" size={22} color={COLORS.white} />
              <Text style={styles.ctaText}>Новий цикл стерилізації</Text>
            </LinearGradient>
          </TouchableOpacity>

          {instrumentCount === 0 && (
            <TouchableOpacity
              style={styles.onboardCard}
              onPress={() => router.push('/cabinet/instruments')}
              activeOpacity={0.85}
            >
              <View style={styles.onboardIcon}>
                <Feather name="scissors" size={24} color={COLORS.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.onboardTitle}>Додайте інструменти</Text>
                <Text style={styles.onboardText}>Вкажіть, які інструменти ви стерилізуєте — вони з'являться у wizard</Text>
              </View>
              <Feather name="chevron-right" size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
          )}

          {instrumentCount > 0 && cycles.length === 0 && (
            <View style={styles.onboardCard}>
              <View style={styles.onboardIcon}>
                <Feather name="play-circle" size={24} color={COLORS.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.onboardTitle}>Все готово!</Text>
                <Text style={styles.onboardText}>Натисніть "Новий цикл" щоб записати першу стерилізацію</Text>
              </View>
            </View>
          )}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Останні записи</Text>
            {cycles.length > 0 && (
              <TouchableOpacity onPress={() => router.push('/(tabs)/journal')} style={styles.seeAll}>
                <Text style={styles.seeAllText}>Всі</Text>
                <Feather name="chevron-right" size={14} color={COLORS.brand} />
              </TouchableOpacity>
            )}
          </View>

          {cycles.length === 0 ? (
            <View style={styles.emptyCard}>
              <Feather name="clipboard" size={36} color={COLORS.textSecondary} />
              <Text style={styles.emptyTitle}>Записів поки немає</Text>
              <Text style={styles.emptyText}>Розпочніть перший цикл стерилізації</Text>
            </View>
          ) : (
            cycles.slice(0, 3).map((cycle) => {
              const passed = cycle.result === 'passed';
              return (
                <View key={cycle.id} style={styles.cycleCard}>
                  <View style={styles.cycleCardLeft}>
                    <View style={[styles.statusDot, { backgroundColor: passed ? COLORS.success : COLORS.danger }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cycleInstruments} numberOfLines={1}>{cycle.instrument_name}</Text>
                      <Text style={styles.cycleMeta}>{cycle.packet_type} · {cycle.sterilizer_name}</Text>
                    </View>
                  </View>
                  <View style={styles.cycleCardRight}>
                    <Text style={styles.cycleTime}>{formatDuration(cycle.duration_minutes)}</Text>
                    <Text style={styles.cycleDate}>{formatDate(cycle.created_at)}</Text>
                  </View>
                </View>
              );
            })
          )}

          {solutions.length > 0 && (
            <View>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Розчини</Text>
                <TouchableOpacity onPress={() => router.push('/(tabs)/solutions')} style={styles.seeAll}>
                  <Text style={styles.seeAllText}>Всі</Text>
                  <Feather name="chevron-right" size={14} color={COLORS.brand} />
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {solutions.map((sol) => {
                  const daysLeft = Math.ceil((new Date(sol.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  const isExpired = daysLeft < 0;
                  const isWarning = daysLeft <= 3 && daysLeft >= 0;
                  const statusColor = isExpired ? COLORS.danger : isWarning ? COLORS.warning : COLORS.success;
                  const statusText = isExpired ? 'Прострочено' : isWarning ? 'Закінчується' : 'Активний';

                  return (
                    <View key={sol.id} style={styles.solutionCard}>
                      <Text style={styles.solutionName} numberOfLines={1}>{sol.name}</Text>
                      <View style={[styles.solutionPill, { backgroundColor: statusColor + '18' }]}>
                        <Text style={[styles.solutionPillText, { color: statusColor }]}>{statusText}</Text>
                      </View>
                      <Text style={styles.solutionDays}>
                        {isExpired ? 'Термін вийшов' : `Залишилось ${daysLeft} дн.`}
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function CounterBox({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <View style={styles.counterBox}>
      {icon}
      <Text style={styles.counterValue}>{value}</Text>
      <Text style={styles.counterLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  hero: { paddingBottom: 28, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  heroContent: { paddingHorizontal: 20, paddingTop: 16 },
  heroTitle: { fontSize: 26, fontWeight: '800', color: COLORS.white },
  heroSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 2, fontWeight: '500' },
  counters: { flexDirection: 'row', gap: 12, marginTop: 20 },
  counterBox: { flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, padding: 12, alignItems: 'center', gap: 4 },
  counterValue: { fontSize: 22, fontWeight: '700', color: COLORS.white },
  counterLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: '500' },
  body: { padding: 16, paddingBottom: 32 },
  ctaButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 56, borderRadius: 14, gap: 10, shadowColor: COLORS.brand, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 },
  ctaText: { fontSize: 16, fontWeight: '700', color: COLORS.white },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { fontSize: 13, fontWeight: '600', color: COLORS.brand },
  emptyCard: { backgroundColor: COLORS.white, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 32, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginTop: 4 },
  emptyText: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 19 },
  cycleCard: { backgroundColor: COLORS.white, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  cycleCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 12 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  cycleInstruments: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  cycleMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  cycleCardRight: { alignItems: 'flex-end' },
  cycleTime: { fontSize: 15, fontWeight: '700', color: COLORS.text, fontVariant: ['tabular-nums'] },
  cycleDate: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  onboardCard: { 
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.white, borderRadius: 14, borderWidth: 1, 
    borderColor: COLORS.border, padding: 16, marginBottom: 12 
  },
  onboardIcon: { 
    width: 48, height: 48, borderRadius: 12, backgroundColor: COLORS.cardBg, 
    alignItems: 'center', justifyContent: 'center' 
  },
  onboardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  onboardText: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },
  solutionCard: { width: 150, backgroundColor: COLORS.white, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 14 },
  solutionName: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 8 },
  solutionPill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginBottom: 8 },
  solutionPillText: { fontSize: 11, fontWeight: '600' },
  solutionDays: { fontSize: 12, color: COLORS.textSecondary },
});
