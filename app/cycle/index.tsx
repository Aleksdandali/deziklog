import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView,
  TextInput, Alert, Image, Animated, Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../_layout';

const BRAND = '#4b569e';
const BRAND_DARK = '#363f75';
const COLORS = {
  bg: '#f5f6fa', white: '#FFFFFF', text: '#1B1B1B', textSecondary: '#6B7280',
  success: '#43A047', border: '#e2e4ed', cardBg: '#eceef5', brand: BRAND,
};

const RING_SIZE = 280;
const RING_CX = RING_SIZE / 2;
const RING_CY = RING_SIZE / 2;
const RING_R = 100;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;
const WAVE_BASE = RING_R * 2;
const WAVE_DURATION = 2800;
const WAVE_CYCLE = 4600;

type PackType = 'Крафт' | 'Прозорий' | 'Білий';
interface InstrumentRow { id: string; name: string; }
interface SterilizerRow { id: string; name: string; type: string | null; }

export default function CycleScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [step, setStep] = useState(1);
  const [cameraMode, setCameraMode] = useState<'before' | 'after' | null>(null);
  const [selectedInstruments, setSelectedInstruments] = useState<string[]>([]);
  const [packType, setPackType] = useState<PackType | null>(null);
  const [sterilizerName, setSterilizerName] = useState('');
  const [photoBefore, setPhotoBefore] = useState<string | null>(null);
  const [photoAfter, setPhotoAfter] = useState<string | null>(null);
  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedDuration, setSavedDuration] = useState(0);
  const [instruments, setInstruments] = useState<InstrumentRow[]>([]);
  const [sterilizers, setSterilizers] = useState<SterilizerRow[]>([]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const wave1Scale = useRef(new Animated.Value(1)).current;
  const wave1Opacity = useRef(new Animated.Value(0.18)).current;
  const wave2Scale = useRef(new Animated.Value(1)).current;
  const wave2Opacity = useRef(new Animated.Value(0.14)).current;
  const wave3Scale = useRef(new Animated.Value(1)).current;
  const wave3Opacity = useRef(new Animated.Value(0.10)).current;
  const colonOpacity = useRef(new Animated.Value(1)).current;
  const dotScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const [instrRes, sterRes] = await Promise.all([
        supabase.from('instruments').select('*').eq('user_id', userId),
        supabase.from('sterilizers').select('*').eq('user_id', userId),
      ]);
      if (instrRes.error) console.error('Load instruments error:', instrRes.error.message);
      if (sterRes.error) console.error('Load sterilizers error:', sterRes.error.message);
      setInstruments(instrRes.data ?? []);
      setSterilizers(sterRes.data ?? []);
    })();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [userId]);

  useEffect(() => {
    if (step !== 3 || !timerStartedAt) return;

    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - timerStartedAt) / 1000));
    }, 1000);

    const createWave = (
      scaleAnim: Animated.Value, opacityAnim: Animated.Value,
      targetScale: number, startOpacity: number, delay: number,
    ) => {
      const postWait = WAVE_CYCLE - WAVE_DURATION - delay;
      return Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(opacityAnim, { toValue: startOpacity, duration: 0, useNativeDriver: true }),
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(scaleAnim, { toValue: targetScale, duration: WAVE_DURATION, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(opacityAnim, { toValue: 0, duration: WAVE_DURATION, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          ]),
          ...(postWait > 0 ? [Animated.delay(postWait)] : []),
        ]),
      );
    };

    const w1 = createWave(wave1Scale, wave1Opacity, 1.5, 0.18, 0);
    const w2 = createWave(wave2Scale, wave2Opacity, 1.65, 0.14, 900);
    const w3 = createWave(wave3Scale, wave3Opacity, 1.8, 0.10, 1800);
    w1.start(); w2.start(); w3.start();

    const colonAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(colonOpacity, { toValue: 0.25, duration: 500, useNativeDriver: true }),
        Animated.timing(colonOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    colonAnim.start();

    const dotAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(dotScale, { toValue: 1.5, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(dotScale, { toValue: 1.0, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    dotAnim.start();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      w1.stop(); w2.stop(); w3.stop(); colonAnim.stop(); dotAnim.stop();
    };
  }, [step, timerStartedAt]);

  const toggleInstrument = (name: string) => {
    setSelectedInstruments((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);
  };

  const startTimer = () => {
    setTimerStartedAt(Date.now());
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setStep(3);
  };

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setSavedDuration(elapsed);
  };

  const takePicture = async () => {
    if (!cameraRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.7, base64: false });
    if (photo?.uri) {
      if (cameraMode === 'before') setPhotoBefore(photo.uri);
      else setPhotoAfter(photo.uri);
      setCameraMode(null);
    }
  };

  const pickFromGallery = async (target: 'before' | 'after') => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (!res.canceled) {
      if (target === 'before') setPhotoBefore(res.assets[0].uri);
      else setPhotoAfter(res.assets[0].uri);
    }
  };

  const uploadPhoto = async (cycleId: string, type: 'before' | 'after', uri: string, uid: string) => {
    const filePath = `${uid}/${cycleId}/${type}.jpg`;
    const response = await fetch(uri);
    const blob = await response.blob();
    const { error: uploadErr } = await supabase.storage.from('cycle-photos').upload(filePath, blob, { contentType: 'image/jpeg', upsert: true });
    if (uploadErr) throw uploadErr;
    await supabase.from('cycle_photos').insert({ cycle_id: cycleId, type, storage_path: filePath });
  };

  const finishCycle = async () => {
    if (!userId) { Alert.alert('Помилка', 'Сесія закінчилась, перезайдіть'); return; }
    setSaving(true);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const durationMinutes = Math.ceil((savedDuration || elapsed) / 60);
      const { data: cycle, error } = await supabase
        .from('sterilization_cycles')
        .insert({
          user_id: userId,
          instrument_name: selectedInstruments.join(', '),
          sterilizer_name: sterilizerName || 'Невідомий',
          packet_type: packType || 'Крафт',
          duration_minutes: durationMinutes,
          started_at: new Date(timerStartedAt || Date.now()).toISOString(),
          result: 'passed',
        })
        .select()
        .single();
      if (error) throw error;
      if (photoBefore) { try { await uploadPhoto(cycle.id, 'before', photoBefore, userId); } catch (e: any) { console.error('Upload before error:', e.message); } }
      if (photoAfter) { try { await uploadPhoto(cycle.id, 'after', photoAfter, userId); } catch (e: any) { console.error('Upload after error:', e.message); } }
      setStep(5);
    } catch (err: any) {
      Alert.alert('Помилка', err.message || 'Не вдалось зберегти');
    } finally {
      setSaving(false);
    }
  };

  const progress60 = (elapsed % 60) / 60;
  const dashOffset = RING_CIRCUMFERENCE * (1 - progress60);
  const progressAngle = progress60 * 2 * Math.PI - Math.PI / 2;
  const dotX = RING_CX + RING_R * Math.cos(progressAngle);
  const dotY = RING_CY + RING_R * Math.sin(progressAngle);

  const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const seconds = String(elapsed % 60).padStart(2, '0');

  const instrNames = instruments.length > 0 ? instruments.map((i) => i.name) : ['Кусачки', 'Пушер', 'Фрези', 'Ножиці', 'Пінцет'];
  const sterNames = sterilizers.map((s) => s.name);
  const canGoStep2 = selectedInstruments.length > 0 && packType !== null;

  // ── Camera fullscreen ──────────────────────────────────────
  if (cameraMode) {
    if (!permission) return null;
    if (!permission.granted) {
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.permissionContainer}>
            <Feather name="camera" size={48} color={COLORS.brand} />
            <Text style={styles.permissionTitle}>Потрібен доступ до камери</Text>
            <Text style={styles.permissionText}>Щоб фотографувати індикатори стерилізації, дозвольте доступ до камери</Text>
            <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission} activeOpacity={0.85}>
              <Text style={styles.permissionBtnText}>Дозволити камеру</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.permissionCancel} onPress={() => setCameraMode(null)}>
              <Text style={styles.permissionCancelText}>Скасувати</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.cameraView} facing="back">
          <SafeAreaView style={styles.cameraOverlay}>
            <View style={styles.cameraTop}>
              <TouchableOpacity style={styles.cameraCloseBtn} onPress={() => setCameraMode(null)}>
                <Feather name="x" size={22} color={COLORS.white} />
              </TouchableOpacity>
              <Text style={styles.cameraLabel}>{cameraMode === 'before' ? 'Фото ДО стерилізації' : 'Фото ПІСЛЯ стерилізації'}</Text>
              <TouchableOpacity style={styles.cameraGalleryBtn} onPress={() => { const m = cameraMode; setCameraMode(null); pickFromGallery(m!); }}>
                <Feather name="image" size={22} color={COLORS.white} />
              </TouchableOpacity>
            </View>
            <View style={styles.cameraBottom}>
              <TouchableOpacity style={styles.shutterBtn} onPress={takePicture} activeOpacity={0.7}>
                <View style={styles.shutterInner} />
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </CameraView>
      </View>
    );
  }

  // ── Photo step renderer ────────────────────────────────────
  const renderPhotoStep = (
    title: string, subtitle: string, indicatorColor: string, indicatorText: string,
    photo: string | null, target: 'before' | 'after', actionButton: React.ReactNode,
  ) => (
    <View>
      <Text style={styles.stepTitle}>{title}</Text>
      <Text style={styles.stepSubtitle}>{subtitle}</Text>
      <View style={styles.packInfo}>
        <Text style={styles.packInfoText}>Пакет: <Text style={{ fontWeight: '700' }}>{packType}</Text></Text>
        <View style={styles.indicatorRow}>
          <View style={[styles.indicatorDot, { backgroundColor: indicatorColor }]} />
          <Text style={styles.indicatorText}>{indicatorText}</Text>
        </View>
      </View>
      {photo ? (
        <View style={styles.previewContainer}>
          <Image source={{ uri: photo }} style={styles.photoPreview} />
          <View style={styles.previewActions}>
            <TouchableOpacity style={styles.retakeBtn} onPress={() => setCameraMode(target)} activeOpacity={0.8}>
              <Feather name="rotate-ccw" size={16} color={COLORS.brand} />
              <Text style={styles.retakeBtnText}>Перезняти</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.gallerySmallBtn} onPress={() => pickFromGallery(target)} activeOpacity={0.8}>
              <Feather name="image" size={16} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.photoBtn} onPress={() => setCameraMode(target)} activeOpacity={0.8}>
          <View style={styles.photoPlaceholder}>
            <Feather name="camera" size={32} color={COLORS.brand} />
            <Text style={styles.photoPlaceholderText}>Натисніть для фото</Text>
          </View>
        </TouchableOpacity>
      )}
      {actionButton}
    </View>
  );

  // ── Ripple wave component ──────────────────────────────────
  const renderWave = (scaleAnim: Animated.Value, opacityAnim: Animated.Value) => (
    <Animated.View
      style={[
        styles.wave,
        { opacity: opacityAnim, transform: [{ scale: scaleAnim }] },
      ]}
    />
  );

  // ── Main wizard ────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Новий цикл</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Feather name="x" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      {step < 5 && (
        <View style={styles.progress}>
          {[1, 2, 3, 4].map((s) => (
            <View key={s} style={[styles.progressDot, s === step && styles.progressDotActive, s < step && styles.progressDotDone]} />
          ))}
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* ── Step 1: Packaging ── */}
        {step === 1 && (
          <View>
            <Text style={styles.stepTitle}>Упаковка</Text>
            <Text style={styles.stepSubtitle}>Оберіть інструменти, пакет і стерилізатор</Text>

            <Text style={styles.fieldLabel}>Інструменти</Text>
            <View style={styles.chips}>
              {instrNames.map((name) => {
                const active = selectedInstruments.includes(name);
                return (
                  <TouchableOpacity key={name} style={[styles.chip, active && styles.chipActive]} onPress={() => toggleInstrument(name)} activeOpacity={0.8}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Тип пакета</Text>
            <View style={styles.packRow}>
              {(['Крафт', 'Прозорий', 'Білий'] as PackType[]).map((type) => {
                const active = packType === type;
                return (
                  <TouchableOpacity key={type} style={[styles.packBtn, active && styles.packBtnActive]} onPress={() => setPackType(type)} activeOpacity={0.8}>
                    <Text style={[styles.packBtnText, active && styles.packBtnTextActive]}>{type}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Стерилізатор</Text>
            {sterNames.length > 0 ? (
              <View style={styles.chips}>
                {sterNames.map((name) => {
                  const active = sterilizerName === name;
                  return (
                    <TouchableOpacity key={name} style={[styles.chip, active && styles.chipActive]} onPress={() => setSterilizerName(name)} activeOpacity={0.8}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <TextInput style={styles.input} placeholder="Назва стерилізатора" placeholderTextColor={COLORS.textSecondary} value={sterilizerName} onChangeText={setSterilizerName} />
            )}

            <TouchableOpacity style={[styles.nextBtn, !canGoStep2 && styles.nextBtnDisabled]} disabled={!canGoStep2} onPress={() => setStep(2)} activeOpacity={0.85}>
              <Text style={styles.nextBtnText}>Далі</Text>
              <Feather name="chevron-right" size={18} color={COLORS.white} />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Step 2: Photo before ── */}
        {step === 2 && renderPhotoStep(
          'Фото ДО', 'Сфотографуйте індикатор на пакеті',
          COLORS.textSecondary, 'Індикатор не змінений', photoBefore, 'before',
          <TouchableOpacity activeOpacity={0.85} onPress={startTimer}>
            <LinearGradient colors={[BRAND_DARK, BRAND]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.gradientBtn}>
              <Feather name="play" size={18} color={COLORS.white} />
              <Text style={styles.gradientBtnText}>Почати стерилізацію</Text>
            </LinearGradient>
          </TouchableOpacity>,
        )}

        {/* ── Step 3: Timer with water ripples ── */}
        {step === 3 && (
          <View style={styles.timerSection}>
            <View style={styles.ringContainer}>
              {renderWave(wave1Scale, wave1Opacity)}
              {renderWave(wave2Scale, wave2Opacity)}
              {renderWave(wave3Scale, wave3Opacity)}

              <Svg width={RING_SIZE} height={RING_SIZE} style={styles.ringSvg}>
                <SvgCircle cx={RING_CX} cy={RING_CY} r={RING_R} stroke={COLORS.cardBg} strokeWidth={4} fill="none" />
                <SvgCircle
                  cx={RING_CX} cy={RING_CY} r={RING_R}
                  stroke={COLORS.brand} strokeWidth={4} fill="none"
                  strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  transform={`rotate(-90 ${RING_CX} ${RING_CY})`}
                />
              </Svg>

              <Animated.View style={[
                styles.leaderDot,
                { left: dotX - 6, top: dotY - 6, transform: [{ scale: dotScale }] },
              ]}>
                <View style={styles.leaderDotInner} />
              </Animated.View>

              <View style={styles.timerCenter}>
                <View style={styles.timeRow}>
                  <Text style={styles.timeDigit}>{minutes}</Text>
                  <Animated.Text style={[styles.timeColon, { opacity: colonOpacity }]}>:</Animated.Text>
                  <Text style={styles.timeDigit}>{seconds}</Text>
                </View>
                <Text style={styles.timerLabel}>СТЕРИЛІЗАЦІЯ</Text>
              </View>
            </View>

            <View style={styles.infoCard}>
              <View style={styles.infoColumns}>
                <View style={styles.infoCol}>
                  <MaterialCommunityIcons name="thermometer" size={20} color={COLORS.brand} />
                  <Text style={styles.infoValue}>180°C</Text>
                  <Text style={styles.infoLabel}>Температура</Text>
                </View>
                <View style={styles.infoDivider} />
                <View style={styles.infoCol}>
                  <MaterialCommunityIcons name="radiator" size={20} color={COLORS.brand} />
                  <Text style={styles.infoValue} numberOfLines={1}>{sterilizerName || 'Сухожар'}</Text>
                  <Text style={styles.infoLabel}>Стерилізатор</Text>
                </View>
                <View style={styles.infoDivider} />
                <View style={styles.infoCol}>
                  <MaterialCommunityIcons name="scissors-cutting" size={20} color={COLORS.brand} />
                  <Text style={styles.infoValue} numberOfLines={1}>{selectedInstruments[0] || 'Інструмент'}</Text>
                  <Text style={styles.infoLabel}>{selectedInstruments.length > 1 ? `+${selectedInstruments.length - 1} ще` : 'Інструмент'}</Text>
                </View>
              </View>
              <View style={styles.infoPacketRow}>
                <View style={[styles.indicatorDot, { backgroundColor: COLORS.brand }]} />
                <Text style={styles.infoPacketText}>Пакет: {packType} · Індикатор має змінитись</Text>
              </View>
            </View>

            <TouchableOpacity activeOpacity={0.85} onPress={() => { stopTimer(); setStep(4); }}>
              <LinearGradient colors={[BRAND_DARK, BRAND]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.gradientBtn}>
                <Feather name="camera" size={18} color={COLORS.white} />
                <Text style={styles.gradientBtnText}>Зупинити і зробити фото ПІСЛЯ</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Step 4: Photo after ── */}
        {step === 4 && renderPhotoStep(
          'Фото ПІСЛЯ', 'Сфотографуйте зміну кольору індикатора',
          COLORS.success, 'Індикатор має змінитись', photoAfter, 'after',
          <TouchableOpacity style={[styles.finishBtn, saving && { opacity: 0.6 }]} onPress={finishCycle} disabled={saving} activeOpacity={0.85}>
            <Feather name="check-circle" size={20} color={COLORS.white} />
            <Text style={styles.finishBtnText}>{saving ? 'Збереження...' : 'Завершити цикл'}</Text>
          </TouchableOpacity>,
        )}

        {/* ── Step 5: Result ── */}
        {step === 5 && (
          <View style={styles.resultContainer}>
            <View style={styles.resultCheck}><Feather name="check-circle" size={56} color={COLORS.success} /></View>
            <Text style={styles.resultTitle}>Цикл завершено!</Text>
            <Text style={styles.resultSubtitle}>Запис додано до журналу</Text>
            <View style={styles.resultCard}>
              <ResultRow label="Час стерилізації" value={`${String(Math.floor((savedDuration || elapsed) / 60)).padStart(2, '0')}:${String((savedDuration || elapsed) % 60).padStart(2, '0')}`} mono />
              <ResultRow label="Інструменти" value={selectedInstruments.join(', ')} />
              <ResultRow label="Пакет" value={packType || ''} />
              <ResultRow label="Стерилізатор" value={sterilizerName || ''} />
              <ResultRow label="Індикатор" value="Пройшов" color={COLORS.success} />
            </View>
            <TouchableOpacity activeOpacity={0.85} onPress={() => router.replace('/')}>
              <LinearGradient colors={[BRAND_DARK, BRAND]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.gradientBtn}>
                <Feather name="home" size={18} color={COLORS.white} />
                <Text style={styles.gradientBtnText}>На головну</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ResultRow({ label, value, mono, color }: { label: string; value: string; mono?: boolean; color?: string }) {
  return (
    <View style={styles.resultRow}>
      <Text style={styles.resultRowLabel}>{label}</Text>
      <Text style={[styles.resultRowValue, mono && { fontVariant: ['tabular-nums'] as any, fontWeight: '700' }, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  progress: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingVertical: 12 },
  progressDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: COLORS.border },
  progressDotActive: { backgroundColor: COLORS.brand },
  progressDotDone: { backgroundColor: COLORS.brand },
  body: { padding: 20, paddingBottom: 40 },
  stepTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  stepSubtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4, marginBottom: 20 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 40, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.white },
  chipActive: { borderColor: COLORS.brand, backgroundColor: COLORS.brand },
  chipText: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  chipTextActive: { color: COLORS.white },
  packRow: { flexDirection: 'row', gap: 10 },
  packBtn: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  packBtnActive: { borderColor: COLORS.brand, borderWidth: 2 },
  packBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  packBtnTextActive: { color: COLORS.brand, fontWeight: '700' },
  input: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, fontSize: 14, color: COLORS.text, backgroundColor: COLORS.bg },
  nextBtn: { flexDirection: 'row', height: 56, borderRadius: 14, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 28, shadowColor: BRAND, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.white },
  packInfo: { backgroundColor: COLORS.cardBg, borderRadius: 12, padding: 14, gap: 8, marginBottom: 20 },
  packInfoText: { fontSize: 14, color: COLORS.text },
  indicatorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  indicatorDot: { width: 8, height: 8, borderRadius: 4 },
  indicatorText: { fontSize: 13, color: COLORS.textSecondary },

  photoBtn: { borderRadius: 16, overflow: 'hidden', marginBottom: 20 },
  photoPreview: { width: '100%', height: 220, borderRadius: 16 },
  photoPlaceholder: { height: 180, borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: COLORS.border, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', gap: 8 },
  photoPlaceholderText: { fontSize: 14, color: COLORS.textSecondary },
  previewContainer: { marginBottom: 20 },
  previewActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  retakeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.brand, backgroundColor: COLORS.white },
  retakeBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.brand },
  gallerySmallBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },

  cameraContainer: { flex: 1, backgroundColor: '#000' },
  cameraView: { flex: 1 },
  cameraOverlay: { flex: 1, justifyContent: 'space-between' },
  cameraTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  cameraCloseBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  cameraLabel: { fontSize: 15, fontWeight: '700', color: COLORS.white, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  cameraGalleryBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  cameraBottom: { alignItems: 'center', paddingBottom: 32 },
  shutterBtn: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: COLORS.white, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)' },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.white },

  permissionContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  permissionTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  permissionText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },
  permissionBtn: { height: 52, borderRadius: 14, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', marginTop: 8 },
  permissionBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.white },
  permissionCancel: { padding: 12 },
  permissionCancelText: { fontSize: 14, color: COLORS.textSecondary },

  // ── Timer / Water ripples ──────────────────────────────
  timerSection: { alignItems: 'center' },
  ringContainer: {
    width: RING_SIZE + 80,
    height: RING_SIZE + 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  wave: {
    position: 'absolute',
    width: WAVE_BASE,
    height: WAVE_BASE,
    borderRadius: WAVE_BASE / 2,
    borderWidth: 1.5,
    borderColor: COLORS.brand,
  },
  ringSvg: { position: 'absolute' },
  leaderDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    shadowColor: COLORS.brand,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 4,
  },
  leaderDotInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.brand,
  },
  timerCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeRow: { flexDirection: 'row', alignItems: 'baseline' },
  timeDigit: {
    fontSize: 48,
    fontWeight: '200',
    color: COLORS.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: 2,
  },
  timeColon: {
    fontSize: 48,
    fontWeight: '200',
    color: COLORS.text,
    marginHorizontal: 2,
  },
  timerLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: 4,
  },

  infoCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    padding: 16,
    width: '100%',
    marginBottom: 24,
  },
  infoColumns: { flexDirection: 'row', alignItems: 'center' },
  infoCol: { flex: 1, alignItems: 'center', gap: 4 },
  infoDivider: { width: 1, height: 40, backgroundColor: COLORS.border },
  infoValue: { fontSize: 14, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  infoLabel: { fontSize: 11, color: COLORS.textSecondary, textAlign: 'center' },
  infoPacketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  infoPacketText: { fontSize: 13, color: COLORS.textSecondary },

  gradientBtn: {
    flexDirection: 'row',
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: BRAND,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  gradientBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.white },

  finishBtn: { flexDirection: 'row', height: 56, borderRadius: 14, backgroundColor: COLORS.success, alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: COLORS.success, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  finishBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.white },
  resultContainer: { alignItems: 'center', paddingTop: 20 },
  resultCheck: { marginBottom: 16 },
  resultTitle: { fontSize: 24, fontWeight: '800', color: COLORS.text },
  resultSubtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4, marginBottom: 24 },
  resultCard: { width: '100%', backgroundColor: COLORS.white, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 16, gap: 12, marginBottom: 24 },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultRowLabel: { fontSize: 13, color: COLORS.textSecondary },
  resultRowValue: { fontSize: 14, fontWeight: '600', color: COLORS.text, textAlign: 'right', flex: 1, marginLeft: 12 },
});
