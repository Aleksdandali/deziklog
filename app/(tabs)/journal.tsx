import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, SafeAreaView, TouchableOpacity,
  Alert, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import ViewShot from 'react-native-view-shot';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth-context';
import { COLORS } from '../../lib/constants';
import { RADII } from '../../lib/theme';
import { getCached, setCache } from '../../lib/cache';
import { generateJournalPDF } from '../../lib/pdf-export';
import { getProfile, type SterilizationSession } from '../../lib/api';
import { SkeletonEntryCard } from '../../components/Skeleton';
import { calcActualMinutes, getDurationStatus } from '../../lib/steri-config';
import { shareToInstagramStory } from '../../lib/share-instagram';
import StoryCard from '../../components/StoryCard';

type FilterType = 'all' | 'success' | 'fail';

function formatDuration(minutes: number | null): string {
  if (minutes == null) return '--';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}г ${m}хв`;
  return `${m} хв`;
}

function formatDateGroup(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = (today.getTime() - target.getTime()) / 86400000;

    if (diff === 0) return 'Сьогодні';
    if (diff === 1) return 'Вчора';
    return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return ''; }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function groupByDate(sessions: SterilizationSession[]): { date: string; dateKey: string; count: number; data: SterilizationSession[] }[] {
  const map = new Map<string, SterilizationSession[]>();
  for (const s of sessions) {
    const key = new Date(s.created_at).toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  return Array.from(map.entries()).map(([key, data]) => ({
    date: formatDateGroup(data[0].created_at),
    dateKey: key,
    count: data.length,
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
  const [filter, setFilter] = useState<FilterType>('all');
  const [sharingCycle, setSharingCycle] = useState<SterilizationSession | null>(null);
  const [profileInfo, setProfileInfo] = useState<{ salon_name: string | null; city: string | null }>({ salon_name: null, city: null });
  const storyRef = useRef<ViewShot>(null);

  // Load profile for story card
  useFocusEffect(useCallback(() => {
    if (!userId) return;
    supabase.from('profiles').select('salon_name, city').eq('id', userId).single()
      .then(({ data }) => { if (data) setProfileInfo(data); });
  }, [userId]));

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
    } catch (err) {
      console.warn('Journal: failed to load sessions:', err);
    } finally {
      setRefreshing(false);
      setInitialLoad(false);
    }
  }, [userId, initialLoad]);

  useFocusEffect(useCallback(() => { loadJournal(); }, [loadJournal]));

  // Stats
  const stats = useMemo(() => {
    const total = sessions.length;
    const passed = sessions.filter((s) => s.result === 'success').length;
    const failed = total - passed;
    const rate = total > 0 ? Math.round((passed / total) * 100) : 0;
    return { total, passed, failed, rate };
  }, [sessions]);

  // Filtered sessions
  const filteredSessions = useMemo(() => {
    if (filter === 'all') return sessions;
    return sessions.filter((s) => s.result === (filter === 'success' ? 'success' : 'fail'));
  }, [sessions, filter]);

  const groups = useMemo(() => groupByDate(filteredSessions), [filteredSessions]);

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

  // Share cycle to Instagram
  React.useEffect(() => {
    if (!sharingCycle || !storyRef.current) return;
    const timer = setTimeout(async () => {
      try {
        const uri = await storyRef.current!.capture!();
        if (uri) await shareToInstagramStory(uri);
      } catch (err) {
        console.error('Share error:', err);
      } finally {
        setSharingCycle(null);
      }
    }, 300); // small delay for ViewShot to render
    return () => clearTimeout(timer);
  }, [sharingCycle]);

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <LinearGradient colors={['#eceef5', COLORS.bg]} style={s.headerGradient}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.title}>Журнал</Text>
            <Text style={s.subtitle}>Контроль стерилізації</Text>
          </View>
          {sessions.length > 0 && (
            <TouchableOpacity
              style={s.exportBtn}
              onPress={handleExportPDF}
              disabled={exporting}
              activeOpacity={0.7}
            >
              {exporting ? (
                <ActivityIndicator size="small" color={COLORS.brand} />
              ) : (
                <Feather name="download" size={18} color={COLORS.brand} />
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Stats */}
        {sessions.length > 0 && (
          <View style={s.statsRow}>
            <StatCard
              value={stats.total.toString()}
              label="Всього"
              icon="activity"
              color={COLORS.brand}
              bg={COLORS.brandLight}
            />
            <StatCard
              value={`${stats.rate}%`}
              label="Успішних"
              icon="check-circle"
              color={COLORS.success}
              bg={COLORS.successBg}
            />
            <StatCard
              value={stats.failed.toString()}
              label="Невдалих"
              icon="alert-triangle"
              color={stats.failed > 0 ? COLORS.danger : COLORS.textTertiary}
              bg={stats.failed > 0 ? COLORS.dangerBg : COLORS.cardBg}
            />
          </View>
        )}
      </LinearGradient>

      {initialLoad && sessions.length === 0 ? (
        <View style={{ paddingHorizontal: 24, paddingTop: 20 }}>
          <SkeletonEntryCard />
          <SkeletonEntryCard />
          <SkeletonEntryCard />
        </View>
      ) : sessions.length === 0 ? (
        <View style={s.empty}>
          <View style={s.emptyIcon}>
            <Feather name="clipboard" size={36} color={COLORS.textTertiary} />
          </View>
          <Text style={s.emptyTitle}>Записів поки немає</Text>
          <Text style={s.emptyText}>Після завершення стерилізації{'\n'}записи з'являться тут</Text>
          <TouchableOpacity
            style={s.emptyBtn}
            onPress={() => router.push('/new-cycle' as any)}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={16} color={COLORS.brand} />
            <Text style={s.emptyBtnText}>Почати стерилізацію</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Filter chips */}
          <View style={s.filterRow}>
            <FilterChip label="Всі" count={stats.total} active={filter === 'all'} onPress={() => setFilter('all')} />
            <FilterChip label="Успішні" count={stats.passed} active={filter === 'success'} onPress={() => setFilter('success')} color={COLORS.success} />
            <FilterChip label="Невдалі" count={stats.failed} active={filter === 'fail'} onPress={() => setFilter('fail')} color={COLORS.danger} />
          </View>

          <FlatList
            data={groups}
            keyExtractor={(item) => item.dateKey}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadJournal(true)} tintColor={COLORS.brand} />}
            ListEmptyComponent={
              <View style={s.filterEmpty}>
                <Text style={s.filterEmptyText}>
                  {filter === 'success' ? 'Немає успішних стерилізацій' : 'Немає невдалих стерилізацій'}
                </Text>
              </View>
            }
            renderItem={({ item: group }) => (
              <View>
                <View style={s.dateHeaderRow}>
                  <Text style={s.dateHeader}>{group.date}</Text>
                  <View style={s.dateCountBadge}>
                    <Text style={s.dateCountText}>{group.count}</Text>
                  </View>
                </View>
                {group.data.map((sess) => (
                  <SessionCard key={sess.id} sess={sess} onPress={() => router.push(`/cycle/${sess.id}`)} onShare={() => setSharingCycle(sess)} />
                ))}
              </View>
            )}
          />
        </>
      )}
      {/* Offscreen StoryCard for journal share */}
      {sharingCycle && (
        <View style={{ position: 'absolute', left: -9999 }}>
          <ViewShot ref={storyRef} options={{ format: 'png', quality: 1, result: 'tmpfile', width: 1080, height: 1920 }}>
            <StoryCard
              instruments={sharingCycle.instrument_names}
              sterilizer={sharingCycle.sterilizer_name}
              duration={formatDuration(calcActualMinutes(sharingCycle.started_at, sharingCycle.ended_at) ?? sharingCycle.duration_minutes)}
              packType={sharingCycle.pouch_size && sharingCycle.pouch_size !== 'none' ? sharingCycle.pouch_size : ''}
              salonName={profileInfo.salon_name}
              city={profileInfo.city}
              date={new Date(sharingCycle.created_at).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}
            />
          </ViewShot>
        </View>
      )}
    </SafeAreaView>
  );

}

// ── Sub-components ──

function StatCard({ value, label, icon, color, bg }: {
  value: string; label: string; icon: string; color: string; bg: string;
}) {
  return (
    <View style={[s.statCard, { backgroundColor: bg }]}>
      <View style={s.statTop}>
        <Feather name={icon as any} size={14} color={color} />
        <Text style={[s.statValue, { color }]}>{value}</Text>
      </View>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function FilterChip({ label, count, active, onPress, color }: {
  label: string; count: number; active: boolean; onPress: () => void; color?: string;
}) {
  return (
    <TouchableOpacity
      style={[s.filterChip, active && s.filterChipActive, active && color ? { backgroundColor: color + '15', borderColor: color } : undefined]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[
        s.filterChipText,
        active && { color: color || COLORS.brand, fontWeight: '700' },
      ]}>
        {label}
      </Text>
      {count > 0 && (
        <Text style={[
          s.filterChipCount,
          active && { color: color || COLORS.brand },
        ]}>
          {count}
        </Text>
      )}
    </TouchableOpacity>
  );
}

function SessionCard({ sess, onPress, onShare }: { sess: SterilizationSession; onPress: () => void; onShare?: () => void }) {
  const passed = sess.result === 'success';
  const actual = calcActualMinutes(sess.started_at, sess.ended_at);
  const recommended = sess.duration_minutes;
  const displayMin = actual ?? recommended;
  const dStatus = actual !== null && recommended
    ? getDurationStatus(actual, recommended)
    : null;

  const pouchLabel = sess.pouch_size && sess.pouch_size !== 'none' ? sess.pouch_size : null;

  return (
    <TouchableOpacity style={s.card} activeOpacity={0.7} onPress={onPress}>
      {/* Left status indicator */}
      <View style={[s.cardStatusBar, { backgroundColor: passed ? COLORS.success : COLORS.danger }]} />

      <View style={s.cardBody}>
        {/* Top row: instruments + result badge */}
        <View style={s.cardTopRow}>
          <Text style={s.cardInstruments} numberOfLines={1}>{sess.instrument_names}</Text>
          <View style={[s.resultBadge, { backgroundColor: passed ? COLORS.successBg : COLORS.dangerBg }]}>
            <Feather
              name={passed ? 'check' : 'x'}
              size={10}
              color={passed ? COLORS.success : COLORS.danger}
            />
            <Text style={[s.resultBadgeText, { color: passed ? COLORS.success : COLORS.danger }]}>
              {passed ? 'Успішно' : 'Невдало'}
            </Text>
          </View>
        </View>

        {/* Middle row: sterilizer info chips */}
        <View style={s.chipRow}>
          <View style={s.infoChip}>
            <MaterialCommunityIcons name="radiator" size={12} color={COLORS.textSecondary} />
            <Text style={s.chipText}>{sess.sterilizer_name}</Text>
          </View>
          {sess.temperature && (
            <View style={s.infoChip}>
              <MaterialCommunityIcons name="thermometer" size={12} color={COLORS.textSecondary} />
              <Text style={s.chipText}>{sess.temperature}°C</Text>
            </View>
          )}
          {pouchLabel && (
            <View style={s.infoChip}>
              <Feather name="package" size={11} color={COLORS.textSecondary} />
              <Text style={s.chipText}>{pouchLabel}</Text>
            </View>
          )}
          {sess.employee_name && (
            <View style={s.infoChip}>
              <Feather name="user" size={11} color={COLORS.textSecondary} />
              <Text style={s.chipText}>{sess.employee_name}</Text>
            </View>
          )}
        </View>

        {/* Bottom row: time + duration */}
        <View style={s.cardBottomRow}>
          <View style={s.timeWrap}>
            <Feather name="clock" size={12} color={COLORS.textTertiary} />
            <Text style={s.cardTime}>{formatTime(sess.created_at)}</Text>
          </View>
          <View style={s.durationWrap}>
            {dStatus && (
              <View style={[s.durationDot, {
                backgroundColor: dStatus === 'sufficient' ? COLORS.success : COLORS.danger,
              }]} />
            )}
            <Text style={[s.cardDuration, dStatus === 'insufficient' && { color: COLORS.danger }]}>
              {formatDuration(displayMin)}
            </Text>
          </View>
        </View>
      </View>

      <View style={s.cardActions}>
        {onShare && passed && (
          <TouchableOpacity onPress={(e) => { e.stopPropagation(); onShare(); }} hitSlop={12} style={s.shareBtn}>
            <Feather name="instagram" size={14} color="#C13584" />
          </TouchableOpacity>
        )}
        <Feather name="chevron-right" size={16} color={COLORS.textTertiary} />
      </View>
    </TouchableOpacity>
  );
}

// ── Styles ──

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  // Header
  headerGradient: { paddingBottom: 4 },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8,
  },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.text },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 2 },
  exportBtn: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },

  // Stats
  statsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12 },
  statCard: {
    flex: 1, borderRadius: 14, padding: 12,
    alignItems: 'center',
  },
  statTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, marginTop: 2 },

  // Filter chips
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: RADII.pill, borderWidth: 1.5,
    borderColor: COLORS.border, backgroundColor: COLORS.white,
  },
  filterChipActive: {
    borderColor: COLORS.brand, backgroundColor: COLORS.brandLight,
  },
  filterChipText: { fontSize: 13, fontWeight: '500', color: COLORS.textSecondary },
  filterChipCount: { fontSize: 12, fontWeight: '700', color: COLORS.textTertiary },
  filterEmpty: { paddingVertical: 40, alignItems: 'center' },
  filterEmptyText: { fontSize: 14, color: COLORS.textSecondary },

  // Date header
  dateHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 12 },
  dateHeader: { fontSize: 14, fontWeight: '700', color: COLORS.textSecondary },
  dateCountBadge: {
    backgroundColor: COLORS.brandLight, borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  dateCountText: { fontSize: 11, fontWeight: '700', color: COLORS.brand },

  // Card
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.white, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border,
    overflow: 'hidden', marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  cardStatusBar: { width: 4, alignSelf: 'stretch' },
  cardBody: { flex: 1, paddingVertical: 12, paddingLeft: 14, paddingRight: 8 },
  cardActions: { alignItems: 'center', justifyContent: 'center', paddingRight: 12, paddingLeft: 4, gap: 8 },
  shareBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#C1358415', alignItems: 'center', justifyContent: 'center' },

  // Card top
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardInstruments: { fontSize: 15, fontWeight: '700', color: COLORS.text, flex: 1, marginRight: 8 },
  resultBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADII.pill,
  },
  resultBadgeText: { fontSize: 11, fontWeight: '700' },

  // Chip row
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  infoChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.cardBg, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  chipText: { fontSize: 11, fontWeight: '500', color: COLORS.textSecondary },

  // Card bottom
  cardBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timeWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardTime: { fontSize: 12, color: COLORS.textTertiary, fontVariant: ['tabular-nums'] },
  durationWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  durationDot: { width: 7, height: 7, borderRadius: 4 },
  cardDuration: { fontSize: 14, fontWeight: '700', color: COLORS.text, fontVariant: ['tabular-nums'] },

  // Empty
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 24,
    backgroundColor: COLORS.cardBg, alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, marginTop: 6, textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 24, paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: 12, backgroundColor: COLORS.brandLight,
  },
  emptyBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.brand },
});
