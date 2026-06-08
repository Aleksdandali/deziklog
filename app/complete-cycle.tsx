import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReAnimated, { FadeIn } from 'react-native-reanimated';
import ViewShot from 'react-native-view-shot';
import { updateSession, uploadSessionPhoto, getSessionById, SessionConflictError } from '../lib/api';
import { useAuth, useSessionGuard } from '../lib/auth-context';
import { supabase } from '../lib/supabase';
import { notifyCycleDone } from '../lib/notifications';
import { COLORS } from '../lib/constants';
import { RADII } from '../lib/theme';
import { getDurationStatus } from '../lib/steri-config';
import { shareToInstagramStory } from '../lib/share-instagram';
import CameraCapture from '../components/CameraCapture';
import RotatedImage from '../components/RotatedImage';
import StoryCard from '../components/StoryCard';

const ACTIVE_TIMER_KEY = 'active_timer';

interface TimerData {
  sessionId: string;
  duration: number; // recommended minutes
  startedAt: number;
  sterilizerName: string;
  temperature: number;
  instruments: string;
  photoBeforeUri?: string;
}

export default function CompleteCycleScreen() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { session } = useAuth();
  const getUid = useSessionGuard();
  const userId = session?.user?.id;

  const [showCamera, setShowCamera] = useState(false);
  const [photoAfter, setPhotoAfter] = useState<string | null>(null);
  const [photoBeforeUri, setPhotoBeforeUri] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<'success' | 'fail' | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [sharing, setSharing] = useState(false);

  const [timerData, setTimerData] = useState<TimerData | null>(null);
  const [actualMinutes, setActualMinutes] = useState<number | null>(null);
  const [profileData, setProfileData] = useState<{ salon_name: string | null; city: string | null }>({ salon_name: null, city: null });

  const storyRef = useRef<ViewShot>(null);
  // Synchronous in-flight guard. `saving` (state) flips a tick late, so a fast
  // double-tap can enter doSave twice before the button disables — this ref
  // blocks re-entry immediately.
  const savingRef = useRef(false);

  // Load profile data for story card
  useEffect(() => {
    if (!userId) return;
    supabase.from('profiles').select('salon_name, city').eq('id', userId).single()
      .then(({ data }) => { if (data) setProfileData(data); });
  }, [userId]);

  // Load timer data from AsyncStorage
  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(ACTIVE_TIMER_KEY);
      if (stored) {
        try {
          const data: TimerData = JSON.parse(stored);
          setTimerData(data);
          if (data.photoBeforeUri) setPhotoBeforeUri(data.photoBeforeUri);
          const elapsedMs = Date.now() - data.startedAt;
          setActualMinutes(Math.round(elapsedMs / 60000));
        } catch {
          await AsyncStorage.removeItem(ACTIVE_TIMER_KEY);
        }
      }
    })();
  }, []);

  const recommendedMinutes = timerData?.duration ?? 0;
  const durationStatus = actualMinutes !== null && recommendedMinutes > 0
    ? getDurationStatus(actualMinutes, recommendedMinutes)
    : null;
  const isSufficient = durationStatus === 'sufficient';

  // Block "success" if the cycle ran less than the selected mode's minimum time.
  // recommendedMinutes comes from timerData.duration (the chosen mode's min exposure).
  // If no minimum is known (<= 0), don't block.
  const canMarkSuccess =
    actualMinutes === null || recommendedMinutes <= 0 || actualMinutes >= recommendedMinutes;

  const handleUploadAndConfirm = async () => {
    // Photo "ПІСЛЯ" is only required when the cycle could still pass. If it ended
    // before the minimum time, there is no after-photo to take — go straight to "повторити".
    if (canMarkSuccess && !photoAfter) { Alert.alert('Зробіть фото індикатора ПІСЛЯ'); return; }
    if (!selectedResult) { Alert.alert('Оберіть результат'); return; }
    if (!sessionId) return;

    // Recalculate actual time at save moment
    const nowMs = Date.now();
    const finalActualMinutes = timerData ? Math.round((nowMs - timerData.startedAt) / 60000) : null;

    // Hard block: cannot mark success below the selected mode's minimum time
    if (selectedResult === 'success' && finalActualMinutes !== null && recommendedMinutes > 0 && finalActualMinutes < recommendedMinutes) {
      Alert.alert(
        'Недостатній час',
        `Мінімальний час стерилізації — ${recommendedMinutes} хв. Пройшло лише ${finalActualMinutes} хв.\n\nНеможливо зберегти як успішну.`,
      );
      setSelectedResult(null);
      return;
    }

    // Warn if cycle was too short (but still > 60 min)
    if (finalActualMinutes !== null && recommendedMinutes > 0 && finalActualMinutes < recommendedMinutes) {
      return new Promise<void>((resolve) => {
        Alert.alert(
          'Цикл тривав менше рекомендованого',
          `Цикл тривав лише ${finalActualMinutes} хв, рекомендовано не менше ${recommendedMinutes} хв.\n\nЗберегти все одно?`,
          [
            { text: 'Повернутись', style: 'cancel', onPress: () => resolve() },
            {
              text: 'Зберегти',
              style: 'destructive',
              onPress: () => { doSave(finalActualMinutes); resolve(); },
            },
          ],
        );
      });
    }

    doSave(finalActualMinutes);
  };

  const doSave = async (finalActualMinutes: number | null) => {
    if (savingRef.current) return;
    if (!selectedResult || !sessionId) return;
    // Photo is mandatory only when the cycle could still pass; early-finish saves go through without it.
    if (canMarkSuccess && !photoAfter) return;

    savingRef.current = true;
    setSaving(true);
    try {
      const uid = await getUid();
      if (!uid) {
        Alert.alert('Сесія закінчилась', 'Потрібно увійти знову.', [
          { text: 'Скасувати', style: 'cancel' },
          { text: 'Увійти', onPress: () => { supabase.auth.signOut(); } },
        ]);
        setSaving(false);
        return;
      }

      // Validate session is still in_progress (not already completed/failed/deleted).
      // On network/DB error we skip the pre-check and let the update path surface a real error,
      // instead of falsely telling the master "session not found".
      let existing: Awaited<ReturnType<typeof getSessionById>> | undefined;
      try {
        existing = await getSessionById(sessionId, uid);
      } catch (err) {
        if (__DEV__) console.warn('[complete-cycle] pre-validation failed:', err);
      }
      if (existing === null) {
        await AsyncStorage.removeItem(ACTIVE_TIMER_KEY);
        Alert.alert('Сесію не знайдено', 'Можливо, її було видалено.', [
          { text: 'OK', onPress: () => router.replace('/(tabs)') },
        ]);
        setSaving(false);
        return;
      }
      if (existing && existing.status !== 'in_progress') {
        await AsyncStorage.removeItem(ACTIVE_TIMER_KEY);
        Alert.alert('Цикл вже завершено', 'Цей сеанс уже було збережено в журналі.', [
          { text: 'OK', onPress: () => router.replace('/(tabs)/journal') },
        ]);
        setSaving(false);
        return;
      }

      const path = photoAfter ? await uploadSessionPhoto(uid, sessionId, 'after', photoAfter) : null;
      const finalStatus = selectedResult === 'success' ? 'completed' : 'failed';
      const endedAt = new Date().toISOString();

      try {
        // Atomic guard: completes only if the session is STILL in_progress.
        await updateSession(sessionId, uid, {
          photo_after_path: path,
          ended_at: endedAt,
          result: selectedResult,
          status: finalStatus,
        }, { expectedStatus: 'in_progress' });
      } catch (e) {
        if (e instanceof SessionConflictError) {
          await AsyncStorage.removeItem(ACTIVE_TIMER_KEY);
          Alert.alert('Цикл вже завершено', 'Цей сеанс уже було збережено в журналі.', [
            { text: 'OK', onPress: () => router.replace('/(tabs)/journal') },
          ]);
          return;
        }
        throw e;
      }

      await AsyncStorage.removeItem(ACTIVE_TIMER_KEY);
      if (finalActualMinutes !== null) setActualMinutes(finalActualMinutes);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Local push notification (checks user preference, fire-and-forget)
      if (timerData?.instruments) {
        notifyCycleDone(uid, timerData.instruments).catch(() => {});
      }
      setDone(true);
    } catch (err: unknown) {
      Alert.alert('Помилка', err instanceof Error ? err.message : 'Не вдалось зберегти');
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  if (showCamera) {
    return (
      <CameraCapture
        label="Фото індикатора ПІСЛЯ"
        onCapture={(uri) => {
          setPhotoAfter(uri);
          setShowCamera(false);
        }}
        onClose={() => setShowCamera(false)}
      />
    );
  }

  if (done) {
    return (
      <SafeAreaView style={s.container}>
        <ReAnimated.View entering={FadeIn.duration(200)} style={s.doneSection}>
          <Feather
            name={selectedResult === 'success' ? 'check-circle' : 'alert-triangle'}
            size={56}
            color={selectedResult === 'success' ? COLORS.success : COLORS.danger}
          />
          <Text style={s.doneTitle}>
            {selectedResult === 'success' ? 'Цикл пройшов успішно!' : 'Стерилізація не пройшла'}
          </Text>

          {/* Show actual duration */}
          {actualMinutes !== null && (
            <View style={s.doneDurationRow}>
              <Text style={s.doneDuration}>{actualMinutes} хв</Text>
              {recommendedMinutes > 0 && (
                <View style={[s.doneDurationBadge, { backgroundColor: isSufficient ? COLORS.success + '20' : COLORS.warning + '20' }]}>
                  <Text style={[s.doneDurationBadgeText, { color: isSufficient ? COLORS.success : COLORS.warning }]}>
                    {isSufficient ? 'достатньо' : `рекомендовано ${recommendedMinutes} хв`}
                  </Text>
                </View>
              )}
            </View>
          )}

          <Text style={s.doneSub}>
            {selectedResult === 'success'
              ? 'Запис збережено в журналі. Інструменти готові до роботи.'
              : 'Запис збережено. Потрібно повторити стерилізацію.'}
          </Text>

          {/* Instagram Story share */}
          {selectedResult === 'success' && (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={async () => {
                if (!storyRef.current) return;
                setSharing(true);
                try {
                  const uri = await storyRef.current.capture!();
                  if (uri) await shareToInstagramStory(uri);
                } catch (err) {
                  console.error('Share error:', err);
                } finally {
                  setSharing(false);
                }
              }}
              disabled={sharing}
              style={[s.igBtnWrap, { opacity: sharing ? 0.6 : 1 }]}
            >
              <View style={s.igBtnInner}>
                <View style={s.igIconWrap}>
                  <Feather name="instagram" size={20} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.igBtnText}>{sharing ? 'Підготовка...' : 'Поділитись в Stories'}</Text>
                  <Text style={s.igBtnHint}>Покажіть клієнтам вашу відповідальність</Text>
                </View>
                <Feather name="chevron-right" size={18} color={COLORS.textTertiary} />
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity activeOpacity={0.85} onPress={() => router.replace('/(tabs)/journal')}>
            <LinearGradient colors={[COLORS.brandDark, COLORS.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.gradientInner}>
              <Feather name="book-open" size={18} color="#fff" />
              <Text style={s.gradientText}>Переглянути в журналі</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={s.secondaryBtn} onPress={() => router.replace('/(tabs)')}>
            <Feather name="home" size={16} color={COLORS.textSecondary} />
            <Text style={s.secondaryBtnText}>На головну</Text>
          </TouchableOpacity>
        </ReAnimated.View>

        {/* Offscreen StoryCard for capture */}
        <View style={{ position: 'absolute', left: -9999 }}>
          <ViewShot ref={storyRef} options={{ format: 'png', quality: 1, result: 'tmpfile', width: 1080, height: 1920 }}>
            <StoryCard
              instruments={timerData?.instruments || ''}
              sterilizer={timerData?.sterilizerName || ''}
              duration={actualMinutes != null ? `${Math.floor(actualMinutes / 60).toString().padStart(2, '0')}:${(actualMinutes % 60).toString().padStart(2, '0')}` : '--'}
              packType=""
              photoBefore={photoBeforeUri}
              photoAfter={photoAfter}
              salonName={profileData.salon_name}
              city={profileData.city}
              date={new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}
            />
          </ViewShot>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Результат</Text>
        <TouchableOpacity
          style={s.skipBtn}
          onPress={() => {
            Alert.alert(
              'Повернутись на головну?',
              'Ви зможете завершити цикл пізніше з головного екрану.',
              [
                { text: 'Ні, залишитись', style: 'cancel' },
                { text: 'Так', onPress: () => router.replace('/(tabs)') },
              ],
            );
          }}
          activeOpacity={0.7}
        >
          <Feather name="x" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.body}>
        <ReAnimated.View entering={FadeIn.duration(200)}>
          <Text style={s.stepTitle}>Перевірте індикатор</Text>
          <Text style={s.stepSub}>Сфотографуйте індикатор ПІСЛЯ стерилізації та порівняйте з фото ДО</Text>

          {/* Elapsed time display */}
          {actualMinutes !== null && (
            <View style={[s.elapsedCard, { borderColor: isSufficient ? COLORS.success : COLORS.warning }]}>
              <View style={s.elapsedMain}>
                <Text style={[s.elapsedValue, { color: isSufficient ? COLORS.success : COLORS.warning }]}>
                  {actualMinutes} хв
                </Text>
                <Text style={s.elapsedLabel}>фактичний час</Text>
              </View>
              <View style={s.elapsedDivider} />
              <View style={s.elapsedMain}>
                <Text style={s.elapsedRecommended}>{recommendedMinutes} хв</Text>
                <Text style={s.elapsedLabel}>мінімальний час</Text>
              </View>
            </View>
          )}

          {/* Duration warning — only when the cycle still passed the minimum.
              Below-minimum (early finish) is covered by the dedicated banner below. */}
          {durationStatus === 'insufficient' && canMarkSuccess && (
            <View style={s.warningBanner}>
              <Feather name="alert-triangle" size={16} color={COLORS.warning} />
              <Text style={s.warningText}>
                Цикл тривав менше рекомендованого часу ({actualMinutes} з {recommendedMinutes} хв)
              </Text>
            </View>
          )}

          {/* Photo after — only when the cycle reached the minimum time.
              If it ended early it can't pass, so an after-photo is pointless. */}
          {!canMarkSuccess ? (
            <View style={s.warningBanner}>
              <Feather name="info" size={16} color={COLORS.warning} />
              <Text style={s.warningText}>
                Цикл завершено раніше мінімального часу — фото ПІСЛЯ не потрібне. Результат: повторити стерилізацію.
              </Text>
            </View>
          ) : photoAfter ? (
            <View style={s.previewWrap}>
              <RotatedImage uri={photoAfter} style={s.preview} />
              <View style={s.previewActions}>
                <TouchableOpacity style={s.retakeBtn} onPress={() => setShowCamera(true)}>
                  <Feather name="rotate-ccw" size={16} color={COLORS.brand} />
                  <Text style={s.retakeText}>Перезняти</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={s.photoPlaceholder} onPress={() => setShowCamera(true)} activeOpacity={0.8}>
              <Feather name="camera" size={32} color={COLORS.brand} />
              <Text style={s.photoPlaceholderTitle}>Зробити фото ПІСЛЯ</Text>
              <Text style={s.photoPlaceholderHint}>Покажіть індикатор після стерилізації</Text>
            </TouchableOpacity>
          )}

          {/* Before/After comparison */}
          {canMarkSuccess && photoAfter && photoBeforeUri && (
            <View style={s.compareSection}>
              <Text style={s.compareSectionTitle}>Порівняння</Text>
              <View style={s.compareRow}>
                <View style={s.compareCol}>
                  <Text style={s.compareLabel}>ДО</Text>
                  <RotatedImage uri={photoBeforeUri} style={s.compareImg} />
                </View>
                <View style={s.compareCol}>
                  <Text style={s.compareLabel}>ПІСЛЯ</Text>
                  <RotatedImage uri={photoAfter} style={s.compareImg} />
                </View>
              </View>
              <Text style={s.compareHint}>Індикатор має змінити колір якщо стерилізація пройшла</Text>
            </View>
          )}

          {/* Minimum time info */}
          {!canMarkSuccess && (
            <View style={s.infoBanner}>
              <View style={s.infoBannerIcon}>
                <Feather name="info" size={16} color={COLORS.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.infoBannerTitle}>Мінімальний час стерилізації — {recommendedMinutes} хв</Text>
                <Text style={s.infoBannerText}>
                  Для обраного режиму ({timerData?.temperature ?? '—'}°C) потрібно щонайменше {recommendedMinutes} хв. Пройшло лише {actualMinutes} хв — позначити як успішну неможливо.
                </Text>
              </View>
            </View>
          )}

          {/* Result selection */}
          <Text style={[s.fieldLabel, { marginTop: 20 }]}>Чи змінився індикатор?</Text>

          <TouchableOpacity
            style={[
              s.resultOption,
              selectedResult === 'success' && s.resultSuccess,
              !canMarkSuccess && { opacity: 0.4 },
            ]}
            onPress={() => {
              if (!canMarkSuccess) {
                Alert.alert(
                  'Недостатній час',
                  `Мінімальний час стерилізації — ${recommendedMinutes} хв. Пройшло лише ${actualMinutes} хв.\n\nНеможливо позначити як успішну.`,
                );
                return;
              }
              setSelectedResult('success');
            }}
            activeOpacity={0.8}
          >
            <Feather name="check-circle" size={22} color={selectedResult === 'success' ? COLORS.success : COLORS.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={[s.resultTitle, selectedResult === 'success' && { color: COLORS.success }]}>Так, змінився</Text>
              <Text style={s.resultDesc}>
                {canMarkSuccess
                  ? 'Стерилізація пройшла успішно'
                  : `Мінімум ${recommendedMinutes} хв для підтвердження`}
              </Text>
            </View>
            {!canMarkSuccess && (
              <Feather name="lock" size={16} color={COLORS.textTertiary} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.resultOption, selectedResult === 'fail' && s.resultFail]}
            onPress={() => setSelectedResult('fail')}
            activeOpacity={0.8}
          >
            <Feather name="x-circle" size={22} color={selectedResult === 'fail' ? COLORS.danger : COLORS.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={[s.resultTitle, selectedResult === 'fail' && { color: COLORS.danger }]}>Ні, не змінився</Text>
              <Text style={s.resultDesc}>Потрібно повторити стерилізацію</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              s.primaryBtn,
              (!selectedResult || !photoAfter || saving) && { opacity: 0.55 },
              selectedResult === 'success' && { backgroundColor: COLORS.success },
              selectedResult === 'fail' && { backgroundColor: COLORS.danger },
            ]}
            disabled={saving}
            onPress={() => {
              if (!photoAfter) { Alert.alert('Зробіть фото індикатора ПІСЛЯ'); return; }
              if (!selectedResult) { Alert.alert('Оберіть результат', 'Вкажіть, чи змінився індикатор.'); return; }
              handleUploadAndConfirm();
            }}
            activeOpacity={0.85}
          >
            <Feather name="check" size={18} color="#fff" />
            <Text style={s.primaryBtnText}>{saving ? 'Зберігаю...' : 'Зберегти'}</Text>
          </TouchableOpacity>
        </ReAnimated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  body: { padding: 20, paddingBottom: 40 },

  stepTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  stepSub: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4, marginBottom: 20, lineHeight: 20 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },

  // Elapsed time card
  elapsedCard: { flexDirection: 'row', borderWidth: 1.5, borderRadius: RADII.lg, marginBottom: 16, overflow: 'hidden' },
  elapsedMain: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  elapsedValue: { fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] },
  elapsedRecommended: { fontSize: 28, fontWeight: '800', color: COLORS.text, fontVariant: ['tabular-nums'] },
  elapsedLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, marginTop: 2 },
  elapsedDivider: { width: 1, backgroundColor: COLORS.border },

  // Warning
  warningBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: COLORS.warningBg, borderRadius: RADII.md, marginBottom: 16 },
  warningText: { fontSize: 13, fontWeight: '500', color: COLORS.warning, flex: 1, lineHeight: 18 },

  // Info banner (min cycle time)
  infoBanner: { flexDirection: 'row', gap: 12, padding: 14, backgroundColor: COLORS.brandLight, borderRadius: RADII.lg, marginTop: 16, borderWidth: 1, borderColor: COLORS.brand + '25' },
  infoBannerIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: COLORS.brand + '15', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  infoBannerTitle: { fontSize: 14, fontWeight: '700', color: COLORS.brand },
  infoBannerText: { fontSize: 13, color: COLORS.textSecondary, marginTop: 3, lineHeight: 18 },

  photoPlaceholder: { height: 180, borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: COLORS.border, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', gap: 6 },
  photoPlaceholderTitle: { fontSize: 15, fontWeight: '600', color: COLORS.brand },
  photoPlaceholderHint: { fontSize: 13, color: COLORS.textSecondary },
  previewWrap: { marginBottom: 8 },
  preview: { width: '100%', height: 220, borderRadius: 16 },
  previewActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  retakeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.brand },
  retakeText: { fontSize: 14, fontWeight: '600', color: COLORS.brand },

  // Comparison
  compareSection: { marginTop: 16, backgroundColor: COLORS.cardBg, borderRadius: RADII.lg, padding: 14 },
  compareSectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  compareRow: { flexDirection: 'row', gap: 10 },
  compareCol: { flex: 1, alignItems: 'center' },
  compareLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 },
  compareImg: { width: '100%', height: 120, borderRadius: RADII.md },
  compareHint: { fontSize: 12, color: COLORS.textSecondary, textAlign: 'center', marginTop: 10, lineHeight: 17 },

  // Result
  resultOption: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: RADII.lg, borderWidth: 1.5, borderColor: COLORS.border, marginBottom: 10 },
  resultSuccess: { borderColor: COLORS.success, backgroundColor: '#f0faf3' },
  resultFail: { borderColor: COLORS.danger, backgroundColor: '#fff5f5' },
  resultTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  resultDesc: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },

  skipBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  primaryBtn: { flexDirection: 'row', height: 54, borderRadius: RADII.lg, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 24 },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  doneSection: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
  doneTitle: { fontSize: 24, fontWeight: '800', color: COLORS.text, marginTop: 8, textAlign: 'center' },
  doneDurationRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  doneDuration: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  doneDurationBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADII.pill },
  doneDurationBadgeText: { fontSize: 12, fontWeight: '700' },
  doneSub: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  gradientInner: { flexDirection: 'row', height: 54, borderRadius: RADII.lg, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 32 },
  gradientText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  igBtnWrap: { marginBottom: 12, borderRadius: RADII.lg + 2 },
  igBtnInner: { flexDirection: 'row', minHeight: 60, borderRadius: RADII.lg + 2, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 14, backgroundColor: COLORS.brandLight, borderWidth: 1, borderColor: 'rgba(75,86,158,0.14)' },
  igIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center' },
  igBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  igBtnHint: { fontSize: 11, color: COLORS.textSecondary, marginTop: 1 },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, marginTop: 8 },
  secondaryBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
});
