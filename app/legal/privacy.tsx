import React from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';

export default function PrivacyScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Політика конфіденційності</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.updated}>Оновлено: березень 2026</Text>

        <Text style={styles.sectionTitle}>1. Які дані ми збираємо</Text>
        <Text style={styles.text}>
          Dezik Log збирає такі дані для роботи додатку:{'\n'}
          • Email та пароль — для автентифікації{'\n'}
          • Імʼя, назва салону, телефон — для профілю{'\n'}
          • Фото індикаторів стерилізації — для журналу{'\n'}
          • Дані про цикли стерилізації та розчини — для ведення журналу{'\n'}
          • Адреса доставки — для замовлень
        </Text>

        <Text style={styles.sectionTitle}>2. Як ми зберігаємо дані</Text>
        <Text style={styles.text}>
          Усі дані зберігаються на серверах Supabase (AWS, регіон EU).
          Фото зберігаються в захищеному хмарному сховищі.
          Доступ до даних має тільки власник аккаунту.
        </Text>

        <Text style={styles.sectionTitle}>3. Кому ми передаємо дані</Text>
        <Text style={styles.text}>
          Ми не продаємо і не передаємо ваші персональні дані третім особам.
          Дані використовуються виключно для роботи додатку Dezik Log.
        </Text>

        <Text style={styles.sectionTitle}>4. Видалення аккаунту</Text>
        <Text style={styles.text}>
          Ви можете видалити свій аккаунт у розділі Кабінет → Видалити акаунт.
          При видаленні всі ваші дані будуть безповоротно видалені.
        </Text>

        <Text style={styles.sectionTitle}>5. Контакти</Text>
        <Text style={styles.text}>
          З питань конфіденційності звертайтесь: support@dezik.com.ua
        </Text>

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
  updated: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginTop: 20, marginBottom: 8 },
  text: { fontSize: 14, color: COLORS.text, lineHeight: 22 },
});
