import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { X, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { COLORS } from '@/lib/constants';
import { addSolution } from '@/lib/api';

const PREP_NAMES = ['Деланол', 'Bionol', 'Instrum', 'Septonal'];

export default function AddSolutionScreen() {
  const router = useRouter();
  const [selectedPrep, setSelectedPrep] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [expiryDate, setExpiryDate] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!selectedPrep) { Alert.alert('Оберіть препарат'); return; }
    if (!expiryDate) { Alert.alert('Введіть термін придатності'); return; }

    setSaving(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await addSolution({
        name: selectedPrep,
        opened_at: new Date(date).toISOString(),
        expires_at: new Date(expiryDate).toISOString(),
      });
      router.back();
    } catch (err: any) {
      Alert.alert('Помилка', err.message || 'Не вдалось зберегти');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Новий розчин</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <X size={20} color={COLORS.textSecondary} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Препарат</Text>
        <View style={styles.chips}>
          {PREP_NAMES.map((name) => {
            const active = selectedPrep === name;
            return (
              <TouchableOpacity key={name} style={[styles.chip, active && styles.chipActive]} onPress={() => setSelectedPrep(name)} activeOpacity={0.8}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>Дата приготування (РРРР-ММ-ДД)</Text>
        <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="2026-03-12" placeholderTextColor={COLORS.textSecondary} />

        <Text style={styles.label}>Термін придатності (РРРР-ММ-ДД)</Text>
        <TextInput style={styles.input} value={expiryDate} onChangeText={setExpiryDate} placeholder="2026-03-26" placeholderTextColor={COLORS.textSecondary} />

        <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
          <Check size={18} color={COLORS.white} strokeWidth={2.5} />
          <Text style={styles.saveBtnText}>{saving ? 'Збереження...' : 'Зберегти'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 40, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.white },
  chipActive: { borderColor: COLORS.brand, backgroundColor: COLORS.brand },
  chipText: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  chipTextActive: { color: COLORS.white },
  input: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, fontSize: 14, color: COLORS.text, backgroundColor: COLORS.bg },
  saveBtn: {
    flexDirection: 'row', height: 56, borderRadius: 14, backgroundColor: COLORS.brand,
    alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 28,
    shadowColor: COLORS.brand, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.white },
});
