import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Stop, Circle, Rect } from 'react-native-svg';

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
      <LinearGradient colors={['#0f1628', '#182044', '#0f1628']} style={st.bg}>

        {/* Decorative glow behind badge */}
        <View style={st.glowWrap}>
          <Svg width={200} height={200} style={st.glow}>
            <Defs>
              <RadialGradient id="g" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor="#22C55E" stopOpacity="0.25" />
                <Stop offset="100%" stopColor="#22C55E" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Circle cx="100" cy="100" r="100" fill="url(#g)" />
          </Svg>
        </View>

        {/* Subtle grid pattern overlay */}
        <View style={st.patternOverlay}>
          <Svg width={360} height={640} style={StyleSheet.absoluteFill}>
            <Defs>
              <RadialGradient id="corner1" cx="0%" cy="0%" r="60%">
                <Stop offset="0%" stopColor="#4b569e" stopOpacity="0.08" />
                <Stop offset="100%" stopColor="#4b569e" stopOpacity="0" />
              </RadialGradient>
              <RadialGradient id="corner2" cx="100%" cy="100%" r="60%">
                <Stop offset="0%" stopColor="#22C55E" stopOpacity="0.05" />
                <Stop offset="100%" stopColor="#22C55E" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Rect width="360" height="640" fill="url(#corner1)" />
            <Rect width="360" height="640" fill="url(#corner2)" />
          </Svg>
        </View>

        {/* Top branding */}
        <View style={st.topStrip}>
          <View style={st.brandRow}>
            <View style={st.brandDot} />
            <Text style={st.brandName}>DEZIK</Text>
            <Text style={st.brandSub}>SteriLog</Text>
          </View>
          <View style={st.brandLine} />
        </View>

        {/* Shield badge with glow ring */}
        <View style={st.badgeWrap}>
          <View style={st.badgeRing}>
            <LinearGradient colors={['#22C55E', '#16A34A']} style={st.badge}>
              <Feather name="shield" size={26} color="#fff" />
            </LinearGradient>
          </View>
          <Text style={st.badgeLabel}>СТЕРИЛІЗАЦІЮ ПРОЙДЕНО</Text>
          <View style={st.badgeUnderline} />
        </View>

        {/* Main card — glass effect */}
        <View style={st.cardOuter}>
          <View style={st.card}>
            <DataRow label="Інструменти" value={instruments} icon="scissors" />
            <View style={st.sep} />
            <DataRow label="Стерилізатор" value={sterilizer} icon="thermometer" />
            <View style={st.sep} />
            <DataRow label="Тривалість" value={duration} icon="clock" />
            {packType ? (
              <>
                <View style={st.sep} />
                <DataRow label="Крафт-пакет" value={packType} icon="package" />
              </>
            ) : null}

            {/* Result indicator */}
            <View style={st.resultRow}>
              <View style={st.resultIcon}>
                <Feather name="check" size={12} color="#fff" />
              </View>
              <Text style={st.resultText}>Індикатор змінив колір</Text>
            </View>

            {/* Photos */}
            {(photoBefore || photoAfter) && (
              <View style={st.photosRow}>
                {photoBefore && (
                  <View style={st.photoCol}>
                    <View style={st.photoFrame}>
                      <Image source={{ uri: photoBefore }} style={st.photo} />
                    </View>
                    <Text style={st.photoLabel}>ДО</Text>
                  </View>
                )}
                {photoBefore && photoAfter && (
                  <View style={st.photoArrow}>
                    <Feather name="arrow-right" size={14} color="#9CA3AF" />
                  </View>
                )}
                {photoAfter && (
                  <View style={st.photoCol}>
                    <View style={[st.photoFrame, st.photoFrameAfter]}>
                      <Image source={{ uri: photoAfter }} style={st.photo} />
                    </View>
                    <Text style={[st.photoLabel, { color: '#22C55E' }]}>ПІСЛЯ</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>

        {/* Footer: salon + date */}
        <View style={st.footer}>
          {salonName ? <Text style={st.footerSalon}>{salonName}</Text> : null}
          {city ? <Text style={st.footerCity}>{city}</Text> : null}
          <Text style={st.footerDate}>{date}</Text>
        </View>

        {/* Bottom CTA */}
        <View style={st.cta}>
          <View style={st.ctaDivider} />
          <Text style={st.ctaText}>Цифровий журнал стерилізації</Text>
          <Text style={st.ctaApp}>Dezik SteriLog</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

function DataRow({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <View style={st.row}>
      <View style={st.rowLeft}>
        <View style={st.rowIconWrap}>
          <Feather name={icon as any} size={11} color="#9CA3AF" />
        </View>
        <Text style={st.rowLabel}>{label}</Text>
      </View>
      <Text style={st.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  container: { width: 360, height: 640 },
  bg: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },

  // Decorative elements
  glowWrap: {
    position: 'absolute', top: '28%', left: '50%',
    marginLeft: -100, marginTop: -100,
  },
  glow: { opacity: 1 },
  patternOverlay: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },

  // Top branding
  topStrip: { position: 'absolute', top: 36, left: 24, right: 24 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  brandDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4b569e' },
  brandName: {
    fontSize: 15, fontWeight: '800', color: '#fff',
    letterSpacing: 3, textTransform: 'uppercase',
  },
  brandSub: {
    fontSize: 15, fontWeight: '300', color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1.5,
  },
  brandLine: {
    height: 1, backgroundColor: 'rgba(255,255,255,0.06)',
    marginTop: 14,
  },

  // Shield badge
  badgeWrap: { alignItems: 'center', marginBottom: 20 },
  badgeRing: {
    width: 60, height: 60, borderRadius: 30,
    borderWidth: 2, borderColor: 'rgba(34,197,94,0.25)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  badge: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeLabel: {
    fontSize: 11, fontWeight: '800', color: '#22C55E',
    letterSpacing: 2.5, textTransform: 'uppercase',
  },
  badgeUnderline: {
    width: 40, height: 2, borderRadius: 1,
    backgroundColor: 'rgba(34,197,94,0.2)', marginTop: 8,
  },

  // Card — glass style
  cardOuter: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 17,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 9,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowIconWrap: {
    width: 22, height: 22, borderRadius: 6,
    backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
  },
  rowLabel: { fontSize: 12, fontWeight: '500', color: '#9CA3AF' },
  rowValue: {
    fontSize: 14, fontWeight: '700', color: '#111827',
    maxWidth: '50%', textAlign: 'right',
  },
  sep: { height: 1, backgroundColor: '#F3F4F6', marginLeft: 30 },

  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  resultIcon: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#22C55E',
    alignItems: 'center', justifyContent: 'center',
  },
  resultText: { fontSize: 13, fontWeight: '700', color: '#22C55E' },

  // Photos
  photosRow: {
    flexDirection: 'row', gap: 8, marginTop: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  photoCol: { alignItems: 'center' },
  photoFrame: {
    borderRadius: 12, borderWidth: 2,
    borderColor: '#E5E7EB', overflow: 'hidden',
  },
  photoFrameAfter: { borderColor: '#22C55E' },
  photo: { width: 80, height: 80, backgroundColor: '#F3F4F6' },
  photoLabel: {
    fontSize: 9, fontWeight: '800', color: '#9CA3AF',
    marginTop: 5, letterSpacing: 1.5,
  },
  photoArrow: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },

  // Footer
  footer: { alignItems: 'center', marginTop: 20 },
  footerSalon: { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  footerCity: { fontSize: 12, fontWeight: '400', color: 'rgba(255,255,255,0.45)', marginTop: 3 },
  footerDate: { fontSize: 12, fontWeight: '400', color: 'rgba(255,255,255,0.35)', marginTop: 4 },

  // CTA
  cta: { position: 'absolute', bottom: 28, left: 24, right: 24, alignItems: 'center' },
  ctaDivider: {
    width: 32, height: 2, borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.08)', marginBottom: 10,
  },
  ctaText: { fontSize: 10, fontWeight: '400', color: 'rgba(255,255,255,0.3)', letterSpacing: 0.5 },
  ctaApp: {
    fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.45)',
    marginTop: 3, letterSpacing: 2.5,
  },
});
