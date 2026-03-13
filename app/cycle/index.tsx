import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView,
  TextInput, Alert, Image, Animated, Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import ReAnimated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { supabase } from '../../lib/supabase';
import {
  createSession, updateSession, uploadSessionPhoto, getPhotoUrl,
  type SterilizationSession,
} from '../../lib/api';
import { useAuth } from '../_layout';
import { COLORS } from '../../lib/constants';

const RING_SIZE = 260;
const RING_CX = RING_SIZE / 2;
const RING_CY = RING_SIZE / 2;
const RING_R = 95;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

type PackType = 'kraft' | 'transparent' | 'white';
const PACK_LABELS: Record<PackType, string> = { kraft: 'Крафт', transparent: 'Прозорий', white: 'Білий' };

interface InstrumentRow { id: string; name: string; }
interface SterilizerRow { id: string; name: string; type: string | null; }

export default function CycleScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [step, setStep] = useState(1);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<'before' | 'after' | null>(null);

  const [selectedInstruments, setSelectedInstruments] = useState<string[]>([]);
  const [packType, setPackType] = useState<PackType | null>(null);
  const [sterilizerName, setSterilizerName] = useState('');
  const [sterilizerId, setSterilizerId] = useState<string | null>(null);
  const [temperature, setTemperature] = useState('180');
  const [durationInput, setDurationInput] = useState('30');

  const [photoBefore, setPhotoBefore] = useState<string | null>(null);
  const [photoBeforePath, setPhotoBeforePath] = useState<string | null>(null);
  const [photoAfter, setPhotoAfter] = useState<string | null>(null);
  const [photoAfterPath, setPhotoAfterPath] = useState<string | null>(null);

  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [timerDone, setTimerDone] = useState(false);
  const [selectedResult, setSelectedResult] = useState<'success' | 'fail' | null>(null);
  const [saving, setSaving] = useState(false);

  const [instruments, setInstruments] = useState<InstrumentRow[]>([]);
  const [sterilizers, setSterilizers] = useState<SterilizerRow[]>([]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const colonOpacity = useRef(new Animated.Value(1)).current;
  const dotScale = useRef(new Animated.Value(1)).current;

  const durationSeconds = (parseInt(durationInput, 10) || 0) * 60;
  const remaining = Math.max(0, durationSeconds - elapsed);
  const remainMin = String(Math.floor(remaining / 60)).padStart(2, '0');
  const remainSec = String(remaining % 60).padStart(2, '0');
  const progress = durationSeconds > 0 ? Math.min(1, elapsed / durationSeconds) : 0;

  useEffect(() => {
    (async () => {
      let uid = userId;
      if (!uid) {
        const { data } = await supabase.auth.getSession();
        uid = data?.session?.user?.id;
      }
      if (!uid) return;
      const [instrRes, sterRes] = await Promise.all([
        supabase.from('instruments').select('*').eq('user_id', uid),
        supabase.from('sterilizers').select('*').eq('user_id', uid),
      ]);
      setInstruments(instrRes.data ?? []);
      setSterilizers(sterRes.data ?? []);
    })();
  }, [userId]);

  useEffect(() => {
    if (step !== 3 || !timerStartedAt) return;

    timerRef.current = setInterval(() => {
      const newElapsed = Math.floor((Date.now() - timerStartedAt) / 1000);
      setElapsed(newElapsed);
      if (newElapsed > 0 && newElapsed % 60 === 0) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      if (newElapsed >= durationSeconds && durationSeconds > 0) {
        setTimerDone(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }, 1000);

    const colonAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(colonOpacity, { toValue: 0.25, duration: 500, useNativeDriver: true }),
        Animated.timing(colonOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    colonAnim.start();

    const dotAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(dotScale, { toValue: 1.4, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(dotScale, { toValue: 1.0, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    dotAnim.start();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      colonAnim.stop();
      dotAnim.stop();
    };
  }, [step, timerStartedAt]);

  const getUid = useCallback(async (): Promise<string | null> => {
    if (userId) return userId;
    const { data } = await supabase.auth.refreshSession();
    if (data?.session?.user?.id) return data.session.user.id;
    const { data: d2 } = await supabase.auth.getSession();
    return d2?.session?.user?.id ?? null;
  }, [userId]);

  const toggleInstrument = (name: string) => {
    setSelectedInstruments((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  };

  // ── Step 1 → 2: Create session as draft ─────────────────
  const handleStep1Next = async () => {
    if (selectedInstruments.length === 0) { Alert.alert('Помилка', 'Оберіть інструменти'); return; }
    if (!packType) { Alert.alert('Помилка', 'Оберіть тип пакета'); return; }
    if (!sterilizerName.trim()) { Alert.alert('Помилка', 'Вкажіть стерилізатор'); return; }
    const temp = parseInt(temperature, 10);
    const dur = parseInt(durationInput, 10);
    if (!temp || temp < 100 || temp > 300) { Alert.alert('Помилка', 'Температура: 100–300 °C'); return; }
    if (!dur || dur < 1) { Alert.alert('Помилка', 'Час: мінімум 1 хвилина'); return; }

    setSaving(true);
    try {
      const uid = await getUid();
      if (!uid) { Alert.alert('Помилка', 'Сесія закінчилась'); return; }

      const profile = await supabase.from('profiles').select('salon_name').eq('id', uid).maybeSingle();

      const sess = await createSession(uid, {
        salon_name: profile.data?.salon_name ?? undefined,
        sterilizer_id: sterilizerId ?? undefined,
        sterilizer_name: sterilizerName.trim(),
        instrument_names: selectedInstruments.join(', '),
        packet_type: packType,
        temperature: temp,
        duration_minutes: dur,
      });
      setSessionId(sess.id);
      setStep(2);
    } catch (err: any) {
      Alert.alert('Помилка', err.message || 'Не вдалось створити сесію');
    } finally {
      setSaving(false);
    }
  };

  // ── Step 2 → 3: Upload before photo, start timer ────────
  const handleStep2Next = async () => {
    if (!photoBefore) { Alert.alert('Помилка', 'Зробіть фото ДО стерилізації'); return; }
    if (!sessionId) return;

    setSaving(true);
    try {
      const uid = await getUid();
      if (!uid) { Alert.alert('Помилка', 'Сесія закінчилась'); return; }

      const path = await uploadSessionPhoto(uid, sessionId, 'before', photoBefore);
      setPhotoBeforePath(path);

      const now = new Date().toISOString();
      await updateSession(sessionId, { photo_before_path: path, status: 'in_progress', started_at: now });

      setTimerStartedAt(Date.now());
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setStep(3);
    } catch (err: any) {
      Alert.alert('Помилка', err.message || 'Не вдалось завантажити фото');
    } finally {
      setSaving(false);
    }
  };

  // ── Step 3 → 4: Stop timer ──────────────────────────────
  const handleStep3Next = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setStep(4);
  };

  // ── Step 4 → 5: Upload after photo ──────────────────────
  const handleStep4Next = async () => {
    if (!photoAfter) { Alert.alert('Помилка', 'Зробіть фото ПІСЛЯ стерилізації'); return; }
    if (!sessionId) return;

    setSaving(true);
    try {
      const uid = await getUid();
      if (!uid) { Alert.alert('Помилка', 'Сесія закінчилась'); return; }

      const path = await uploadSessionPhoto(uid, sessionId, 'after', photoAfter);
      setPhotoAfterPath(path);

      await updateSession(sessionId, { photo_after_path: path, ended_at: new Date().toISOString() });
      setStep(5);
    } catch (err: any) {
      Alert.alert('Помилка', err.message || 'Не вдалось завантажити фото');
    } finally {
      setSaving(false);
    }
  };

  // ── Step 5: Save result ─────────────────────────────────
  const handleFinish = async () => {
    if (!selectedResult) { Alert.alert('Помилка', 'Оберіть результат стерилізації'); return; }
    if (!sessionId) return;

    setSaving(true);
    try {
      const finalStatus = selectedResult === 'success' ? 'completed' : 'failed';
      await updateSession(sessionId, { result: selectedResult, status: finalStatus });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep(6);
    } catch (err: any) {
      Alert.alert('Помилка', err.message || 'Не вдалось зберегти');
    } finally {
      setSaving(false);
    }
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

  const dashOffset = RING_CIRCUMFERENCE * (1 - progress);
  const progressAngle = progress * 2 * Math.PI - Math.PI / 2;
  const dotX = RING_CX + RING_R * Math.cos(progressAngle);
  const dotY = RING_CY + RING_R * Math.sin(progressAngle);

  const instrNames = instruments.length > 0
    ? instruments.map((i) => i.name)
    : ['Кусачки', 'Пушер', 'Фрези', 'Ножиці', 'Пінцет'];

  const canGoStep2 = selectedInstruments.length > 0 && packType !== null && sterilizerName.trim() !== '';

  // ── Camera fullscreen ───────────────────────────────────
  if (cameraMode) {
    if (!permission) return null;
    if (!permission.granted) {
      return (
        <SafeAreaView style={s.container}>
          <View style={s.permissionContainer}>
            <Feather name="camera" size={48} color={COLORS.brand} />
            <Text style={s.permTitle}>Потрібен доступ до камери</Text>
            <Text style={s.permText}>Щоб фотографувати індикатори, дозвольте камеру</Text>
            <TouchableOpacity style={s.permBtn} onPress={requestPermission}><Text style={s.permBtnText}>Дозволити</Text></TouchableOpacity>
            <TouchableOpacity style={s.permCancel} onPress={() => setCameraMode(null)}><Text style={s.permCancelText}>Скасувати</Text></TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }
    return (
      <View style={s.cameraWrap}>
        <CameraView ref={cameraRef} style={s.cameraView} facing="back">
          <SafeAreaView style={s.cameraOverlay}>
            <View style={s.cameraTop}>
              <TouchableOpacity style={s.cameraClose} onPress={() => setCameraMode(null)}>
                <Feather name="x" size={22} color="#fff" />
              </TouchableOpacity>
              <Text style={s.cameraLabel}>{cameraMode === 'before' ? 'Фото ДО' : 'Фото ПІСЛЯ'}</Text>
              <TouchableOpacity style={s.cameraGallery} onPress={() => { const m = cameraMode; setCameraMode(null); pickFromGallery(m!); }}>
                <Feather name="image" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={s.cameraBottom}>
              <TouchableOpacity style={s.shutter} onPress={takePicture} activeOpacity={0.7}>
                <View style={s.shutterInner} />
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </CameraView>
      </View>
    );
  }

  // ── Main wizard ─────────────────────────────────────────
  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Новий цикл</Text>
        <TouchableOpacity style={s.closeBtn} onPress={() => router.back()}>
          <Feather name="x" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      {step <= 5 && (
        <View style={s.progressBar}>
          {[1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={[s.progSeg, i <= step && s.progSegActive]} />
          ))}
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">

        {/* ── STEP 1: Preparation ───────────────────── */}
        {step === 1 && (
          <ReAnimated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
            <Text style={s.stepTitle}>Підготовка</Text>
            <Text style={s.stepSub}>Оберіть інструменти, пакет, стерилізатор, температуру і час</Text>

            <Text style={s.fieldLabel}>Інструменти</Text>
            <View style={s.chips}>
              {instrNames.map((name) => {
                const active = selectedInstruments.includes(name);
                return (
                  <TouchableOpacity key={name} style={[s.chip, active && s.chipActive]} onPress={() => toggleInstrument(name)} activeOpacity={0.8}>
                    <Text style={[s.chipText, active && s.chipTextActive]}>{name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={s.fieldLabel}>Тип пакета</Text>
            <View style={s.packRow}>
              {(['kraft', 'transparent', 'white'] as PackType[]).map((t) => (
                <TouchableOpacity key={t} style={[s.packBtn, packType === t && s.packBtnActive]} onPress={() => setPackType(t)} activeOpacity={0.8}>
                  <Text style={[s.packBtnText, packType === t && s.packBtnTextActive]}>{PACK_LABELS[t]}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.fieldLabel}>Стерилізатор</Text>
            {sterilizers.length > 0 ? (
              <View style={s.chips}>
                {sterilizers.map((st) => {
                  const active = sterilizerName === st.name;
                  return (
                    <TouchableOpacity key={st.id} style={[s.chip, active && s.chipActive]} onPress={() => { setSterilizerName(st.name); setSterilizerId(st.id); }} activeOpacity={0.8}>
                      <Text style={[s.chipText, active && s.chipTextActive]}>{st.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <TextInput style={s.input} placeholder="Назва стерилізатора" placeholderTextColor={COLORS.textSecondary} value={sterilizerName} onChangeText={setSterilizerName} />
            )}

            <View style={s.row2}>
              <View style={s.halfField}>
                <Text style={s.fieldLabel}>Температура, °C</Text>
                <TextInput style={s.input} keyboardType="number-pad" value={temperature} onChangeText={setTemperature} placeholder="180" placeholderTextColor={COLORS.textSecondary} />
              </View>
              <View style={s.halfField}>
                <Text style={s.fieldLabel}>Час, хв</Text>
                <TextInput style={s.input} keyboardType="number-pad" value={durationInput} onChangeText={setDurationInput} placeholder="30" placeholderTextColor={COLORS.textSecondary} />
              </View>
            </View>

            <TouchableOpacity
              style={[s.primaryBtn, (!canGoStep2 || saving) && { opacity: 0.4 }]}
              disabled={!canGoStep2 || saving}
              onPress={handleStep1Next}
              activeOpacity={0.85}
            >
              <Text style={s.primaryBtnText}>{saving ? 'Зберігаю...' : 'Далі'}</Text>
              <Feather name="chevron-right" size={18} color="#fff" />
            </TouchableOpacity>
          </ReAnimated.View>
        )}

        {/* ── STEP 2: Photo before ──────────────────── */}
        {step === 2 && (
          <ReAnimated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
            <Text style={s.stepTitle}>Фото ДО стерилізації</Text>
            <Text style={s.stepSub}>Сфотографуйте індикатор на пакеті перед стерилізацією</Text>

            {photoBefore ? (
              <View style={s.previewWrap}>
                <Image source={{ uri: photoBefore }} style={s.preview} />
                <View style={s.previewActions}>
                  <TouchableOpacity style={s.retakeBtn} onPress={() => setCameraMode('before')}><Feather name="rotate-ccw" size={16} color={COLORS.brand} /><Text style={s.retakeText}>Перезняти</Text></TouchableOpacity>
                  <TouchableOpacity style={s.galleryBtn} onPress={() => pickFromGallery('before')}><Feather name="image" size={16} color={COLORS.textSecondary} /></TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={s.photoPlaceholder} onPress={() => setCameraMode('before')} activeOpacity={0.8}>
                <Feather name="camera" size={32} color={COLORS.brand} />
                <Text style={s.photoPlaceholderText}>Натисніть для фото</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[s.primaryBtn, (!photoBefore || saving) && { opacity: 0.4 }]}
              disabled={!photoBefore || saving}
              onPress={handleStep2Next}
              activeOpacity={0.85}
            >
              <LinearGradient colors={[COLORS.brandDark, COLORS.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.gradientInner}>
                <Feather name="play" size={18} color="#fff" />
                <Text style={s.gradientText}>{saving ? 'Завантажую...' : 'Почати стерилізацію'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </ReAnimated.View>
        )}

        {/* ── STEP 3: Timer ─────────────────────────── */}
        {step === 3 && (
          <ReAnimated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={s.timerSection}>
            <View style={s.ringContainer}>
              <Svg width={RING_SIZE} height={RING_SIZE}>
                <SvgCircle cx={RING_CX} cy={RING_CY} r={RING_R} stroke={COLORS.cardBg} strokeWidth={4} fill="none" />
                <SvgCircle
                  cx={RING_CX} cy={RING_CY} r={RING_R}
                  stroke={timerDone ? COLORS.success : COLORS.brand}
                  strokeWidth={4} fill="none"
                  strokeDasharray={`${RING_CIRCUMFERENCE}`}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  transform={`rotate(-90 ${RING_CX} ${RING_CY})`}
                />
              </Svg>

              {!timerDone && (
                <Animated.View style={[s.leaderDot, { left: dotX - 6, top: dotY - 6, transform: [{ scale: dotScale }] }]}>
                  <View style={s.leaderDotInner} />
                </Animated.View>
              )}

              <View style={s.timerCenter}>
                {timerDone ? (
                  <>
                    <Feather name="check-circle" size={48} color={COLORS.success} />
                    <Text style={[s.timerLabel, { color: COLORS.success, marginTop: 8 }]}>Завершено</Text>
                  </>
                ) : (
                  <>
                    <View style={s.timeRow}>
                      <Text style={s.timeDigit}>{remainMin}</Text>
                      <Animated.Text style={[s.timeColon, { opacity: colonOpacity }]}>:</Animated.Text>
                      <Text style={s.timeDigit}>{remainSec}</Text>
                    </View>
                    <Text style={s.timerLabel}>ЗАЛИШИЛОСЬ</Text>
                  </>
                )}
              </View>
            </View>

            <View style={s.infoCard}>
              <View style={s.infoColumns}>
                <View style={s.infoCol}>
                  <MaterialCommunityIcons name="thermometer" size={20} color={COLORS.brand} />
                  <Text style={s.infoValue}>{temperature}°C</Text>
                </View>
                <View style={s.infoDivider} />
                <View style={s.infoCol}>
                  <MaterialCommunityIcons name="radiator" size={20} color={COLORS.brand} />
                  <Text style={s.infoValue} numberOfLines={1}>{sterilizerName}</Text>
                </View>
                <View style={s.infoDivider} />
                <View style={s.infoCol}>
                  <MaterialCommunityIcons name="scissors-cutting" size={20} color={COLORS.brand} />
                  <Text style={s.infoValue} numberOfLines={1}>{selectedInstruments[0]}</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity style={s.primaryBtn} onPress={handleStep3Next} activeOpacity={0.85}>
              <LinearGradient colors={[COLORS.brandDark, COLORS.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.gradientInner}>
                <Feather name="camera" size={18} color="#fff" />
                <Text style={s.gradientText}>{timerDone ? 'Зробити фото ПІСЛЯ' : 'Зупинити і зробити фото'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </ReAnimated.View>
        )}

        {/* ── STEP 4: Photo after ──────────────────── */}
        {step === 4 && (
          <ReAnimated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
            <Text style={s.stepTitle}>Фото ПІСЛЯ стерилізації</Text>
            <Text style={s.stepSub}>Сфотографуйте зміну кольору індикатора</Text>

            {photoAfter ? (
              <View style={s.previewWrap}>
                <Image source={{ uri: photoAfter }} style={s.preview} />
                <View style={s.previewActions}>
                  <TouchableOpacity style={s.retakeBtn} onPress={() => setCameraMode('after')}><Feather name="rotate-ccw" size={16} color={COLORS.brand} /><Text style={s.retakeText}>Перезняти</Text></TouchableOpacity>
                  <TouchableOpacity style={s.galleryBtn} onPress={() => pickFromGallery('after')}><Feather name="image" size={16} color={COLORS.textSecondary} /></TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={s.photoPlaceholder} onPress={() => setCameraMode('after')} activeOpacity={0.8}>
                <Feather name="camera" size={32} color={COLORS.brand} />
                <Text style={s.photoPlaceholderText}>Натисніть для фото</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[s.primaryBtn, (!photoAfter || saving) && { opacity: 0.4 }]}
              disabled={!photoAfter || saving}
              onPress={handleStep4Next}
              activeOpacity={0.85}
            >
              <Text style={s.primaryBtnText}>{saving ? 'Завантажую...' : 'Далі — підтвердження'}</Text>
              <Feather name="chevron-right" size={18} color="#fff" />
            </TouchableOpacity>
          </ReAnimated.View>
        )}

        {/* ── STEP 5: Confirm result ───────────────── */}
        {step === 5 && (
          <ReAnimated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
            <Text style={s.stepTitle}>Підтвердження</Text>
            <Text style={s.stepSub}>Порівняйте індикатор ДО і ПІСЛЯ та оберіть результат</Text>

            <View style={s.photoCompare}>
              <View style={s.photoCompareCol}>
                <Text style={s.compareLabel}>ДО</Text>
                {photoBefore ? <Image source={{ uri: photoBefore }} style={s.compareImg} /> : <View style={s.comparePlaceholder} />}
              </View>
              <View style={s.photoCompareCol}>
                <Text style={s.compareLabel}>ПІСЛЯ</Text>
                {photoAfter ? <Image source={{ uri: photoAfter }} style={s.compareImg} /> : <View style={s.comparePlaceholder} />}
              </View>
            </View>

            <Text style={[s.fieldLabel, { marginTop: 20 }]}>Результат стерилізації</Text>

            <TouchableOpacity
              style={[s.resultOption, selectedResult === 'success' && s.resultSuccess]}
              onPress={() => setSelectedResult('success')}
              activeOpacity={0.8}
            >
              <Feather name="check-circle" size={22} color={selectedResult === 'success' ? COLORS.success : COLORS.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={[s.resultTitle, selectedResult === 'success' && { color: COLORS.success }]}>Індикатор змінився</Text>
                <Text style={s.resultDesc}>Стерилізація пройшла успішно</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.resultOption, selectedResult === 'fail' && s.resultFail]}
              onPress={() => setSelectedResult('fail')}
              activeOpacity={0.8}
            >
              <Feather name="alert-circle" size={22} color={selectedResult === 'fail' ? COLORS.danger : COLORS.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={[s.resultTitle, selectedResult === 'fail' && { color: COLORS.danger }]}>Не змінився</Text>
                <Text style={s.resultDesc}>Стерилізація не пройшла — повторити</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                s.primaryBtn,
                (!selectedResult || saving) && { opacity: 0.4 },
                selectedResult === 'success' && { backgroundColor: COLORS.success },
                selectedResult === 'fail' && { backgroundColor: COLORS.danger },
              ]}
              disabled={!selectedResult || saving}
              onPress={handleFinish}
              activeOpacity={0.85}
            >
              <Feather name="check" size={18} color="#fff" />
              <Text style={s.primaryBtnText}>{saving ? 'Зберігаю...' : 'Зберегти результат'}</Text>
            </TouchableOpacity>
          </ReAnimated.View>
        )}

        {/* ── STEP 6: Done ─────────────────────────── */}
        {step === 6 && (
          <ReAnimated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={s.doneSection}>
            <Feather
              name={selectedResult === 'success' ? 'check-circle' : 'alert-triangle'}
              size={56}
              color={selectedResult === 'success' ? COLORS.success : COLORS.danger}
            />
            <Text style={s.doneTitle}>
              {selectedResult === 'success' ? 'Цикл завершено!' : 'Стерилізація не пройшла'}
            </Text>
            <Text style={s.doneSub}>
              {selectedResult === 'success'
                ? 'Запис збережено в журналі'
                : 'Запис збережено як невдалий. Повторіть стерилізацію.'}
            </Text>

            <TouchableOpacity activeOpacity={0.85} onPress={() => router.replace('/(tabs)/journal')}>
              <LinearGradient colors={[COLORS.brandDark, COLORS.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.gradientInner}>
                <Feather name="book-open" size={18} color="#fff" />
                <Text style={s.gradientText}>До журналу</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={s.secondaryBtn} onPress={() => router.replace('/(tabs)')}>
              <Feather name="home" size={16} color={COLORS.textSecondary} />
              <Text style={s.secondaryBtnText}>На головну</Text>
            </TouchableOpacity>
          </ReAnimated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  progressBar: { flexDirection: 'row', gap: 5, paddingHorizontal: 20, paddingVertical: 10 },
  progSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: COLORS.border },
  progSegActive: { backgroundColor: COLORS.brand },
  body: { padding: 20, paddingBottom: 40 },

  stepTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  stepSub: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4, marginBottom: 20, lineHeight: 20 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 40, borderWidth: 1.5, borderColor: COLORS.border },
  chipActive: { borderColor: COLORS.brand, backgroundColor: COLORS.brand },
  chipText: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  chipTextActive: { color: '#fff' },
  packRow: { flexDirection: 'row', gap: 10 },
  packBtn: { flex: 1, height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  packBtnActive: { borderColor: COLORS.brand, borderWidth: 2 },
  packBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  packBtnTextActive: { color: COLORS.brand, fontWeight: '700' },
  input: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, fontSize: 15, color: COLORS.text, backgroundColor: COLORS.bg },
  row2: { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1 },

  primaryBtn: { flexDirection: 'row', height: 54, borderRadius: 14, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 24 },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  gradientInner: { flexDirection: 'row', height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 8 },
  gradientText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  photoPlaceholder: { height: 180, borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: COLORS.border, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', gap: 8 },
  photoPlaceholderText: { fontSize: 14, color: COLORS.textSecondary },
  previewWrap: { marginBottom: 8 },
  preview: { width: '100%', height: 220, borderRadius: 16 },
  previewActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  retakeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.brand },
  retakeText: { fontSize: 14, fontWeight: '600', color: COLORS.brand },
  galleryBtn: { width: 38, height: 38, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },

  timerSection: { alignItems: 'center' },
  ringContainer: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  leaderDot: { position: 'absolute', width: 12, height: 12, borderRadius: 6 },
  leaderDotInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.brand },
  timerCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  timeRow: { flexDirection: 'row', alignItems: 'baseline' },
  timeDigit: { fontSize: 44, fontWeight: '200', color: COLORS.text, fontVariant: ['tabular-nums'], letterSpacing: 2 },
  timeColon: { fontSize: 44, fontWeight: '200', color: COLORS.text, marginHorizontal: 2 },
  timerLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 2, marginTop: 4 },
  infoCard: { backgroundColor: COLORS.cardBg, borderRadius: 14, padding: 16, width: '100%', marginBottom: 20 },
  infoColumns: { flexDirection: 'row', alignItems: 'center' },
  infoCol: { flex: 1, alignItems: 'center', gap: 4 },
  infoDivider: { width: 1, height: 36, backgroundColor: COLORS.border },
  infoValue: { fontSize: 13, fontWeight: '700', color: COLORS.text, textAlign: 'center' },

  photoCompare: { flexDirection: 'row', gap: 10 },
  photoCompareCol: { flex: 1 },
  compareLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', marginBottom: 6 },
  compareImg: { width: '100%', height: 180, borderRadius: 12 },
  comparePlaceholder: { width: '100%', height: 180, borderRadius: 12, backgroundColor: COLORS.bg },

  resultOption: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.border, marginBottom: 10 },
  resultSuccess: { borderColor: COLORS.success, backgroundColor: '#f0faf3' },
  resultFail: { borderColor: COLORS.danger, backgroundColor: '#fff5f5' },
  resultTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  resultDesc: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },

  doneSection: { alignItems: 'center', paddingTop: 40, gap: 8 },
  doneTitle: { fontSize: 24, fontWeight: '800', color: COLORS.text, marginTop: 8 },
  doneSub: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, marginTop: 8 },
  secondaryBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },

  cameraWrap: { flex: 1, backgroundColor: '#000' },
  cameraView: { flex: 1 },
  cameraOverlay: { flex: 1, justifyContent: 'space-between' },
  cameraTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  cameraClose: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  cameraLabel: { fontSize: 15, fontWeight: '700', color: '#fff' },
  cameraGallery: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  cameraBottom: { alignItems: 'center', paddingBottom: 32 },
  shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)' },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },
  permissionContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  permTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  permText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },
  permBtn: { height: 50, borderRadius: 14, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', marginTop: 8 },
  permBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  permCancel: { padding: 12 },
  permCancelText: { fontSize: 14, color: COLORS.textSecondary },
});
