import React from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { AppText as Text } from '../../components/AppText';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';

const STEPS = [
  'Створюй новий цикл.',
  'Вибери стерилізатор, відповідального за стерилізацію, інструменти, пакет та режим.',
  'Зроби фото до стерилізації. Знімай упаковку так, щоб у кадрі були видні індикатор та дата / напис на пакеті. Це підвищить довіру до запису з боку клієнта та під час внутрішньої перевірки.',
  'Запусти цикл і дочекайтесь вибраного часу.',
  'Після завершення циклу зроби фото після стерилізації.',
  'Познач результат індикатора.',
  'Збережи цикл у журналі.',
  'За потреби експортуй PDF-звіт або поділись результатом в Instagram.',
];

export default function HowToScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Як користуватися</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>Кілька кроків — і цикл стерилізації зафіксовано в журналі.</Text>

        {STEPS.map((step, i) => (
          <View key={i} style={styles.stepRow}>
            <View style={styles.stepNum}>
              <Text style={styles.stepNumText}>{i + 1}</Text>
            </View>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}

        <View style={styles.disclaimer}>
          <Feather name="info" size={16} color={COLORS.textSecondary} />
          <Text style={styles.disclaimerText}>
            Застосунок є електронним журналом фотофіксації обробки. Він не є лабораторним
            підтвердженням стерильності: фото індикатора підтверджує, що інструменти пройшли
            цикл обробки, а не що досягнуто стерильності.
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  body: { paddingHorizontal: 20 },
  intro: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 21, marginBottom: 20 },

  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  stepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  stepText: { flex: 1, fontSize: 14, color: COLORS.text, lineHeight: 21 },

  disclaimer: { flexDirection: 'row', gap: 10, marginTop: 12, padding: 14, borderRadius: 12, backgroundColor: COLORS.bg },
  disclaimerText: { flex: 1, fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },
});
