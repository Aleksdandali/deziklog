import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, SafeAreaView, TouchableOpacity, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../_layout';

const COLORS = {
  bg: '#f5f6fa', white: '#FFFFFF', text: '#1B1B1B', textSecondary: '#6B7280',
  success: '#43A047', danger: '#E53935', border: '#e2e4ed', cardBg: '#eceef5',
};

interface CyclePhoto { id: string; type: string; storage_path: string; }
interface CycleRow {
  id: string;
  instrument_name: string;
  sterilizer_name: string;
  packet_type: string;
  duration_minutes: number | null;
  result: string | null;
  created_at: string;
  cycle_photos: CyclePhoto[];
}

function getPhotoUrl(storagePath: string): string {
  const { data } = supabase.storage.from('cycle-photos').getPublicUrl(storagePath);
  return data.publicUrl;
}

function formatDuration(minutes: number | null): string {
  if (!minutes) return '--';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}г ${m}хв`;
  return `${m} хв`;
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

function groupByDate(cycles: CycleRow[]): { date: string; data: CycleRow[] }[] {
  const map = new Map<string, CycleRow[]>();
  for (const c of cycles) {
    const key = new Date(c.created_at).toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }
  return Array.from(map.entries()).map(([_, data]) => ({
    date: formatDateGroup(data[0].created_at),
    data,
  }));
}

export default function JournalScreen() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [cycles, setCycles] = useState<CycleRow[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    if (!userId) return;
    (async () => {
      const { data, error } = await supabase
        .from('sterilization_cycles')
        .select('*, cycle_photos(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) console.error('Journal error:', error.message);
      setCycles(data ?? []);
    })();
  }, [userId]));

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
                const passed = cycle.result === 'passed';
                const photos = cycle.cycle_photos ?? [];
                const photoBefore = photos.find((p) => p.type === 'before');
                const photoAfter = photos.find((p) => p.type === 'after');

                return (
                  <TouchableOpacity
                    key={cycle.id}
                    style={styles.card}
                    activeOpacity={0.8}
                    onPress={() => setExpandedId(expanded ? null : cycle.id)}
                  >
                    <View style={styles.cardRow}>
                      <View style={styles.cardLeft}>
                        <Ionicons
                          name={passed ? 'checkmark-circle' : 'close-circle'}
                          size={22}
                          color={passed ? COLORS.success : COLORS.danger}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cardInstruments} numberOfLines={expanded ? undefined : 1}>
                            {cycle.instrument_name}
                          </Text>
                          <Text style={styles.cardMeta}>
                            {cycle.packet_type} · {cycle.sterilizer_name}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.cardRight}>
                        <Text style={styles.cardTime}>{formatDuration(cycle.duration_minutes)}</Text>
                        <Text style={styles.cardDate}>{formatTimeShort(cycle.created_at)}</Text>
                      </View>
                    </View>

                    {expanded && (
                      <View style={styles.photos}>
                        {photoBefore ? (
                          <View style={styles.photoWrap}>
                            <Image source={{ uri: getPhotoUrl(photoBefore.storage_path) }} style={styles.photo} />
                            <Text style={styles.photoLabel}>До</Text>
                          </View>
                        ) : null}
                        {photoAfter ? (
                          <View style={styles.photoWrap}>
                            <Image source={{ uri: getPhotoUrl(photoAfter.storage_path) }} style={styles.photo} />
                            <Text style={styles.photoLabel}>Після</Text>
                          </View>
                        ) : null}
                        {!photoBefore && !photoAfter && (
                          <View style={styles.noPhotos}>
                            <Feather name="camera-off" size={18} color={COLORS.textSecondary} />
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
  card: { backgroundColor: COLORS.white, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
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
