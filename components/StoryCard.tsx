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
      <LinearGradient colors={['#1a1f3d', '#252d5a', '#1a1f3d']} style={st.bg}>

        {/* Top branding strip */}
        <View style={st.topStrip}>
          <View style={st.brandRow}>
            <View style={st.brandDot} />
            <Text style={st.brandName}>DEZIK</Text>
            <Text style={st.brandSub}>SteriLog</Text>
          </View>
        </View>

        {/* Shield badge */}
        <View style={st.badgeWrap}>
          <LinearGradient colors={['#22C55E', '#16A34A']} style={st.badge}>
            <Feather name="shield" size={22} color="#fff" />
          </LinearGradient>
          <Text style={st.badgeLabel}>СТЕРИЛІЗАЦІЮ ПРОЙДЕНО</Text>
        </View>

        {/* Main card */}
        <View style={st.card}>
          {/* Data */}
          <DataRow label="Інструменти" value={instruments} />
          <View style={st.sep} />
          <DataRow label="Стерилізатор" value={sterilizer} />
          <View style={st.sep} />
          <DataRow label="Тривалість" value={duration} />
          {packType ? (
            <>
              <View style={st.sep} />
              <DataRow label="Тип пакета" value={packType} />
            </>
          ) : null}

          {/* Result indicator */}
          <View style={st.resultRow}>
            <Feather name="check-circle" size={16} color="#22C55E" />
            <Text style={st.resultText}>Індикатор змінив колір</Text>
          </View>

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

        {/* Footer: salon + date */}
        <View style={st.footer}>
          {salonName ? <Text style={st.footerSalon}>{salonName}</Text> : null}
          {city ? <Text style={st.footerCity}>{city}</Text> : null}
          <Text style={st.footerDate}>{date}</Text>
        </View>

        {/* Bottom CTA — informative, not pushy */}
        <View style={st.cta}>
          <View style={st.ctaDivider} />
          <Text style={st.ctaText}>Цифровий журнал стерилізації</Text>
          <Text style={st.ctaApp}>Dezik SteriLog</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={st.row}>
      <Text style={st.rowLabel}>{label}</Text>
      <Text style={st.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  container: { width: 360, height: 640 },
  bg: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },

  // Top branding
  topStrip: { position: 'absolute', top: 40, left: 24, right: 24 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#5561AA' },
  brandName: { fontSize: 14, fontWeight: '800', color: '#fff', letterSpacing: 2 },
  brandSub: { fontSize: 14, fontWeight: '400', color: 'rgba(255,255,255,0.5)', letterSpacing: 1 },

  // Shield badge
  badgeWrap: { alignItems: 'center', marginBottom: 16 },
  badge: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  badgeLabel: {
    fontSize: 11, fontWeight: '800', color: '#22C55E',
    letterSpacing: 2.5, textTransform: 'uppercase',
  },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8,
  },
  rowLabel: { fontSize: 12, fontWeight: '500', color: '#9CA3AF' },
  rowValue: { fontSize: 14, fontWeight: '700', color: '#1B1B1B', maxWidth: '55%', textAlign: 'right' },
  sep: { height: 1, backgroundColor: '#F3F4F6' },

  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  resultText: { fontSize: 13, fontWeight: '700', color: '#22C55E' },

  // Photos
  photosRow: { flexDirection: 'row', gap: 10, marginTop: 14, justifyContent: 'center' },
  photoCol: { alignItems: 'center' },
  photo: { width: 90, height: 90, borderRadius: 10, backgroundColor: '#F3F4F6' },
  photoLabel: { fontSize: 9, fontWeight: '700', color: '#9CA3AF', marginTop: 4, letterSpacing: 1 },

  // Footer
  footer: { alignItems: 'center', marginTop: 18 },
  footerSalon: { fontSize: 15, fontWeight: '700', color: '#fff' },
  footerCity: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  footerDate: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 },

  // CTA
  cta: { position: 'absolute', bottom: 32, left: 24, right: 24, alignItems: 'center' },
  ctaDivider: { width: 32, height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 12 },
  ctaText: { fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.5 },
  ctaApp: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.5)', marginTop: 3, letterSpacing: 2 },
});
