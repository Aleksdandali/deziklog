import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView,
  TextInput, Alert, Image, Animated, Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { X, ChevronRight, Camera, CheckCircle, Home as HomeIcon } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';

const BRAND = '#4b569e';
const COLORS = {
  bg: '#f5f6fa', white: '#FFFFFF', text: '#1B1B1B', textSecondary: '#6B7280',
  success: '#43A047', border: '#e2e4ed', cardBg: '#eceef5', brand: BRAND,
};

type PackType = 'Крафт' | 'Прозорий' | 'Білий';

interface InstrumentRow { id: string; name: string; }
interface SterilizerRow { id: string; name: string; type: string | null; }

export default function CycleScreen() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  // wizard local state
  const [selectedInstruments, setSelectedInstruments] = useState<string[]>([]);
  const [packType, setPackType] = useState<PackType | null>(null);
  const [sterilizerName, setSterilizerName] = useState('');
  const [photoBefore, setPhotoBefore] = useState<string | null>(null);
  const [photoAfter, setPhotoAfter] = useState<string | null>(null);
  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedDuration, setSavedDuration] = useState(0);

  // data from Supabase
  const [instruments, setInstruments] = useState<InstrumentRow[]>([]);
  const [sterilizers, setSterilizers] = useState<SterilizerRow[]>([]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulse1 = useRef(new Animated.Value(0.6)).current;
  const pulse2 = useRef(new Animated.Value(0.6)).current;
  const pulse3 = useRef(new Animated.Value(0.6)).current;
  const digitScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;
      const [instrRes, sterRes] = await Promise.all([
        supabase.from('instruments').select('*').eq('user_id', uid),
        supabase.from('sterilizers').select('*').eq('user_id', uid),
      ]);
      setInstruments(instrRes.data ?? []);
      setSterilizers(sterRes.data ?? []);
    })();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Timer animation
  useEffect(() => {
    if (step === 3 && timerStartedAt) {
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - timerStartedAt) / 1000));
      }, 1000);

      const createPulse = (anim: Animated.Value, delay: number) =>
        Animated.loop(Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 1500, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.6, duration: 1500, easing: Easing.in(Easing.ease), useNativeDriver: true }),
        ]));
      createPulse(pulse1, 0).start();
      createPulse(pulse2, 500).start();
      createPulse(pulse3, 1000).start();
      Animated.loop(Animated.sequence([
        Animated.timing(digitScale, { toValue: 1.02, duration: 1000, useNativeDriver: true }),
        Animated.timing(digitScale, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])).start();

      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
  }, [step, timerStartedAt]);

  const toggleInstrument = (name: string) => {
    setSelectedInstruments((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
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

  const handlePhoto = (setter: (uri: string) => void) => {
    Alert.alert('Фото індикатора', 'Оберіть джерело', [
      { text: 'Камера', onPress: async () => {
        const res = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
        if (!res.canceled) setter(res.assets[0].uri);
      }},
      { text: 'Галерея', onPress: async () => {
        const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
        if (!res.canceled) setter(res.assets[0].uri);
      }},
      { text: 'Скасувати', style: 'cancel' },
    ]);
  };

  const uploadPhoto = async (cycleId: string, type: 'before' | 'after', uri: string, userId: string) => {
    const ext = uri.split('.').pop() || 'jpg';
    const fileName = `${userId}/${cycleId}/${type}_${Date.now()}.${ext}`;
    const response = await fetch(uri);
    const blob = await response.blob();
    const arrayBuffer = await new Response(blob).arrayBuffer();

    await supabase.storage
      .from('cycle-photos')
      .upload(fileName, arrayBuffer, { contentType: `image/${ext === 'png' ? 'png' : 'jpeg'}`, upsert: true });

    await supabase
      .from('cycle_photos')
      .insert({ cycle_id: cycleId, type, storage_path: fileName });
  };

  const finishCycle = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Не авторизовано');
      const uid = session.user.id;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const durationMinutes = Math.ceil((savedDuration || elapsed) / 60);

      const { data: cycle, error } = await supabase
        .from('sterilization_cycles')
        .insert({
          user_id: uid,
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

      if (photoBefore) {
        try { await uploadPhoto(cycle.id, 'before', photoBefore, uid); } catch {}
      }
      if (photoAfter) {
        try { await uploadPhoto(cycle.id, 'after', photoAfter, uid); } catch {}
      }

      setStep(5);
    } catch (err: any) {
      Alert.alert('Помилка', err.message || 'Не вдалось зберегти');
    } finally {
      setSaving(false);
    }
  };

  const formatTimer = (s: number): string => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const instrNames = instruments.length > 0
    ? instruments.map((i) => i.name)
    : ['Кусачки', 'Пушер', 'Фрези', 'Ножиці', 'Пінцет'];
  const sterNames = sterilizers.map((s) => s.name);
  const canGoStep2 = selectedInstruments.length > 0 && packType !== null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Новий цикл</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <X size={20} color={COLORS.textSecondary} strokeWidth={2} />
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
        {/* Step 1: Instruments + Pack + Sterilizer */}
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
              <ChevronRight size={18} color={COLORS.white} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        )}

        {/* Step 2: Photo BEFORE */}
        {step === 2 && (
          <View>
            <Text style={styles.stepTitle}>Фото ДО</Text>
            <Text style={styles.stepSubtitle}>Сфотографуйте індикатор на пакеті</Text>

            <View style={styles.packInfo}>
              <Text style={styles.packInfoText}>Пакет: <Text style={{ fontWeight: '700' }}>{packType}</Text></Text>
              <View style={styles.indicatorRow}>
                <View style={[styles.indicatorDot, { backgroundColor: COLORS.textSecondary }]} />
                <Text style={styles.indicatorText}>Індикатор не змінений</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.photoBtn} onPress={() => handlePhoto(setPhotoBefore)} activeOpacity={0.8}>
              {photoBefore ? (
                <Image source={{ uri: photoBefore }} style={styles.photoPreview} />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Camera size={32} color={COLORS.brand} strokeWidth={1.5} />
                  <Text style={styles.photoPlaceholderText}>Натисніть для фото</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.startBtn} onPress={startTimer} activeOpacity={0.85}>
              <Text style={styles.startBtnText}>▶ Старт стерилізації</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step 3: Timer */}
        {step === 3 && (
          <View style={styles.timerContainer}>
            <Text style={styles.stepTitle}>Стерилізація</Text>

            <View style={styles.timerRings}>
              <Animated.View style={[styles.ring, styles.ring3, { opacity: pulse3, transform: [{ scale: pulse3.interpolate({ inputRange: [0.6, 1], outputRange: [0.9, 1.15] }) }] }]} />
              <Animated.View style={[styles.ring, styles.ring2, { opacity: pulse2, transform: [{ scale: pulse2.interpolate({ inputRange: [0.6, 1], outputRange: [0.92, 1.1] }) }] }]} />
              <Animated.View style={[styles.ring, styles.ring1, { opacity: pulse1, transform: [{ scale: pulse1.interpolate({ inputRange: [0.6, 1], outputRange: [0.95, 1.05] }) }] }]} />
              <View style={styles.timerCenter}>
                <View style={styles.liveDot} />
                <Animated.Text style={[styles.timerDigits, { transform: [{ scale: digitScale }] }]}>
                  {formatTimer(elapsed)}
                </Animated.Text>
                <Text style={styles.timerLabel}>стерилізація</Text>
              </View>
            </View>

            <View style={styles.tempBadge}>
              <Text style={styles.tempText}>180°C · сухожар</Text>
            </View>

            <View style={styles.instrTags}>
              {selectedInstruments.map((name) => (
                <View key={name} style={styles.instrTag}>
                  <Text style={styles.instrTagText}>{name}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity style={styles.photoAfterBtn} onPress={() => { stopTimer(); setStep(4); }} activeOpacity={0.85}>
              <Camera size={18} color={COLORS.white} strokeWidth={2} />
              <Text style={styles.photoAfterBtnText}>Зупинити і зробити фото ПІСЛЯ</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step 4: Photo AFTER */}
        {step === 4 && (
          <View>
            <Text style={styles.stepTitle}>Фото ПІСЛЯ</Text>
            <Text style={styles.stepSubtitle}>Сфотографуйте зміну кольору індикатора</Text>

            <View style={styles.packInfo}>
              <Text style={styles.packInfoText}>Пакет: <Text style={{ fontWeight: '700' }}>{packType}</Text></Text>
              <View style={styles.indicatorRow}>
                <View style={[styles.indicatorDot, { backgroundColor: COLORS.success }]} />
                <Text style={styles.indicatorText}>Індикатор має змінитись</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.photoBtn} onPress={() => handlePhoto(setPhotoAfter)} activeOpacity={0.8}>
              {photoAfter ? (
                <Image source={{ uri: photoAfter }} style={styles.photoPreview} />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Camera size={32} color={COLORS.brand} strokeWidth={1.5} />
                  <Text style={styles.photoPlaceholderText}>Натисніть для фото</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={[styles.finishBtn, saving && { opacity: 0.6 }]} onPress={finishCycle} disabled={saving} activeOpacity={0.85}>
              <CheckCircle size={20} color={COLORS.white} strokeWidth={2} />
              <Text style={styles.finishBtnText}>{saving ? 'Збереження...' : 'Завершити цикл'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step 5: Result (read-only) */}
        {step === 5 && (
          <View style={styles.resultContainer}>
            <View style={styles.resultCheck}>
              <CheckCircle size={56} color={COLORS.success} strokeWidth={1.5} />
            </View>
            <Text style={styles.resultTitle}>Цикл завершено!</Text>
            <Text style={styles.resultSubtitle}>Запис додано до журналу</Text>

            <View style={styles.resultCard}>
              <ResultRow label="Час стерилізації" value={formatTimer(savedDuration || elapsed)} mono />
              <ResultRow label="Інструменти" value={selectedInstruments.join(', ')} />
              <ResultRow label="Пакет" value={packType || ''} />
              <ResultRow label="Стерилізатор" value={sterilizerName || ''} />
              <ResultRow label="Індикатор" value="✓ Пройшов" color={COLORS.success} />
            </View>

            <TouchableOpacity style={styles.homeBtn} onPress={() => router.replace('/')} activeOpacity={0.85}>
              <HomeIcon size={18} color={COLORS.white} strokeWidth={2} />
              <Text style={styles.homeBtnText}>На головну</Text>
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
  photoPreview: { width: '100%', height: 200, borderRadius: 16 },
  photoPlaceholder: { height: 180, borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: COLORS.border, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', gap: 8 },
  photoPlaceholderText: { fontSize: 14, color: COLORS.textSecondary },
  startBtn: { height: 56, borderRadius: 14, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center', shadowColor: BRAND, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  startBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.white },
  timerContainer: { alignItems: 'center' },
  timerRings: { width: 240, height: 240, alignItems: 'center', justifyContent: 'center', marginTop: 20, marginBottom: 24 },
  ring: { position: 'absolute', borderRadius: 999, borderWidth: 2, borderColor: COLORS.brand },
  ring1: { width: 180, height: 180 },
  ring2: { width: 210, height: 210 },
  ring3: { width: 240, height: 240 },
  timerCenter: { alignItems: 'center', gap: 4 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success, marginBottom: 6 },
  timerDigits: { fontSize: 48, fontWeight: '700', color: COLORS.text, fontVariant: ['tabular-nums'], letterSpacing: 2 },
  timerLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  tempBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 40, marginBottom: 16 },
  tempText: { fontSize: 13, fontWeight: '600', color: '#92400E' },
  instrTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: 28 },
  instrTag: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 40, backgroundColor: COLORS.cardBg },
  instrTagText: { fontSize: 12, fontWeight: '500', color: COLORS.textSecondary },
  photoAfterBtn: { flexDirection: 'row', height: 56, borderRadius: 14, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'stretch', shadowColor: BRAND, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  photoAfterBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.white },
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
  homeBtn: { flexDirection: 'row', height: 56, borderRadius: 14, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'stretch', width: '100%', shadowColor: BRAND, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  homeBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.white },
});
