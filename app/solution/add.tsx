import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { X, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { COLORS } from '@/lib/constants';
import { addSolution, getProfile } from '@/lib/storage';
import type { PreparationItem } from '@/lib/types';

const DEFAULT_PREPS: PreparationItem[] = [
  { id: '1', name: 'Деланол', defaultConcentration: 2, defaultExposure: 30 },
  { id: '2', name: 'Bionol', defaultConcentration: 2, defaultExposure: 30 },
  { id: '3', name: 'Instrum', defaultConcentration: 0, defaultExposure: 15 },
  { id: '4', name: 'Septonal', defaultConcentration: 0, defaultExposure: 0 },
];

export default function AddSolutionScreen() {
  const router = useRouter();
  const [preps, setPreps] = useState<PreparationItem[]>(DEFAULT_PREPS);
  const [selectedPrep, setSelectedPrep] = useState<string>('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [expiryDate, setExpiryDate] = useState('');
  const [concentration, setConcentration] = useState('');
  const [exposure, setExposure] = useState('');

  useEffect(() => {
    (async () => {
      const profile = await getProfile();
      if (profile.preparations.length > 0) {
        setPreps(profile.preparations);
      }
    })();
  }, []);

  const handleSelectPrep = (name: string) => {
    setSelectedPrep(name);
    const prep = preps.find((p) => p.name === name);
    if (prep) {
      if (prep.defaultConcentration) setConcentration(String(prep.defaultConcentration));
      if (prep.defaultExposure) setExposure(String(prep.defaultExposure));
    }
  };

  const handleSave = async () => {
    if (!selectedPrep) { Alert.alert('Оберіть препарат'); return; }
    if (!expiryDate) { Alert.alert('Введіть термін придатності'); return; }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await addSolution({
      date,
      preparation: selectedPrep,
      expiryDate,
      concentration: parseFloat(concentration) || 0,
      exposureMinutes: parseInt(exposure, 10) || 0,
    });
    router.back();
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
          {preps.map((p) => {
            const active = selectedPrep === p.name;
            return (
              <TouchableOpacity key={p.id} style={[styles.chip, active && styles.chipActive]} onPress={() => handleSelectPrep(p.name)} activeOpacity={0.8}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>Дата приготування</Text>
        <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="2026-03-11" placeholderTextColor={COLORS.textSecondary} />

        <Text style={styles.label}>Термін придатності</Text>
        <TextInput style={styles.input} value={expiryDate} onChangeText={setExpiryDate} placeholder="2026-03-25" placeholderTextColor={COLORS.textSecondary} />

        <Text style={styles.label}>Концентрація (%)</Text>
        <TextInput style={styles.input} value={concentration} onChangeText={setConcentration} placeholder="2" keyboardType="numeric" placeholderTextColor={COLORS.textSecondary} />

        <Text style={styles.label}>Час експозиції (хв)</Text>
        <TextInput style={styles.input} value={exposure} onChangeText={setExposure} placeholder="30" keyboardType="numeric" placeholderTextColor={COLORS.textSecondary} />

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.85}>
          <Check size={18} color={COLORS.white} strokeWidth={2.5} />
          <Text style={styles.saveBtnText}>Зберегти</Text>
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
