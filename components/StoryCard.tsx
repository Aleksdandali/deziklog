import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export interface StoryCardProps {
  instruments: string;
  sterilizer: string;
  duration: string;
  packType: string;
  photoBefore?: string | null;
  photoAfter?: string | null;
  salonName?: string | null;
  city?: string | null;
  date: string;
}

export default function StoryCard({
  instruments, sterilizer, duration, packType,
  photoBefore, photoAfter, salonName, city, date,
}: StoryCardProps) {
  return (
    <View style={st.container}>
      <LinearGradient colors={['#4B569E', '#363F75', '#252A4A']} style={st.bg}>
        {/* Card */}
        <View style={st.card}>
          {/* Header */}
          <View style={st.header}>
            <Feather name="check-circle" size={32} color="#43A047" />
            <Text style={st.headerText}>Цикл завершено</Text>
          </View>

          <View style={st.divider} />

          {/* Data rows */}
          <DataRow label="Інструменти" value={instruments} />
          <DataRow label="Стерилізатор" value={sterilizer} />
          <DataRow label="Час стерилізації" value={duration} />
          <DataRow label="Тип пакета" value={packType || '—'} />
          <DataRow label="Результат" value="Пройдено ✓" valueColor="#43A047" />

          {/* Photos */}
          {(photoBefore || photoAfter) && (
            <View style={st.photosRow}>
              {photoBefore && (
                <View style={st.photoCol}>
                  <Image source={{ uri: photoBefore }} style={st.photo} />
                  <Text style={st.photoLabel}>ДО</Text>
                </View>
              )}
              {photoAfter && (
                <View style={st.photoCol}>
                  <Image source={{ uri: photoAfter }} style={st.photo} />
                  <Text style={st.photoLabel}>ПІСЛЯ</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={st.footer}>
          <Text style={st.footerDate}>{date}</Text>
          {salonName ? <Text style={st.footerSalon}>{salonName}</Text> : null}
          {city ? <Text style={st.footerCity}>{city}</Text> : null}
          <Text style={st.footerBrand}>Dezik SteriLog</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

function DataRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={st.row}>
      <Text style={st.rowLabel}>{label}</Text>
      <Text style={[st.rowValue, valueColor ? { color: valueColor } : undefined]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  container: { width: 360, height: 640 },
  bg: { flex: 1, padding: 20, justifyContent: 'center' },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  headerText: { fontSize: 18, fontWeight: '700', color: '#1B1B1B' },

  divider: { height: 1, backgroundColor: '#E2E4ED', marginVertical: 14 },

  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6,
  },
  rowLabel: { fontSize: 13, color: '#6B7280' },
  rowValue: { fontSize: 14, fontWeight: '700', color: '#1B1B1B', maxWidth: '55%', textAlign: 'right' },

  photosRow: {
    flexDirection: 'row', gap: 12, marginTop: 14, justifyContent: 'center',
  },
  photoCol: { alignItems: 'center' },
  photo: { width: 100, height: 100, borderRadius: 10, backgroundColor: '#F3F4F6' },
  photoLabel: { fontSize: 10, fontWeight: '600', color: '#6B7280', marginTop: 4 },

  footer: { paddingTop: 16, alignItems: 'center' },
  footerDate: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  footerSalon: { fontSize: 13, color: '#FFFFFF', opacity: 0.8, marginTop: 2 },
  footerCity: { fontSize: 12, color: '#FFFFFF', opacity: 0.6, marginTop: 2 },
  footerBrand: { fontSize: 11, fontWeight: '700', color: '#FFFFFF', opacity: 0.4, marginTop: 8 },
});
