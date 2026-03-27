import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Alert, Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth-context';
import { COLORS, MS_PER_DAY } from '../../lib/constants';
import { RADII } from '../../lib/theme';
import { cancelSolutionNotifications } from '../../lib/notifications';

type Status = 'active' | 'warning' | 'expired';

function getStatus(expiresAt: string): { status: Status; daysLeft: number } {
  const expires = new Date(expiresAt);
  if (isNaN(expires.getTime())) return { status: 'expired', daysLeft: 0 };
  const daysLeft = Math.ceil((expires.getTime() - Date.now()) / MS_PER_DAY);
  if (daysLeft <= 0) return { status: 'expired', daysLeft: 0 };
  if (daysLeft <= 3) return { status: 'warning', daysLeft };
  return { status: 'active', daysLeft };
}

function formatDateUk(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return iso; }
}

function statusConfig(status: Status) {
  switch (status) {
    case 'active': return { color: COLORS.success, bg: COLORS.successBg, icon: 'check-circle' as const, label: 'Активний' };
    case 'warning': return { color: COLORS.warning, bg: COLORS.warningBg, icon: 'alert-triangle' as const, label: 'Закінчується' };
    case 'expired': return { color: COLORS.danger, bg: COLORS.dangerBg, icon: 'alert-circle' as const, label: 'Протермінований' };
  }
}

interface SolutionData {
  id: string;
  name: string;
  opened_at: string;
  expires_at: string;
  status: string | null;
}

