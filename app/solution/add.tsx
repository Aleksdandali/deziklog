import React, { useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Alert, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth-context';
import { COLORS, MS_PER_DAY } from '../../lib/constants';
import { RADII } from '../../lib/theme';
import { scheduleSolutionReminder } from '../../lib/notifications';

// ── Products with shelf life ──────────────────────────────

const PRODUCTS = [
  { id: 'delanol', name: 'Деланол', shelfDays: 35 },
  { id: 'bionol', name: 'Біонол форте', shelfDays: 35 },
  { id: 'instrum', name: 'DEZIK Instrum', shelfDays: 28 },
];

// ── Helpers ───────────────────────────────────────────────

const MONTH_NAMES_UK = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
];
const DAY_NAMES_UK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fromDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(dateStr: string, days: number): string {
  const d = fromDateStr(dateStr);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

function formatDateUk(dateStr: string): string {
  const d = fromDateStr(dateStr);
  return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
}

function isSameDay(a: string, b: string): boolean {
  return a === b;
}

// ── Inline Calendar Component ─────────────────────────────

function InlineCalendar({
  selected,
  onSelect,
  minDate,
  markedEnd,
}: {
  selected: string;
  onSelect: (d: string) => void;
  minDate?: string;
  markedEnd?: string;
}) {
  const selDate = fromDateStr(selected);
  const [viewYear, setViewYear] = useState(selDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(selDate.getMonth());

  const days = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    // Monday = 0 in our grid
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;

    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: (number | null)[] = [];

    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    // Pad to complete row
    while (cells.length % 7 !== 0) cells.push(null);

    return cells;
  }, [viewYear, viewMonth]);

  const todayStr = toDateStr(new Date());

  const goMonth = (delta: number) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setViewMonth(m);
    setViewYear(y);
  };

  return (
    <View style={cal.container}>
      {/* Header */}
      <View style={cal.header}>
        <TouchableOpacity onPress={() => goMonth(-1)} hitSlop={12} style={cal.arrow}>
          <Feather name="chevron-left" size={18} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={cal.monthTitle}>
          {MONTH_NAMES_UK[viewMonth]} {viewYear}
        </Text>
        <TouchableOpacity onPress={() => goMonth(1)} hitSlop={12} style={cal.arrow}>
          <Feather name="chevron-right" size={18} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      {/* Day names */}
      <View style={cal.weekRow}>
        {DAY_NAMES_UK.map((d) => (
          <Text key={d} style={cal.weekDay}>{d}</Text>
        ))}
      </View>

      {/* Day grid */}
      <View style={cal.grid}>
        {days.map((day, i) => {
          if (day === null) return <View key={`e${i}`} style={cal.cell} />;

          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isSelected = isSameDay(dateStr, selected);
          const isToday = isSameDay(dateStr, todayStr);
          const isExpiry = markedEnd ? isSameDay(dateStr, markedEnd) : false;
          const isPast = minDate ? dateStr < minDate : false;
          const isInRange = markedEnd && dateStr > selected && dateStr < markedEnd;

          return (
            <TouchableOpacity
              key={dateStr}
              style={[
                cal.cell,
                isInRange && cal.cellInRange,
                isSelected && cal.cellSelected,
                isExpiry && cal.cellExpiry,
              ]}
              onPress={() => !isPast && onSelect(dateStr)}
              disabled={isPast}
              activeOpacity={0.7}
            >
              <Text style={[
                cal.dayText,
                isToday && !isSelected && cal.dayToday,
                isSelected && cal.dayTextSelected,
                isExpiry && cal.dayTextExpiry,
                isPast && cal.dayPast,
              ]}>
                {day}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────

export default function AddSolutionScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [productId, setProductId] = useState<string | null>(null);
  const [date, setDate] = useState(toDateStr(new Date()));
  const [expiryDate, setExpiryDate] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  const selectedProduct = PRODUCTS.find((p) => p.id === productId);

  const handleSelectProduct = (id: string) => {
    setProductId(id);
    const product = PRODUCTS.find((p) => p.id === id);
    if (product) {
      setExpiryDate(addDays(date, product.shelfDays));
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSelectDate = (d: string) => {
    setDate(d);
    if (selectedProduct) {
      setExpiryDate(addDays(d, selectedProduct.shelfDays));
    }
  };

  const handlePickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleTakePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Потрібен доступ до камери');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const shelfDays = expiryDate && date
    ? Math.ceil((fromDateStr(expiryDate).getTime() - fromDateStr(date).getTime()) / MS_PER_DAY)
    : 0;

  const handleSave = async () => {
    if (!productId || !selectedProduct) {
      Alert.alert('Оберіть препарат');
      return;
    }
    if (!expiryDate) {
      Alert.alert('Оберіть дату');
      return;
    }
    if (fromDateStr(expiryDate) <= fromDateStr(date)) {
      Alert.alert('Помилка', 'Термін придатності має бути пізніше дати приготування');
      return;
    }
    if (!userId) { Alert.alert('Сесія закінчилась'); return; }

    setSaving(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const openedDate = fromDateStr(date);
      openedDate.setHours(12);
      const expiryDateObj = fromDateStr(expiryDate);
      expiryDateObj.setHours(12);

      const { data: solData, error } = await supabase.from('solutions').insert({
        user_id: userId,
        product_id: null,
        name: selectedProduct.name,
        opened_at: openedDate.toISOString(),
        expires_at: expiryDateObj.toISOString(),
        status: 'active',
      }).select('id').single();

      if (error) throw error;

      // Upload photo if provided
      if (solData?.id && photoUri) {
        try {
          const ext = photoUri.split('.').pop() || 'jpg';
          const path = `${userId}/${solData.id}/photo.${ext}`;
          const response = await fetch(photoUri);
          const blob = await response.blob();
          await supabase.storage.from('solution-photos').upload(path, blob, {
            contentType: `image/${ext === 'png' ? 'png' : 'jpeg'}`,
          });
        } catch (err) {
          console.warn('Solution photo upload failed:', err);
        }
      }

      if (solData?.id) {
        scheduleSolutionReminder(solData.id, selectedProduct.name, expiryDateObj.toISOString());
      }
      router.back();
    } catch (err: any) {
      Alert.alert('Помилка', err.message || 'Не вдалось зберегти');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={st.container}>
      <View style={st.header}>
        <Text style={st.headerTitle}>Новий розчин</Text>
        <TouchableOpacity style={st.closeBtn} onPress={() => router.back()}>
          <Feather name="x" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={st.body}
        keyboardShouldPersistTaps="handled"
      >
        {/* Product */}
        <Text style={st.label}>Препарат</Text>
        <View style={st.chips}>
          {PRODUCTS.map((p) => {
            const active = productId === p.id;
            return (
              <TouchableOpacity
                key={p.id}
                style={[st.chip, active && st.chipActive]}
                onPress={() => handleSelectProduct(p.id)}
                activeOpacity={0.8}
              >
                <Text style={[st.chipText, active && st.chipTextActive]}>{p.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Date */}
        <Text style={st.label}>Дата приготування</Text>
        <TouchableOpacity
          style={st.dateBtn}
          onPress={() => setShowCalendar(!showCalendar)}
          activeOpacity={0.7}
        >
          <Feather name="calendar" size={16} color={COLORS.brand} />
          <Text style={st.dateBtnText}>{formatDateUk(date)}</Text>
          <Feather name={showCalendar ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.textSecondary} />
        </TouchableOpacity>

        {showCalendar && (
          <InlineCalendar
            selected={date}
            onSelect={(d) => { handleSelectDate(d); setShowCalendar(false); }}
            markedEnd={expiryDate || undefined}
          />
        )}

        {/* Shelf life info */}
        {selectedProduct && expiryDate && (
          <View style={st.shelfCard}>
            <View style={st.shelfRow}>
              <View style={st.shelfItem}>
                <Text style={st.shelfItemLabel}>Термін придатності</Text>
                <Text style={st.shelfItemValue}>{shelfDays} днів</Text>
              </View>
              <View style={st.shelfDivider} />
              <View style={st.shelfItem}>
                <Text style={st.shelfItemLabel}>Дійсний до</Text>
                <Text style={st.shelfItemValue}>{formatDateUk(expiryDate)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Photo (optional) */}
        <Text style={st.label}>Фото розчину (необов'язково)</Text>
        {photoUri ? (
          <View style={st.photoPreview}>
            <Image source={{ uri: photoUri }} style={st.photoImage} />
            <TouchableOpacity
              style={st.photoRemove}
              onPress={() => setPhotoUri(null)}
              hitSlop={12}
            >
              <Feather name="x" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={st.photoActions}>
            <TouchableOpacity style={st.photoBtn} onPress={handleTakePhoto} activeOpacity={0.7}>
              <Feather name="camera" size={18} color={COLORS.brand} />
              <Text style={st.photoBtnText}>Камера</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.photoBtn} onPress={handlePickPhoto} activeOpacity={0.7}>
              <Feather name="image" size={18} color={COLORS.brand} />
              <Text style={st.photoBtnText}>Галерея</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Save */}
        <TouchableOpacity
          style={[st.saveBtn, (!productId || saving) && { opacity: 0.5 }]}
          onPress={handleSave}
          disabled={!productId || saving}
          activeOpacity={0.85}
        >
          <Feather name="check" size={18} color="#fff" />
          <Text style={st.saveBtnText}>
            {saving ? 'Збереження...' : 'Відкрити розчин'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Calendar styles ───────────────────────────────────────

const cal = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  arrow: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: COLORS.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  monthTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  weekRow: { flexDirection: 'row', marginBottom: 6 },
  weekDay: {
    flex: 1, textAlign: 'center',
    fontSize: 11, fontWeight: '600', color: COLORS.textTertiary,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellSelected: {
    backgroundColor: COLORS.brand,
    borderRadius: 20,
  },
  cellExpiry: {
    backgroundColor: COLORS.warning + '20',
    borderRadius: 20,
  },
  cellInRange: {
    backgroundColor: COLORS.brandLight,
  },
  dayText: { fontSize: 14, fontWeight: '500', color: COLORS.text },
  dayToday: { fontWeight: '800', color: COLORS.brand },
  dayTextSelected: { color: '#fff', fontWeight: '700' },
  dayTextExpiry: { color: COLORS.warning, fontWeight: '700' },
  dayPast: { color: COLORS.textTertiary, opacity: 0.4 },
});

// ── Main styles ───────────────────────────────────────────

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center',
  },
  body: { padding: 20, paddingBottom: 40 },
  label: {
    fontSize: 12, fontWeight: '700', color: COLORS.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: 20, marginBottom: 10,
  },

  // Chips
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 40, borderWidth: 1.5, borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  chipActive: { borderColor: COLORS.brand, backgroundColor: COLORS.brand },
  chipText: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  chipTextActive: { color: '#fff' },

  // Date button
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    height: 48, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, backgroundColor: COLORS.bg,
  },
  dateBtnText: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.text },

  // Shelf info card
  shelfCard: {
    backgroundColor: COLORS.bg, borderRadius: RADII.md,
    padding: 14, marginTop: 14,
  },
  shelfRow: { flexDirection: 'row', alignItems: 'center' },
  shelfItem: { flex: 1, alignItems: 'center' },
  shelfItemLabel: { fontSize: 11, fontWeight: '500', color: COLORS.textSecondary },
  shelfItemValue: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginTop: 4 },
  shelfDivider: { width: 1, height: 32, backgroundColor: COLORS.border },

  // Photo
  photoActions: { flexDirection: 'row', gap: 12 },
  photoBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 48, borderRadius: 12,
    borderWidth: 1.5, borderColor: COLORS.brand, borderStyle: 'dashed',
    backgroundColor: COLORS.brandLight,
  },
  photoBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.brand },
  photoPreview: {
    width: 100, height: 100, borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.border,
  },
  photoImage: { width: '100%', height: '100%' },
  photoRemove: {
    position: 'absolute', top: 4, right: 4,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Save
  saveBtn: {
    flexDirection: 'row', height: 56, borderRadius: 14,
    backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 28,
    shadowColor: COLORS.brand, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
