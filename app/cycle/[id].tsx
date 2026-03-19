import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView,
  Image, Modal, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { getSessionById, getPhotoUrl, type SterilizationSession } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { COLORS } from '../../lib/constants';
import { RADII } from '../../lib/theme';
import { calcActualMinutes, getDurationStatus } from '../../lib/steri-config';

function fmt(iso: string | null, mode: 'time' | 'date' | 'datetime'): string {
  if (!iso) return '--';
  try {
    const d = new Date(iso);
    if (mode === 'time') return d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    if (mode === 'date') return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
    return `${d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })} о ${d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}`;
  } catch { return '--'; }
}

function fmtDuration(min: number | null): string {
  if (min == null) return '--';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0) return `${h} год ${m} хв`;
  return `${m} хв`;
}

export default function CycleDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session: authSession } = useAuth();
  const userId = authSession?.user?.id;

  const [sess, setSess] = useState<SterilizationSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !userId) return;
    (async () => {
      const data = await getSessionById(id, userId);
      setSess(data);
      setLoading(false);
    })();
  }, [id, userId]);

  const actualMin = sess ? calcActualMinutes(sess.started_at, sess.ended_at) : null;
  const recommended = sess?.duration_minutes ?? null;
  const status = actualMin !== null && recommended !== null
    ? getDurationStatus(actualMin, recommended) : null;
  const passed = sess?.result === 'success';

  const handleExport = async () => {
    if (!sess) return;
    const actual = actualMin ?? recommended;
    const lines = [
      `Стерилізація — ${passed ? 'Успішно ✅' : 'Не пройшла ❌'}`,
      ``,
      `Дата: ${fmt(sess.started_at || sess.created_at, 'date')}`,
      `Початок: ${fmt(sess.started_at, 'time')}`,
      `Кінець: ${fmt(sess.ended_at, 'time')}`,
      `Тривалість: ${fmtDuration(actual)}${recommended ? ` (рекомендовано ${recommended} хв)` : ''}`,
      ``,
      `Інструменти: ${sess.instrument_names}`,
      `Стерилізатор: ${sess.sterilizer_name}`,
      `Режим: ${sess.temperature}°C · ${sess.duration_minutes} хв`,
      sess.pouch_size ? `Пакет: ${sess.pouch_size}` : null,
      ``,
      `— Dezik SteriLog`,
    ].filter(Boolean).join('\n');

    // TODO: Replace with PDF export (generateCyclePDF) when ready
    try {
      await Sharing.shareAsync('data:text/plain;base64,' + btoa(unescape(encodeURIComponent(lines))), {
        mimeType: 'text/plain',
        dialogTitle: 'Експорт стерилізації',
        UTI: 'public.utf8-plain-text',
      });
    } catch {
      Alert.alert('Помилка', 'Не вдалось експортувати');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={st.container}>
        <View style={st.loadingWrap}>
          <Text style={st.loadingText}>Завантаження...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!sess) {
    return (
      <SafeAreaView style={st.container}>
        <View style={st.loadingWrap}>
          <Feather name="alert-circle" size={40} color={COLORS.textSecondary} />
          <Text style={st.loadingText}>Запис не знайдено</Text>
          <TouchableOpacity onPress={() => router.back()} style={st.backLink}>
            <Text style={st.backLinkText}>Повернутись</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const photoBeforeUrl = sess.photo_before_path ? getPhotoUrl(sess.photo_before_path) : null;
  const photoAfterUrl = sess.photo_after_path ? getPhotoUrl(sess.photo_after_path) : null;

  return (
    <SafeAreaView style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Feather name="chevron-left" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>Деталі</Text>
        <TouchableOpacity onPress={handleExport} hitSlop={12}>
          <Feather name="share" size={20} color={COLORS.brand} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.body}>
        {/* Status banner */}
        <View style={[st.statusBanner, { backgroundColor: passed ? COLORS.successBg : COLORS.dangerBg }]}>
          <Feather
            name={passed ? 'check-circle' : 'x-circle'}
            size={20}
            color={passed ? COLORS.success : COLORS.danger}
          />
          <Text style={[st.statusText, { color: passed ? COLORS.success : COLORS.danger }]}>
            {passed ? 'Стерилізація пройшла успішно' : 'Стерилізація не пройшла'}
          </Text>
        </View>

        {/* Instruments */}
        <Text style={st.sectionLabel}>Інструменти</Text>
        <Text style={st.sectionValue}>{sess.instrument_names}</Text>

        {/* Sterilizer + mode */}
        <Text style={st.sectionLabel}>Стерилізатор та режим</Text>
        <View style={st.infoCard}>
          <View style={st.infoRow}>
            <MaterialCommunityIcons name="radiator" size={18} color={COLORS.brand} />
            <Text style={st.infoText}>{sess.sterilizer_name}</Text>
          </View>
          <View style={st.infoRow}>
            <MaterialCommunityIcons name="thermometer" size={18} color={COLORS.brand} />
            <Text style={st.infoText}>{sess.temperature}°C · {sess.duration_minutes} хв</Text>
          </View>
          {sess.pouch_size && sess.pouch_size !== 'none' && (
            <View style={st.infoRow}>
              <Feather name="package" size={16} color={COLORS.brand} />
              <Text style={st.infoText}>{sess.pouch_size}</Text>
            </View>
          )}
        </View>

        {/* Time */}
        <Text style={st.sectionLabel}>Час</Text>
        <View style={st.timeCard}>
          <View style={st.timeRow}>
            <Text style={st.timeLabel}>Початок</Text>
            <Text style={st.timeValue}>{fmt(sess.started_at, 'datetime')}</Text>
          </View>
          <View style={st.timeDivider} />
          <View style={st.timeRow}>
            <Text style={st.timeLabel}>Кінець</Text>
            <Text style={st.timeValue}>{fmt(sess.ended_at, 'datetime')}</Text>
          </View>
          <View style={st.timeDivider} />
          <View style={st.timeRow}>
            <Text style={st.timeLabel}>Тривалість</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {status && (
                <View style={[st.durationDot, {
                  backgroundColor: status === 'sufficient' ? COLORS.success : COLORS.danger,
                }]} />
              )}
              <Text style={[st.timeValue, st.timeValueBold]}>{fmtDuration(actualMin)}</Text>
            </View>
          </View>
          {status === 'insufficient' && (
            <View style={st.timeWarning}>
              <Feather name="alert-triangle" size={13} color={COLORS.warning} />
              <Text style={st.timeWarningText}>Менше рекомендованого ({recommended} хв)</Text>
            </View>
          )}
        </View>

        {/* Photos */}
        <Text style={st.sectionLabel}>Фото індикатора</Text>
        <View style={st.photosRow}>
          <View style={st.photoCol}>
            <Text style={st.photoLabel}>До</Text>
            {photoBeforeUrl ? (
              <TouchableOpacity onPress={() => setFullscreenPhoto(photoBeforeUrl)} activeOpacity={0.9}>
                <Image source={{ uri: photoBeforeUrl }} style={st.photo} />
              </TouchableOpacity>
            ) : (
              <View style={st.photoEmpty}><Feather name="camera-off" size={20} color={COLORS.textTertiary} /></View>
            )}
          </View>
          <View style={st.photoCol}>
            <Text style={st.photoLabel}>Після</Text>
            {photoAfterUrl ? (
              <TouchableOpacity onPress={() => setFullscreenPhoto(photoAfterUrl)} activeOpacity={0.9}>
                <Image source={{ uri: photoAfterUrl }} style={st.photo} />
              </TouchableOpacity>
            ) : (
              <View style={st.photoEmpty}><Feather name="camera-off" size={20} color={COLORS.textTertiary} /></View>
            )}
          </View>
        </View>

        {/* Export button */}
        <TouchableOpacity style={st.exportBtn} onPress={handleExport} activeOpacity={0.85}>
          <Feather name="share" size={18} color={COLORS.brand} />
          <Text style={st.exportBtnText}>Експортувати</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Fullscreen photo modal */}
      <Modal visible={!!fullscreenPhoto} transparent animationType="fade">
        <View style={st.modalBg}>
          <TouchableOpacity style={st.modalClose} onPress={() => setFullscreenPhoto(null)}>
            <Feather name="x" size={24} color="#fff" />
          </TouchableOpacity>
          {fullscreenPhoto && (
            <Image source={{ uri: fullscreenPhoto }} style={st.modalImage} resizeMode="contain" />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  body: { padding: 20, paddingBottom: 40 },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 15, color: COLORS.textSecondary },
  backLink: { paddingVertical: 10 },
  backLinkText: { fontSize: 14, fontWeight: '600', color: COLORS.brand },

  // Status
  statusBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderRadius: RADII.lg, marginBottom: 20 },
  statusText: { fontSize: 15, fontWeight: '700' },

  // Sections
  sectionLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 8 },
  sectionValue: { fontSize: 16, fontWeight: '600', color: COLORS.text, lineHeight: 22 },

  // Info card
  infoCard: { backgroundColor: COLORS.cardBg, borderRadius: RADII.lg, padding: 14, gap: 10 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { fontSize: 14, fontWeight: '600', color: COLORS.text },

  // Time card
  timeCard: { backgroundColor: COLORS.cardBg, borderRadius: RADII.lg, padding: 14 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  timeLabel: { fontSize: 13, color: COLORS.textSecondary },
  timeValue: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  timeValueBold: { fontSize: 16, fontWeight: '800' },
  timeDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 4 },
  timeWarning: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.border },
  timeWarningText: { fontSize: 12, color: COLORS.warning, fontWeight: '500' },
  durationDot: { width: 8, height: 8, borderRadius: 4 },

  // Photos
  photosRow: { flexDirection: 'row', gap: 12 },
  photoCol: { flex: 1 },
  photoLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 },
  photo: { height: 160, borderRadius: RADII.lg, backgroundColor: COLORS.cardBg },
  photoEmpty: { height: 160, borderRadius: RADII.lg, backgroundColor: COLORS.cardBg, alignItems: 'center', justifyContent: 'center' },

  // Export
  exportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: RADII.lg, borderWidth: 1.5, borderColor: COLORS.brand, marginTop: 24 },
  exportBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.brand },

  // Modal
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  modalClose: { position: 'absolute', top: 60, right: 20, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  modalImage: { width: '90%', height: '70%' },
});
