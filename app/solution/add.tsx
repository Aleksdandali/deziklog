import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth-context';
import { COLORS, MS_PER_DAY } from '../../lib/constants';
import { scheduleSolutionReminder } from '../../lib/notifications';

const PREP_NAMES = ['Деланол', 'Bionol', 'Instrum', 'Septonal'];

const SHELF_DAYS: Record<string, number> = {
  'Деланол': 14,
  'Bionol': 14,
  'Instrum': 28,
  'Septonal': 14,
};

function addDays(dateStr: string, days: number): string {
  // Parse as local date (noon) to avoid timezone boundary issues
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export default function AddSolutionScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [selectedPrep, setSelectedPrep] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [expiryDate, setExpiryDate] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSelectPrep = (name: string) => {
    setSelectedPrep(name);
    const days = SHELF_DAYS[name] || 14;
    setExpiryDate(addDays(date, days));
  };

  const handleSave = async () => {
    if (!selectedPrep) {
      Alert.alert('Оберіть препарат');
      return;
    }
    if (!expiryDate) {
      Alert.alert('Введіть термін придатності');
      return;
    }
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date) || !dateRegex.test(expiryDate)) {
      Alert.alert('Помилка', 'Дата має бути у форматі РРРР-ММ-ДД');
      return;
    }
    if (new Date(expiryDate) <= new Date(date)) {
      Alert.alert('Помилка', 'Термін придатності має бути пізніше дати приготування');
      return;
    }

    if (!userId) { Alert.alert('Сесія закінчилась', 'Потрібно увійти знову.'); return; }
    setSaving(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Build dates at local noon to prevent off-by-one from timezone parsing
      const openedParts = date.split('-').map(Number);
      const expiryParts = expiryDate.split('-').map(Number);
      const openedDate = new Date(openedParts[0], openedParts[1] - 1, openedParts[2], 12);
      const expiryDateObj = new Date(expiryParts[0], expiryParts[1] - 1, expiryParts[2], 12);

      const { data: solData, error } = await supabase.from('solutions').insert({
        user_id: userId,
        product_id: null,
        name: selectedPrep,
        opened_at: openedDate.toISOString(),
        expires_at: expiryDateObj.toISOString(),
        status: 'active',
      }).select('id').single();

      if (error) throw error;
      if (solData?.id) {
        scheduleSolutionReminder(solData.id, selectedPrep, expiryDateObj.toISOString());
      }
      router.back();
    } catch (err: any) {
      Alert.alert('Помилка', err.message || 'Не вдалось зберегти');
    } finally {
      setSaving(false);
    }
  };

  const shelfDays = expiryDate && date
    ? Math.ceil((new Date(expiryDate).getTime() - new Date(date).getTime()) / MS_PER_DAY)
    : 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Новий розчин</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Feather name="x" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Препарат</Text>
        <View style={styles.chips}>
          {PREP_NAMES.map((name) => {
            const active = selectedPrep === name;
            return (
              <TouchableOpacity
                key={name}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => handleSelectPrep(name)}
                activeOpacity={0.8}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>Дата приготування (РРРР-ММ-ДД)</Text>
        <TextInput
          style={styles.input}
          value={date}
          onChangeText={setDate}
          placeholder="РРРР-ММ-ДД"
          placeholderTextColor={COLORS.textSecondary}
        />

        <Text style={styles.label}>Термін придатності (РРРР-ММ-ДД)</Text>
        <TextInput
          style={styles.input}
          value={expiryDate}
          onChangeText={setExpiryDate}
          placeholder="РРРР-ММ-ДД"
          placeholderTextColor={COLORS.textSecondary}
        />

        {shelfDays > 0 && (
          <Text style={styles.shelfHint}>
            {shelfDays} днів терміну придатності
          </Text>
        )}

        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          <Feather name="check" size={18} color={COLORS.white} />
          <Text style={styles.saveBtnText}>
            {saving ? 'Збереження...' : 'Відкрити розчин'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { padding: 20, paddingBottom: 40 },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 10,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 40,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  chipActive: { borderColor: COLORS.brand, backgroundColor: COLORS.brand },
  chipText: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  chipTextActive: { color: COLORS.white },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: COLORS.bg,
  },
  shelfHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 8,
    marginLeft: 2,
  },
  saveBtn: {
    flexDirection: 'row',
    height: 56,
    borderRadius: 14,
    backgroundColor: COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 28,
    shadowColor: COLORS.brand,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.white },
});