export default function SolutionDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [solution, setSolution] = useState<SolutionData | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId || !id) return;
    (async () => {
      const { data } = await supabase
        .from('solutions')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();
      if (data) setSolution(data);

      // Try to load photo
      try {
        const { data: files } = await supabase.storage
          .from('solution-photos')
          .list(`${userId}/${id}`);
        if (files && files.length > 0) {
          const { data: urlData } = supabase.storage
            .from('solution-photos')
            .getPublicUrl(`${userId}/${id}/${files[0].name}`);
          if (urlData?.publicUrl) setPhotoUrl(urlData.publicUrl);
        }
      } catch (err) {
        console.warn('Solution photo load failed:', err);
      }

      setLoading(false);
    })();
  }, [userId, id]);

  const { status, daysLeft } = useMemo(
    () => solution ? getStatus(solution.expires_at) : { status: 'active' as Status, daysLeft: 0 },
    [solution],
  );

  const totalDays = useMemo(() => {
    if (!solution) return 1;
    return Math.max(1, Math.ceil(
      (new Date(solution.expires_at).getTime() - new Date(solution.opened_at).getTime()) / MS_PER_DAY
    ));
  }, [solution]);

  const elapsed = totalDays - daysLeft;
  const progress = Math.min(1, Math.max(0, elapsed / totalDays));
  const cfg = statusConfig(status);

  const handleDelete = () => {
    Alert.alert('Видалити розчин?', 'Цю дію неможливо скасувати.', [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Видалити', style: 'destructive', onPress: async () => {
          if (!userId || !id) return;
          await supabase.from('solutions').delete().eq('id', id).eq('user_id', userId);
          cancelSolutionNotifications(id);
          router.back();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={st.container}>
        <View style={st.centered}>
          <Text style={st.loadingText}>Завантаження...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!solution) {
    return (
      <SafeAreaView style={st.container}>
        <View style={st.centered}>
          <Feather name="alert-circle" size={40} color={COLORS.textTertiary} />
          <Text style={st.emptyTitle}>Розчин не знайдено</Text>
          <TouchableOpacity style={st.backBtn} onPress={() => router.back()}>
            <Text style={st.backBtnText}>Назад</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={st.headerBack}>
          <Feather name="arrow-left" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>Розчин</Text>
        <TouchableOpacity onPress={handleDelete} hitSlop={12}>
          <Feather name="trash-2" size={18} color={COLORS.danger} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.body}>

        {/* Status hero */}
        <View style={[st.statusHero, { backgroundColor: cfg.bg }]}>
          <View style={[st.statusIconWrap, { backgroundColor: cfg.color + '20' }]}>
            <Feather name={cfg.icon} size={28} color={cfg.color} />
          </View>
          <Text style={st.solutionName}>{solution.name}</Text>
          <View style={[st.statusBadge, { backgroundColor: cfg.color + '18' }]}>
            <View style={[st.statusDot, { backgroundColor: cfg.color }]} />
            <Text style={[st.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>

        {/* Progress */}
        <View style={st.progressCard}>
          <View style={st.progressHeader}>
            <Text style={st.progressTitle}>
              {status === 'expired'
                ? 'Термін вийшов'
                : `${daysLeft} ${daysLeft === 1 ? 'день' : daysLeft <= 4 ? 'дні' : 'днів'} залишилось`
              }
            </Text>
            <Text style={st.progressSub}>{elapsed} з {totalDays} днів</Text>
          </View>
          <View style={st.progressBar}>
            <LinearGradient
              colors={status === 'expired' ? [COLORS.danger, COLORS.danger] : status === 'warning' ? [COLORS.warning, COLORS.danger] : [COLORS.brand, COLORS.success]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[st.progressFill, { width: `${progress * 100}%` }]}
            />
          </View>
        </View>

        {/* Dates */}
        <View style={st.datesCard}>
          <View style={st.dateRow}>
            <View style={st.dateIconWrap}>
              <Feather name="play-circle" size={16} color={COLORS.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.dateLabel}>Приготовано</Text>
              <Text style={st.dateValue}>{formatDateUk(solution.opened_at)}</Text>
            </View>
          </View>
          <View style={st.dateDivider} />
          <View style={st.dateRow}>
            <View style={st.dateIconWrap}>
              <Feather name="flag" size={16} color={cfg.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.dateLabel}>Дійсний до</Text>
              <Text style={[st.dateValue, status === 'expired' && { color: COLORS.danger }]}>
                {formatDateUk(solution.expires_at)}
              </Text>
            </View>
          </View>
        </View>

        {/* Photo */}
        {photoUrl && (
          <>
            <Text style={st.sectionLabel}>Фото розчину</Text>
            <View style={st.photoCard}>
              <Image source={{ uri: photoUrl }} style={st.photo} />
            </View>
          </>
        )}

        {/* Info tips */}
        <Text style={st.sectionLabel}>Інформація</Text>
        <View style={st.tipsCard}>
          <TipRow icon="info" text="Робочий розчин зберігати у щільно закритій тарі при кімнатній температурі." />
          <TipRow icon="refresh-cw" text="Розчин можна використовувати багаторазово, якщо зовнішній вигляд не змінився." />
          <TipRow icon="alert-triangle" text="При зміні кольору, помутнінні або появі осаду — замініть розчин." />
          {status === 'expired' && (
            <TipRow icon="trash-2" text="Протермінований розчин необхідно замінити на свіжий." color={COLORS.danger} />
          )}
        </View>

        {/* Actions */}
        {status === 'expired' && (
          <TouchableOpacity
            style={st.newSolutionBtn}
            onPress={() => { router.back(); setTimeout(() => router.push('/solution/add'), 300); }}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={18} color="#fff" />
            <Text style={st.newSolutionBtnText}>Приготувати новий розчин</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function TipRow({ icon, text, color }: { icon: string; text: string; color?: string }) {
  return (
    <View style={st.tipRow}>
      <Feather name={icon as any} size={14} color={color || COLORS.textSecondary} />
      <Text style={[st.tipText, color ? { color } : undefined]}>{text}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: COLORS.textSecondary },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  backBtn: { paddingHorizontal: 20, paddingVertical: 10 },
  backBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.brand },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8,
  },
  headerBack: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },

  body: { padding: 20, paddingBottom: 40 },

  // Status hero
  statusHero: {
    borderRadius: RADII.lg, padding: 24, alignItems: 'center', marginBottom: 16,
  },
  statusIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  solutionName: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 13, fontWeight: '700' },

  // Progress
  progressCard: {
    backgroundColor: COLORS.white, borderRadius: RADII.md,
    borderWidth: 1, borderColor: COLORS.border, padding: 16, marginBottom: 12,
  },
  progressHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
  },
  progressTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  progressSub: { fontSize: 12, fontWeight: '500', color: COLORS.textSecondary },
  progressBar: {
    height: 8, borderRadius: 4, backgroundColor: COLORS.cardBg, overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 4 },

  // Dates
  datesCard: {
    backgroundColor: COLORS.white, borderRadius: RADII.md,
    borderWidth: 1, borderColor: COLORS.border, padding: 16, marginBottom: 16,
  },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dateIconWrap: {
    width: 32, height: 32, borderRadius: 10, backgroundColor: COLORS.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  dateLabel: { fontSize: 12, fontWeight: '500', color: COLORS.textSecondary },
  dateValue: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginTop: 2 },
  dateDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 12, marginLeft: 44 },

  // Photo
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: COLORS.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
  },
  photoCard: {
    borderRadius: RADII.md, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 16,
  },
  photo: { width: '100%', height: 200 },

  // Tips
  tipsCard: {
    backgroundColor: COLORS.white, borderRadius: RADII.md,
    borderWidth: 1, borderColor: COLORS.border, padding: 14, gap: 10, marginBottom: 16,
  },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  tipText: { fontSize: 13, fontWeight: '400', color: COLORS.textSecondary, flex: 1, lineHeight: 18 },

  // New solution button
  newSolutionBtn: {
    flexDirection: 'row', height: 52, borderRadius: RADII.lg,
    backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  newSolutionBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
