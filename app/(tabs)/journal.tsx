import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, SafeAreaView, TouchableOpacity, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CheckCircle, XCircle, Camera } from 'lucide-react-native';
import { COLORS } from '@/lib/constants';
import { getCycles } from '@/lib/storage';
import type { SterilizationCycle } from '@/lib/types';

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function formatDateGroup(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return ''; }
}

function formatTimeShort(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function groupByDate(cycles: SterilizationCycle[]): { date: string; data: SterilizationCycle[] }[] {
  const map = new Map<string, SterilizationCycle[]>();
  for (const c of cycles) {
    const key = new Date(c.date).toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }
  return Array.from(map.entries()).map(([_, data]) => ({
    date: formatDateGroup(data[0].date),
    data,
  }));
}

export default function JournalScreen() {
  const [cycles, setCycles] = useState<SterilizationCycle[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    (async () => setCycles(await getCycles()))();
  }, []));

  const groups = groupByDate(cycles);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Журнал</Text>
        <Text style={styles.subtitle}>Контроль стерилізації</Text>
      </View>

      {groups.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Записів поки немає</Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.date}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          renderItem={({ item: group }) => (
            <View>
              <Text style={styles.dateHeader}>{group.date}</Text>
              {group.data.map((cycle) => {
                const expanded = expandedId === cycle.id;
                return (
                  <TouchableOpacity key={cycle.id} style={styles.card} activeOpacity={0.8} onPress={() => setExpandedId(expanded ? null : cycle.id)}>
                    <View style={styles.cardRow}>
                      <View style={styles.cardLeft}>
                        {cycle.status === 'passed' ? (
                          <CheckCircle size={20} color={COLORS.success} strokeWidth={2} />
                        ) : (
                          <XCircle size={20} color={COLORS.danger} strokeWidth={2} />
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cardInstruments} numberOfLines={expanded ? undefined : 1}>
                            {cycle.instruments.join(', ')}
                          </Text>
                          <Text style={styles.cardMeta}>
                            {cycle.packType} · {cycle.sterilizer}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.cardRight}>
                        <Text style={styles.cardTime}>{formatTime(cycle.timerSeconds)}</Text>
                        <Text style={styles.cardDate}>{formatTimeShort(cycle.date)}</Text>
                      </View>
                    </View>

                    {expanded && (
                      <View style={styles.photos}>
                        {cycle.photoBefore ? (
                          <View style={styles.photoWrap}>
                            <Image source={{ uri: cycle.photoBefore }} style={styles.photo} />
                            <Text style={styles.photoLabel}>До</Text>
                          </View>
                        ) : null}
                        {cycle.photoAfter ? (
                          <View style={styles.photoWrap}>
                            <Image source={{ uri: cycle.photoAfter }} style={styles.photo} />
                            <Text style={styles.photoLabel}>Після</Text>
                          </View>
                        ) : null}
                        {!cycle.photoBefore && !cycle.photoAfter && (
                          <View style={styles.noPhotos}>
                            <Camera size={18} color={COLORS.textSecondary} />
                            <Text style={styles.noPhotosText}>Фото відсутні</Text>
                          </View>
                        )}
                      </View>
                    )}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.text },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 15, color: COLORS.textSecondary },
  dateHeader: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 10 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 12 },
  cardInstruments: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  cardMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  cardRight: { alignItems: 'flex-end' },
  cardTime: { fontSize: 15, fontWeight: '700', color: COLORS.text, fontVariant: ['tabular-nums'] },
  cardDate: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  photos: { flexDirection: 'row', gap: 10, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  photoWrap: { flex: 1, alignItems: 'center', gap: 4 },
  photo: { width: '100%', height: 100, borderRadius: 10, backgroundColor: COLORS.cardBg },
  photoLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
  noPhotos: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noPhotosText: { fontSize: 12, color: COLORS.textSecondary },
});
