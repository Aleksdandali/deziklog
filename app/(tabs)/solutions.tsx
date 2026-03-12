import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, SafeAreaView, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Plus, Trash2 } from 'lucide-react-native';
import { COLORS } from '@/lib/constants';
import { getSolutions, deleteSolution as apiDeleteSolution } from '@/lib/api';
import type { Solution } from '@/lib/types';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return iso; }
}

export default function SolutionsScreen() {
  const router = useRouter();
  const [solutions, setSolutions] = useState<Solution[]>([]);

  useFocusEffect(useCallback(() => {
    (async () => {
      try {
        setSolutions(await getSolutions());
      } catch (err) {
        console.error('Solutions load error:', err);
      }
    })();
  }, []));

  const handleDelete = (id: string) => {
    Alert.alert('Видалити розчин?', '', [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Видалити',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiDeleteSolution(id);
            setSolutions(await getSolutions());
          } catch (err) {
            console.error('Delete error:', err);
          }
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
          <Plus size={20} color={COLORS.white} strokeWidth={2.5} />
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
            const isExpired = new Date(item.expires_at) < new Date();
            return (
              <View style={[styles.card, isExpired && styles.cardExpired]}>
                <View style={styles.cardRow}>
                  <View style={[styles.dot, { backgroundColor: COLORS.brand }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName}>{item.name}</Text>
                    {item.status && (
                      <Text style={styles.cardMeta}>{item.status}</Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => handleDelete(item.id)} hitSlop={12} style={styles.deleteBtn}>
                    <Trash2 size={16} color={COLORS.textSecondary} strokeWidth={1.8} />
                  </TouchableOpacity>
                </View>
                <View style={styles.dates}>
                  <Text style={styles.dateLabel}>
                    Приготовлено: <Text style={styles.dateValue}>{formatDate(item.opened_at)}</Text>
                  </Text>
                  <Text style={[styles.dateLabel, isExpired && { color: COLORS.danger }]}>
                    Термін: <Text style={[styles.dateValue, isExpired && { color: COLORS.danger }]}>{formatDate(item.expires_at)}</Text>
                    {isExpired ? ' (протерміновано)' : ''}
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
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 15, color: COLORS.textSecondary, fontWeight: '500' },
  emptyHint: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardExpired: { borderColor: COLORS.danger + '40' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  cardName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  cardMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  deleteBtn: { padding: 6 },
  dates: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border, gap: 4 },
  dateLabel: { fontSize: 12, color: COLORS.textSecondary },
  dateValue: { fontWeight: '600', color: COLORS.text },
});
