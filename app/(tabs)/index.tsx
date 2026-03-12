import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Plus, ClipboardList, Droplets, Package, ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';

const BRAND = '#4b569e';
const BRAND_DARK = '#363f75';
const COLORS = {
  bg: '#f5f6fa', white: '#FFFFFF', text: '#1B1B1B', textSecondary: '#6B7280',
  success: '#43A047', danger: '#E53935', border: '#e2e4ed', brand: BRAND,
};

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
  if (!minutes) return '—';
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
  const [cycles, setCycles] = useState<CycleRow[]>([]);
  const [solutionCount, setSolutionCount] = useState(0);
  const [instrumentCount, setInstrumentCount] = useState(0);

  useFocusEffect(useCallback(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;

      const [cycleRes, solRes, instrRes] = await Promise.all([
        supabase
          .from('sterilization_cycles')
          .select('*')
          .eq('user_id', uid)
          .order('created_at', { ascending: false })
          .limit(3),
        supabase
          .from('solutions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', uid),
        supabase
          .from('instruments')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', uid),
      ]);

      setCycles(cycleRes.data ?? []);
      setSolutionCount(solRes.count ?? 0);
      setInstrumentCount(instrRes.count ?? 0);
    })();
  }, []));

  const totalCycles = cycles.length;

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <LinearGradient colors={[BRAND, BRAND_DARK]} style={styles.hero}>
          <SafeAreaView>
            <View style={styles.heroContent}>
              <Text style={styles.heroTitle}>Dezik Log</Text>
              <Text style={styles.heroSubtitle}>Журнал стерилізації</Text>

              <View style={styles.counters}>
                <CounterBox icon={<ClipboardList size={18} color={COLORS.white} strokeWidth={1.8} />} value={totalCycles} label="Циклів" />
                <CounterBox icon={<Package size={18} color={COLORS.white} strokeWidth={1.8} />} value={instrumentCount} label="Інструментів" />
                <CounterBox icon={<Droplets size={18} color={COLORS.white} strokeWidth={1.8} />} value={solutionCount} label="Розчинів" />
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
            <LinearGradient colors={[BRAND, BRAND_DARK]} style={styles.ctaButton} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Plus size={22} color={COLORS.white} strokeWidth={2.5} />
              <Text style={styles.ctaText}>Новий цикл стерилізації</Text>
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Останні записи</Text>
            {cycles.length > 0 && (
              <TouchableOpacity onPress={() => router.push('/(tabs)/journal')} style={styles.seeAll}>
                <Text style={styles.seeAllText}>Всі</Text>
                <ChevronRight size={14} color={COLORS.brand} />
              </TouchableOpacity>
            )}
          </View>

          {cycles.length === 0 ? (
            <View style={styles.emptyCard}>
              <ClipboardList size={36} color={COLORS.textSecondary} strokeWidth={1.5} />
              <Text style={styles.emptyTitle}>Записів поки немає</Text>
              <Text style={styles.emptyText}>Розпочніть перший цикл стерилізації — натисніть кнопку вгорі</Text>
            </View>
          ) : (
            cycles.map((cycle) => {
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
  ctaButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 56, borderRadius: 14, gap: 10, shadowColor: BRAND, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 },
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
});
