import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, SafeAreaView, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../_layout';

const BRAND = '#4b569e';
const COLORS = {
  bg: '#f5f6fa', white: '#FFFFFF', text: '#1B1B1B', textSecondary: '#6B7280',
  success: '#43A047', danger: '#E53935', warning: '#F9A825',
  border: '#e2e4ed', brand: BRAND,
};

interface SolutionRow {
  id: string;
  name: string;
  opened_at: string;
  expires_at: string;
  status: string | null;
  products: { name: string; image_path: string | null } | null;
}

type SolutionStatus = 'active' | 'expiring' | 'expired';

function getStatus(expiresAt: string): { status: SolutionStatus; daysLeft: number } {
  const now = new Date();
  const expires = new Date(expiresAt);
  const daysLeft = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft <= 0) return { status: 'expired', daysLeft };
  if (daysLeft <= 2) return { status: 'expiring', daysLeft };
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
  const now = Date.now();
  const total = end - start;
  if (total <= 0) return 1;
  const elapsed = now - start;
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

  const loadSolutions = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('solutions')
      .select('*, products(name, image_path)')
      .eq('user_id', userId)
      .order('opened_at', { ascending: false });

    if (error) console.error('Solutions error:', error.message);
    setSolutions(data ?? []);
  }, [userId]);

  useFocusEffect(useCallback(() => { loadSolutions(); }, [loadSolutions]));

  const handleDelete = (id: string) => {
    Alert.alert('Видалити розчин?', '', [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Видалити',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('solutions').delete().eq('id', id);
          if (error) console.error('Delete solution error:', error.message);
          loadSolutions();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Розчини</Text>
          <Text style={styles.subtitle}>Контроль дезінфікуючих розчинів</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/solution/add')} activeOpacity={0.8}>
          <Feather name="plus" size={20} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      {solutions.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Розчинів поки немає</Text>
          <Text style={styles.emptyHint}>Натисніть + щоб додати</Text>
        </View>
      ) : (
        <FlatList
          data={solutions}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          renderItem={({ item }) => {
            const { status, daysLeft } = getStatus(item.expires_at);
            const statusColor = getStatusColor(status);
            const progress = getProgress(item.opened_at, item.expires_at);
            const isExpired = status === 'expired';
            const displayName = item.products?.name || item.name;

            return (
              <View style={[styles.card, isExpired && styles.cardExpired]}>
                <View style={styles.cardRow}>
                  <View style={[styles.dot, { backgroundColor: statusColor }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName}>{displayName}</Text>
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
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.text },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 2 },
  addBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 15, color: COLORS.textSecondary, fontWeight: '500' },
  emptyHint: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4 },
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
