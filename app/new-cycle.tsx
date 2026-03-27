import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView,
  TextInput, Alert, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { createSession, updateSession, uploadSessionPhoto } from '../lib/api';
import { useAuth, useSessionGuard } from '../lib/auth-context';
import { COLORS } from '../lib/constants';
import { RADII } from '../lib/theme';
import { getDefaultPreset, type SteriType } from '../lib/steri-config';
import CameraCapture from '../components/CameraCapture';

interface SterilizerRow { id: string; name: string; type: string | null; }
interface EmployeeRow { id: string; name: string; }

const ACTIVE_TIMER_KEY = 'active_timer';

const PACK_OPTIONS = [
  { value: 'kraft', label: 'Крафт' },
  { value: 'transparent', label: 'Прозорий' },
  { value: 'none', label: 'Без пакета' },
];

export default function NewCycleScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const getUid = useSessionGuard();
  const userId = session?.user?.id;

  const [showCamera, setShowCamera] = useState(false);
  const [photoBefore, setPhotoBefore] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Sterilizer
  const [sterilizers, setSterilizers] = useState<SterilizerRow[]>([]);
  const [sterilizerId, setSterilizerId] = useState<string | null>(null);
  const [sterilizerName, setSterilizerName] = useState('');
  const [sterilizerType, setSterilizerType] = useState<SteriType | null>(null);

  // Instruments
  const [selectedInstruments, setSelectedInstruments] = useState<Record<string, number>>({});
  const [customInstrument, setCustomInstrument] = useState('');

  const INSTRUMENT_PRESETS = [
    'Кусачки для кутикули',
    'Ножиці для кутикули',
    'Пушер',
    'Пінцет',
    'Кусачки для нігтів',
    'Ножиці для нігтів',
    'Фреза',
    'Шабер',
  ];

  const toggleInstrument = (name: string) => {
    setSelectedInstruments((prev) => {
      const next = { ...prev };
      if (next[name]) {
        delete next[name];
      } else {
        next[name] = 1;
      }
      return next;
    });
  };

  const updateQty = (name: string, delta: number) => {
    setSelectedInstruments((prev) => {
      const next = { ...prev };
      const val = (next[name] ?? 1) + delta;
      if (val <= 0) {
        delete next[name];
      } else {
        next[name] = Math.min(val, 99);
      }
      return next;
    });
  };

  const addCustomInstrument = () => {
    const name = customInstrument.trim();
    if (!name) return;
    setSelectedInstruments((prev) => ({ ...prev, [name]: prev[name] ?? 1 }));
    setCustomInstrument('');
  };

  // Build text for API from selected instruments
  const instrumentsText = Object.entries(selectedInstruments)
    .map(([name, qty]) => qty > 1 ? `${name} ×${qty}` : name)
    .join(', ');

  // Package
  const [packType, setPackType] = useState('kraft');

  // Mode
  const [temperature, setTemperature] = useState('180');
  const [durationInput, setDurationInput] = useState('60');

  // Employee
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [employeeName, setEmployeeName] = useState('');

  // Solution (optional)
  const [solutionNote, setSolutionNote] = useState('');

  // ── Load sterilizers ──────────────────────────────────

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await supabase.from('sterilizers').select('*').eq('user_id', userId);
      const list = data ?? [];
      setSterilizers(list);
      if (list.length >= 1) {
        const s = list[0];
        setSterilizerName(s.name);
        setSterilizerId(s.id);
        const type = (s.type as SteriType) ?? null;
        setSterilizerType(type);
        const preset = getDefaultPreset(type);
        if (preset) {
          setTemperature(String(preset.temperature));
          setDurationInput(String(preset.duration));
        }
      }

      const { data: empData } = await supabase.from('employees').select('id, name').eq('user_id', userId).order('created_at');
      const empList = empData ?? [];
      setEmployees(empList);
      if (empList.length >= 1) {
        setEmployeeId(empList[0].id);
        setEmployeeName(empList[0].name);
      }
    })();
  }, [userId]);

  // ── Select sterilizer ─────────────────────────────────

  const handleSelectSterilizer = (s: SterilizerRow) => {
    setSterilizerName(s.name);
    setSterilizerId(s.id);
    const type = (s.type as SteriType) ?? null;
    setSterilizerType(type);
    const preset = getDefaultPreset(type);
    if (preset) {
      setTemperature(String(preset.temperature));
      setDurationInput(String(preset.duration));
    }
  };

  // ── Validate & start ──────────────────────────────────

  const handlePhotoAndStart = () => {
    if (Object.keys(selectedInstruments).length === 0) { Alert.alert('Вкажіть інструменти'); return; }
    if (!sterilizerName.trim()) { Alert.alert('Вкажіть стерилізатор'); return; }
    const temp = parseInt(temperature, 10);
    const dur = parseInt(durationInput, 10);
    if (!temp || temp < 100 || temp > 300) { Alert.alert('Температура: 100–300 °C'); return; }
    if (!dur || dur < 1 || dur > 480) { Alert.alert('Час: від 1 до 480 хвилин'); return; }
    setShowCamera(true);
  };

  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const handlePhotoCaptured = (uri: string) => {
    setPhotoPreview(uri);
    setShowCamera(false);
  };

  const handleConfirmPhoto = async () => {
    if (!photoPreview) return;
    setPhotoBefore(photoPreview);
    await startCycle(photoPreview);
  };

  const handleRetakePhoto = () => {
    setPhotoPreview(null);
    setShowCamera(true);
  };

  const startCycle = async (photoUri: string) => {
    setSaving(true);
    try {
      const uid = await getUid();
      if (!uid) { Alert.alert('Сесія закінчилась'); setSaving(false); return; }

      const temp = parseInt(temperature, 10);
      const dur = parseInt(durationInput, 10);
      const profile = await supabase.from('profiles').select('salon_name').eq('id', uid).maybeSingle();

      const sess = await createSession(uid, {
        salon_name: profile.data?.salon_name ?? undefined,
        sterilizer_id: sterilizerId ?? undefined,
        sterilizer_name: sterilizerName.trim(),
        instrument_names: instrumentsText.trim(),
        packet_type: packType,
        pouch_size: packType === 'none' ? 'none' : undefined,
        temperature: temp,
        duration_minutes: dur,
        employee_id: employeeId ?? undefined,
        employee_name: employeeName.trim() || undefined,
      });

      const path = await uploadSessionPhoto(uid, sess.id, 'before', photoUri);
      const now = new Date().toISOString();
      await updateSession(sess.id, uid, { photo_before_path: path, status: 'in_progress', started_at: now });

      await AsyncStorage.setItem(ACTIVE_TIMER_KEY, JSON.stringify({
        sessionId: sess.id,
        duration: dur,
        startedAt: Date.now(),
        sterilizerName: sterilizerName.trim(),
        temperature: temp,
        instruments: instrumentsText.trim(),
        photoBeforeUri: photoUri,
      }));

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      router.replace(`/timer?sessionId=${sess.id}&duration=${dur}`);
    } catch (err: any) {
      Alert.alert('Помилка', err.message || 'Не вдалось створити сесію');
    } finally {
      setSaving(false);
    }
  };

  // ── Camera ────────────────────────────────────────────

  if (showCamera) {
    return (
      <CameraCapture
        label="Фото індикатора ДО"
        onCapture={handlePhotoCaptured}
        onClose={() => setShowCamera(false)}
      />
    );
  }

  // ── Photo preview ──────────────────────────────────────

  if (photoPreview) {
    return (
      <View style={st.previewContainer}>
        <Image source={{ uri: photoPreview }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={st.previewOverlay} />

        {/* Top bar */}
        <SafeAreaView style={st.previewTopBar}>
          <View style={st.previewHeader}>
            <TouchableOpacity style={st.previewCloseBtn} onPress={() => { setPhotoPreview(null); }}>
              <Feather name="x" size={20} color="#fff" />
            </TouchableOpacity>
            <Text style={st.previewTitle}>Фото індикатора</Text>
            <View style={{ width: 40 }} />
          </View>
        </SafeAreaView>

        {/* Bottom actions */}
        <SafeAreaView style={st.previewBottom}>
          <Text style={st.previewHint}>Переконайтеся, що індикатор чітко видно</Text>
          <View style={st.previewActions}>
            <TouchableOpacity style={st.retakeBtn} onPress={handleRetakePhoto} activeOpacity={0.85}>
              <Feather name="camera" size={18} color="#fff" />
              <Text style={st.retakeBtnText}>Перезняти</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[st.confirmBtn, saving && { opacity: 0.5 }]}
              disabled={saving}
              onPress={handleConfirmPhoto}
              activeOpacity={0.85}
            >
              <LinearGradient colors={[COLORS.brand, COLORS.brandDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.confirmBtnInner}>
                <Text style={st.confirmBtnText}>{saving ? 'Зачекайте...' : 'Почати цикл'}</Text>
                <Feather name="arrow-right" size={18} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────

  return (
    <SafeAreaView style={st.container}>
      <View style={st.header}>
        <Text style={st.headerTitle}>Новий цикл</Text>
        <TouchableOpacity style={st.closeBtn} onPress={() => router.back()}>
          <Feather name="x" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.body} keyboardShouldPersistTaps="handled">

        {/* Sterilizer */}
        <Text style={st.label}>Стерилізатор</Text>
        {sterilizers.length > 1 ? (
          <View style={st.chips}>
            {sterilizers.map((s) => {
              const active = sterilizerName === s.name;
              return (
                <TouchableOpacity key={s.id} style={[st.chip, active && st.chipActive]} onPress={() => handleSelectSterilizer(s)} activeOpacity={0.8}>
                  <Text style={[st.chipText, active && st.chipTextActive]}>{s.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : sterilizers.length === 1 ? (
          <View style={st.readonlyField}>
            <MaterialCommunityIcons name="radiator" size={16} color={COLORS.brand} />
            <Text style={st.readonlyText}>{sterilizerName}</Text>
          </View>
        ) : (
          <TextInput style={st.input} placeholder="Назва стерилізатора" placeholderTextColor={COLORS.textTertiary} value={sterilizerName} onChangeText={setSterilizerName} maxLength={100} />
        )}

        {/* Employee */}
        {employees.length > 0 && (
          <>
            <Text style={st.label}>Хто стерилізує</Text>
            <View style={st.chips}>
              {employees.map((e) => {
                const active = employeeId === e.id;
                return (
                  <TouchableOpacity key={e.id} style={[st.chip, active && st.chipActive]} onPress={() => { setEmployeeId(e.id); setEmployeeName(e.name); }} activeOpacity={0.8}>
                    <Text style={[st.chipText, active && st.chipTextActive]}>{e.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* Instruments — quick select + custom */}
        <Text style={st.label}>Інструменти</Text>
        <View style={st.instrumentChips}>
          {INSTRUMENT_PRESETS.map((name) => {
            const active = !!selectedInstruments[name];
            return (
              <TouchableOpacity key={name} style={[st.chip, active && st.chipActive]} onPress={() => toggleInstrument(name)} activeOpacity={0.8}>
                <Text style={[st.chipText, active && st.chipTextActive]}>{name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Selected instruments with quantity */}
        {Object.keys(selectedInstruments).length > 0 && (
          <View style={st.selectedList}>
            {Object.entries(selectedInstruments).map(([name, qty]) => (
              <View key={name} style={st.selectedRow}>
                <Text style={st.selectedName} numberOfLines={1}>{name}</Text>
                <View style={st.qtyControls}>
                  <TouchableOpacity style={st.qtyBtn} onPress={() => updateQty(name, -1)} activeOpacity={0.7}>
                    <Feather name="minus" size={14} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                  <Text style={st.qtyText}>{qty}</Text>
                  <TouchableOpacity style={st.qtyBtn} onPress={() => updateQty(name, 1)} activeOpacity={0.7}>
                    <Feather name="plus" size={14} color={COLORS.brand} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => updateQty(name, -qty)} hitSlop={8} style={{ marginLeft: 4 }}>
                    <Feather name="x" size={14} color={COLORS.textTertiary} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Custom instrument input */}
        <View style={st.customRow}>
          <TextInput
            style={[st.input, { flex: 1 }]}
            placeholder="Додати свій інструмент..."
            placeholderTextColor={COLORS.textTertiary}
            value={customInstrument}
            onChangeText={setCustomInstrument}
            onSubmitEditing={addCustomInstrument}
            returnKeyType="done"
            maxLength={100}
          />
          {customInstrument.trim() ? (
            <TouchableOpacity style={st.addCustomBtn} onPress={addCustomInstrument} activeOpacity={0.7}>
              <Feather name="plus" size={18} color="#fff" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Package type */}
        <Text style={st.label}>Пакет</Text>
        <View style={st.chips}>
          {PACK_OPTIONS.map((p) => {
            const active = packType === p.value;
            return (
              <TouchableOpacity key={p.value} style={[st.chip, active && st.chipActive]} onPress={() => setPackType(p.value)} activeOpacity={0.8}>
                <Text style={[st.chipText, active && st.chipTextActive]}>{p.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Mode: temp + time in one row */}
        <Text style={st.label}>Режим</Text>
        <View style={st.modeRow}>
          <View style={st.modeField}>
            <Text style={st.modeFieldLabel}>°C</Text>
            <TextInput style={st.modeInput} keyboardType="number-pad" value={temperature} onChangeText={setTemperature} />
          </View>
          <View style={st.modeField}>
            <Text style={st.modeFieldLabel}>хв</Text>
            <TextInput style={st.modeInput} keyboardType="number-pad" value={durationInput} onChangeText={setDurationInput} />
          </View>
        </View>

        {/* Solution note (optional) */}
        <Text style={st.label}>Розчин / концентрація <Text style={st.optional}>(необов'язково)</Text></Text>
        <TextInput
          style={st.input}
          placeholder="Деланол 15%, 15 хв"
          placeholderTextColor={COLORS.textTertiary}
          value={solutionNote}
          onChangeText={setSolutionNote}
          maxLength={200}
        />

        {/* Photo preview if retaking */}
        {photoBefore && (
          <View style={st.previewWrap}>
            <Image source={{ uri: photoBefore }} style={st.preview} />
          </View>
        )}

        {/* Start button */}
        <TouchableOpacity
          style={[st.startBtn, saving && { opacity: 0.5 }]}
          disabled={saving}
          onPress={handlePhotoAndStart}
          activeOpacity={0.85}
        >
          <LinearGradient colors={[COLORS.brandDark, COLORS.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.startBtnInner}>
            <Feather name="camera" size={20} color="#fff" />
            <Text style={st.startBtnText}>{saving ? 'Зачекайте...' : 'Фото індикатора → Старт'}</Text>
          </LinearGradient>
        </TouchableOpacity>

        <Text style={st.hint}>Після фото ви зможете перевірити знімок перед стартом</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 20, paddingBottom: 40 },

  label: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 6 },
  optional: { fontSize: 11, fontWeight: '400', textTransform: 'none', letterSpacing: 0 },

  input: { height: 48, borderRadius: RADII.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, fontSize: 15, color: COLORS.text, backgroundColor: COLORS.bg },
  inputMultiline: { height: 72, paddingTop: 12, paddingBottom: 12 },

  readonlyField: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 48, borderRadius: RADII.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, backgroundColor: COLORS.bg },
  readonlyText: { fontSize: 15, fontWeight: '600', color: COLORS.text },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: RADII.pill, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.white },
  chipActive: { borderColor: COLORS.brand, backgroundColor: COLORS.brand },
  chipText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  chipTextActive: { color: '#fff' },

  modeRow: { flexDirection: 'row', gap: 12 },
  modeField: { flex: 1 },
  modeFieldLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 4 },
  modeInput: { height: 48, borderRadius: RADII.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, fontSize: 18, fontWeight: '700', color: COLORS.text, backgroundColor: COLORS.bg, textAlign: 'center' },

  previewWrap: { marginTop: 16 },
  preview: { width: '100%', height: 160, borderRadius: RADII.lg },

  startBtn: { marginTop: 24 },
  startBtnInner: { flexDirection: 'row', height: 56, borderRadius: RADII.lg, alignItems: 'center', justifyContent: 'center', gap: 10 },
  startBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  instrumentChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  selectedList: { marginTop: 12, gap: 8 },
  selectedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.bg, borderRadius: RADII.md, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: COLORS.border },
  selectedName: { flex: 1, fontSize: 14, fontWeight: '500', color: COLORS.text, marginRight: 8 },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  qtyText: { fontSize: 16, fontWeight: '700', color: COLORS.text, minWidth: 20, textAlign: 'center' },

  customRow: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' },
  addCustomBtn: { width: 48, height: 48, borderRadius: RADII.md, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center' },

  hint: { fontSize: 12, color: COLORS.textSecondary, textAlign: 'center', marginTop: 10 },

  // Photo preview screen — fullscreen with overlay
  previewContainer: { flex: 1, backgroundColor: '#000' },
  previewOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.15)' },
  previewTopBar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  previewCloseBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  previewTitle: { fontSize: 16, fontWeight: '600', color: '#fff' },
  previewBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: 12, zIndex: 10 },
  previewHint: { fontSize: 13, color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginBottom: 14 },
  previewActions: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  retakeBtn: { flex: 1, flexDirection: 'row', height: 54, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', gap: 8 },
  retakeBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  confirmBtn: { flex: 2 },
  confirmBtnInner: { flexDirection: 'row', height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 8 },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
