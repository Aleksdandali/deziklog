import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, SafeAreaView, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth-context';
import { COLORS, MS_PER_DAY } from '../../lib/constants';
import { cancelSolutionNotifications } from '../../lib/notifications';

interface SolutionRow {
  id: string;
  name: string;
  opened_at: string;
  expires_at: string;
  status: string | null;
}

type SolutionStatus = 'active' | 'expiring' | 'expired';

function getStatus(expiresAt: string): { status: SolutionStatus; daysLeft: number } {
  const expires = new Date(expiresAt);
  if (isNaN(expires.getTime())) return { status: 'expired', daysLeft: 0 };
  const daysLeft = Math.ceil((expires.getTime() - Date.now()) / MS_PER_DAY);
  if (daysLeft <= 0) return { status: 'expired', daysLeft };
  if (daysLeft <= 3) return { status: 'expiring', daysLeft };
  return { status: 'active', daysLeft };
}

function getStatusColor(status: SolutionStatus): string {
  if (status === 'expired') return COLORS.danger;
  if (status === 'expiring') return COLORS.warning;
  return COLORS.success;
}

function getStatusLabel(status: SolutionStatus, daysLeft: number): string {
  if (status === 'expired') return 'Прострочений';
  if (status === 'expiring') return `Закінчується через ${daysLeft} дн.`;
  return `${daysLeft} дн. залишилось`;
}

function getProgress(openedAt: string, expiresAt: string): number {
  const start = new Date(openedAt).getTime();
  const end = new Date(expiresAt).getTime();
  if (isNaN(start) || isNaN(end)) return 1;
  const total = end - start;
  if (total <= 0) return 1;
  const elapsed = Date.now() - start;
  return Math.min(1, Math.max(0, elapsed / total));
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return iso; }
}

export default function SolutionsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [solutions, setSolutions] = useState<SolutionRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadSolutions = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from('solutions')
        .select('*')
        .eq('user_id', userId)
        .order('opened_at', { ascending: false });
      if (error && __DEV__) console.error('Solutions error:', error.message);
      setSolutions(data ?? []);
    } catch (err) {
      if (__DEV__) console.error('Solutions load error:', err);
    } finally {
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { loadSolutions(); }, [loadSolutions]));

  const handleDelete = (id: string) => {
    Alert.alert('Видалити розчин?', '', [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Видалити',
        style: 'destructive',
        onPress: async () => {
          if (!userId) return;
          const { error } = await supabase.from('solutions').delete().eq('id', id).eq('user_id', userId);
          if (error && __DEV__) console.error('Delete solution error:', error.message);
          cancelSolutionNotifications(id);
          loadSolutions();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Розчини</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/solution/add')} activeOpacity={0.8}>
          <Feather name="plus" size={20} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      {solutions.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="water-outline" size={48} color={COLORS.textSecondary} />
          </View>
          <Text style={styles.emptyTitle}>Розчинів поки немає</Text>
          <Text style={styles.emptyText}>Додайте перший розчин для відстеження терміну придатності</Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => router.push('/solution/add')}
            activeOpacity={0.8}
          >
            <Feather name="plus" size={16} color={COLORS.brand} />
            <Text style={styles.emptyBtnText}>Додати розчин</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={solutions}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadSolutions(true)} tintColor={COLORS.brand} />}
          renderItem={({ item }) => {
            const { status, daysLeft } = getStatus(item.expires_at);
            const statusColor = getStatusColor(status);
            const progress = getProgress(item.opened_at, item.expires_at);
            const isExpired = status === 'expired';

            return (
              <View style={[styles.card, isExpired && styles.cardExpired]}>
                <View style={styles.cardRow}>
                  <View style={[styles.dot, { backgroundColor: statusColor }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName}>{item.name}</Text>
                    <View style={styles.statusRow}>
                      {isExpired && <Ionicons name="alert-circle" size={13} color={COLORS.danger} />}
                      <Text style={[styles.statusText, { color: statusColor }]}>
                        {getStatusLabel(status, daysLeft)}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => handleDelete(item.id)} hitSlop={12} style={styles.deleteBtn}>
                    <Feather name="trash-2" size={16} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.progressBarBg}>
                  <View style={[
                    styles.progressBarFill,
                    { width: `${Math.round(progress * 100)}%`, backgroundColor: statusColor },
                  ]} />
                </View>

                <View style={styles.dates}>
                  <Text style={styles.dateLabel}>
                    Відкрито: <Text style={styles.dateValue}>{formatDate(item.opened_at)}</Text>
                  </Text>
                  <Text style={[styles.dateLabel, isExpired && { color: COLORS.danger }]}>
                    Термін: <Text style={[styles.dateValue, isExpired && { color: COLORS.danger }]}>{formatDate(item.expires_at)}</Text>
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.text, flex: 1 },
  addBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingTop: 60 },
  emptyIcon: { width: 88, height: 88, borderRadius: 44, backgroundColor: COLORS.cardBg, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: COLORS.brand, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  emptyBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.brand },
  card: { backgroundColor: COLORS.white, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  cardExpired: { borderColor: COLORS.danger + '40' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  cardName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  statusText: { fontSize: 12, fontWeight: '600' },
  deleteBtn: { padding: 6 },
  progressBarBg: { height: 4, backgroundColor: COLORS.border, borderRadius: 2, marginTop: 12, overflow: 'hidden' },
  progressBarFill: { height: 4, borderRadius: 2 },
  dates: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border, gap: 4 },
  dateLabel: { fontSize: 12, color: COLORS.textSecondary },
  dateValue: { fontWeight: '600', color: COLORS.text },
});
