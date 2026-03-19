import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, SafeAreaView, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { CheckCircle2, XCircle } from 'lucide-react-native';
import * as Sharing from 'expo-sharing';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth-context';
import { COLORS } from '../../lib/constants';
import { getCached, setCache } from '../../lib/cache';
import { generateJournalPDF } from '../../lib/pdf-export';
import { getProfile, type SterilizationSession } from '../../lib/api';
import { SkeletonEntryCard } from '../../components/Skeleton';
import { calcActualMinutes, getDurationStatus } from '../../lib/steri-config';

function formatDuration(minutes: number | null): string {
  if (minutes == null) return '--';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}г ${m}хв`;
  return `${m} хв`;
}

function formatDateGroup(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
  } catch { return ''; }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function groupByDate(sessions: SterilizationSession[]): { date: string; data: SterilizationSession[] }[] {
  const map = new Map<string, SterilizationSession[]>();
  for (const s of sessions) {
    const key = new Date(s.created_at).toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  return Array.from(map.entries()).map(([_, data]) => ({
    date: formatDateGroup(data[0].created_at),
    data,
  }));
}

export default function JournalScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const userId = session?.user?.id;
  const [sessions, setSessions] = useState<SterilizationSession[]>([]);
  const [exporting, setExporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  const loadJournal = useCallback(async (isRefresh = false) => {
    if (!userId) return;
    if (isRefresh) setRefreshing(true);

    if (initialLoad) {
      const cached = await getCached<SterilizationSession[]>(`journal_${userId}`);
      if (cached) { setSessions(cached); setInitialLoad(false); }
    }

    try {
      const { data } = await supabase
        .from('sterilization_sessions')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['completed', 'failed'])
        .order('created_at', { ascending: false });
      const result = data ?? [];
      setSessions(result);
      setCache(`journal_${userId}`, result);
    } catch {} finally {
      setRefreshing(false);
      setInitialLoad(false);
    }
  }, [userId, initialLoad]);

  useFocusEffect(useCallback(() => { loadJournal(); }, [loadJournal]));

  const handleExportPDF = async () => {
    if (sessions.length === 0) { Alert.alert('Немає записів'); return; }
    setExporting(true);
    try {
      const profile = userId ? await getProfile(userId) : null;
      const pdfData: import('../../lib/types').SterilizationCycle[] = sessions.map((s) => ({
        id: s.id, user_id: s.user_id, instrument_id: null, sterilizer_id: s.sterilizer_id,
        instrument_name: s.instrument_names, sterilizer_name: s.sterilizer_name,
        packet_type: s.packet_type, duration_minutes: s.duration_minutes,
        temperature: s.temperature, result: s.result === 'success' ? 'passed' : 'failed',
        notes: null, started_at: s.started_at || s.created_at, created_at: s.created_at,
      }));
      const uri = await generateJournalPDF(pdfData, profile?.salon_name ?? undefined);
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Журнал стерилізації', UTI: 'com.adobe.pdf' });
    } catch {
      Alert.alert('Помилка', 'Не вдалось створити PDF');
    } finally {
      setExporting(false);
    }
  };

  const groups = groupByDate(sessions);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <View>
          <Text style={s.title}>Журнал</Text>
          <Text style={s.subtitle}>Контроль стерилізації</Text>
        </View>
        {sessions.length > 0 && (
          <TouchableOpacity style={s.exportBtn} onPress={handleExportPDF} disabled={exporting} activeOpacity={0.7}>
            <Feather name="download" size={18} color={exporting ? COLORS.textSecondary : COLORS.brand} />
          </TouchableOpacity>
        )}
      </View>

      {initialLoad && sessions.length === 0 ? (
        <View style={{ paddingHorizontal: 24, paddingTop: 20 }}>
          <SkeletonEntryCard />
          <SkeletonEntryCard />
          <SkeletonEntryCard />
        </View>
      ) : groups.length === 0 ? (
        <View style={s.empty}>
          <Feather name="clipboard" size={48} color={COLORS.textSecondary} />
          <Text style={s.emptyTitle}>Записів поки немає</Text>
          <Text style={s.emptyText}>Після стерилізації записи з'являться тут</Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.date}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadJournal(true)} tintColor={COLORS.brand} />}
          renderItem={({ item: group }) => (
            <View>
              <Text style={s.dateHeader}>{group.date}</Text>
              {group.data.map((sess) => {
                const passed = sess.result === 'success';

                return (
                  <TouchableOpacity
                    key={sess.id}
                    style={s.card}
                    activeOpacity={0.7}
                    onPress={() => router.push(`/cycle/${sess.id}`)}
                  >
                    <View style={s.cardRow}>
                      <View style={[s.cardIcon, { backgroundColor: passed ? '#43A04718' : '#E5393518' }]}>
                        {passed
                          ? <CheckCircle2 size={14} color={COLORS.success} />
                          : <XCircle size={14} color={COLORS.danger} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.cardInstruments} numberOfLines={1}>{sess.instrument_names}</Text>
                        <Text style={s.cardMeta}>{sess.pouch_size && sess.pouch_size !== 'none' ? sess.pouch_size : sess.packet_type} · {sess.sterilizer_name}</Text>
                      </View>
                      <View style={s.cardRight}>
                        {(() => {
                          const actual = calcActualMinutes(sess.started_at, sess.ended_at);
                          const recommended = sess.duration_minutes;
                          const displayMin = actual ?? recommended;
                          const dStatus = actual !== null && recommended
                            ? getDurationStatus(actual, recommended)
                            : null;
                          const dotColor = dStatus === 'sufficient' ? COLORS.success
                            : dStatus === 'insufficient' ? COLORS.danger
                            : undefined;
                          return (
                            <>
                              <View style={s.durationRow}>
                                {dotColor && <View style={[s.durationDot, { backgroundColor: dotColor }]} />}
                                <Text style={s.cardDuration}>{formatDuration(displayMin)}</Text>
                              </View>
                              <Text style={s.cardTime}>{formatTime(sess.created_at)}</Text>
                            </>
                          );
                        })()}
                      </View>
                      <Feather name="chevron-right" size={16} color={COLORS.textTertiary} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 12 },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.text },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 2 },
  exportBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginTop: 16 },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },

  dateHeader: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, letterSpacing: 0.5, marginTop: 20, marginBottom: 12 },

  card: { backgroundColor: COLORS.white, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  cardIcon: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  cardInstruments: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  cardMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  cardRight: { alignItems: 'flex-end' },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  durationDot: { width: 7, height: 7, borderRadius: 4 },
  cardDuration: { fontSize: 15, fontWeight: '700', color: COLORS.text, fontVariant: ['tabular-nums'] },
  cardTime: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },

});
