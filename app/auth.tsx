import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { COLORS } from '../lib/constants';

export default function AuthScreen() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [salonName, setSalonName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(false);

  const validate = (): string | null => {
    if (isRegister) {
      if (!name.trim()) return "Введіть ваше ім'я";
      if (!salonName.trim()) return 'Введіть назву салону';
      if (!phone.trim()) return 'Введіть телефон';
      if (!city.trim()) return 'Введіть місто';
    }
    if (!email.trim()) return 'Введіть email';
    if (!/\S+@\S+\.\S+/.test(email.trim())) return 'Невірний формат email';
    if (!password.trim()) return 'Введіть пароль';
    if (password.trim().length < 6) return 'Пароль має містити щонайменше 6 символів';
    return null;
  };

  const handleSubmit = async () => {
    const errorMsg = validate();
    if (errorMsg) {
      Alert.alert('Помилка', errorMsg);
      return;
    }

    setLoading(true);
    try {
      if (isRegister) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password.trim(),
          options: {
            data: {
              name: name.trim(),
              salon_name: salonName.trim(),
              phone: phone.trim(),
              city: city.trim(),
            },
          },
        });
        if (error) throw error;

        if (!data.session) {
          Alert.alert(
            'Перевірте пошту',
            'Ми надіслали лист для підтвердження на ' + email.trim(),
            [{ text: 'OK', onPress: () => setIsRegister(false) }],
          );
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim(),
        });
        if (error) throw error;
      }
    } catch (err: any) {
      const msg = err?.message || 'Щось пішло не так';
      Alert.alert('Помилка', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoBlock}>
            <LinearGradient
              colors={[COLORS.brand, COLORS.brandDark]}
              style={styles.logoCircle}
            >
              <Text style={styles.logoLetter}>D</Text>
            </LinearGradient>
            <Text style={styles.appName}>Dezik Log</Text>
            <Text style={styles.appDesc}>Журнал стерилізації</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.formTitle}>
              {isRegister ? 'Реєстрація' : 'Вхід в акаунт'}
            </Text>

            {isRegister && (
              <>
                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Feather name="user" size={14} color={COLORS.textSecondary} />
                    <Text style={styles.inputLabel}>Ваше ім'я</Text>
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="Олена Коваленко"
                    placeholderTextColor="#A0A4B8"
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Ionicons name="business-outline" size={14} color={COLORS.textSecondary} />
                    <Text style={styles.inputLabel}>Назва салону</Text>
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="Beauty Studio"
                    placeholderTextColor="#A0A4B8"
                    value={salonName}
                    onChangeText={setSalonName}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Feather name="phone" size={14} color={COLORS.textSecondary} />
                    <Text style={styles.inputLabel}>Телефон</Text>
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="+380 XX XXX XX XX"
                    placeholderTextColor="#A0A4B8"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Feather name="map-pin" size={14} color={COLORS.textSecondary} />
                    <Text style={styles.inputLabel}>Місто</Text>
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="Одеса"
                    placeholderTextColor="#A0A4B8"
                    value={city}
                    onChangeText={setCity}
                  />
                </View>
              </>
            )}

            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Feather name="mail" size={14} color={COLORS.textSecondary} />
                <Text style={styles.inputLabel}>Email</Text>
              </View>
              <TextInput
                style={styles.input}
                placeholder="your@email.com"
                placeholderTextColor="#A0A4B8"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
              />
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Feather name="lock" size={14} color={COLORS.textSecondary} />
                <Text style={styles.inputLabel}>Пароль</Text>
              </View>
              <TextInput
                style={styles.input}
                placeholder="Мінімум 6 символів"
                placeholderTextColor="#A0A4B8"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="password"
              />
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={[COLORS.brand, COLORS.brandDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.submitGradient}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitText}>
                    {isRegister ? 'Зареєструватись' : 'Увійти'}
                  </Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toggleBtn}
              onPress={() => setIsRegister(!isRegister)}
              activeOpacity={0.7}
            >
              <Text style={styles.toggleText}>
                {isRegister ? 'Вже є акаунт? ' : 'Немає акаунту? '}
                <Text style={styles.toggleLink}>
                  {isRegister ? 'Увійти' : 'Зареєструватись'}
                </Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 24 },

  logoBlock: { alignItems: 'center', marginBottom: 28 },
  logoCircle: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    shadowColor: COLORS.brand, shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35, shadowRadius: 20, elevation: 10,
  },
  logoLetter: { fontSize: 32, fontWeight: '800', color: '#FFFFFF' },
  appName: { fontSize: 28, fontWeight: '800', color: '#1B1B1B', letterSpacing: -0.5 },
  appDesc: { fontSize: 14, color: '#6B7280', marginTop: 3 },

  card: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 22,
    borderWidth: 1, borderColor: '#e2e4ed',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06, shadowRadius: 16, elevation: 4,
  },
  formTitle: { fontSize: 20, fontWeight: '700', color: '#1B1B1B', textAlign: 'center', marginBottom: 18 },

  inputGroup: { marginBottom: 14 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5, marginLeft: 2 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  input: {
    height: 48, borderRadius: 12, borderWidth: 1, borderColor: '#e2e4ed',
    backgroundColor: '#f5f6fa', paddingHorizontal: 14, fontSize: 15, color: '#1B1B1B',
  },

  submitBtn: { marginTop: 4, borderRadius: 14, overflow: 'hidden' },
  submitBtnDisabled: { opacity: 0.6 },
  submitGradient: {
    height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.brand, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35, shadowRadius: 16, elevation: 8,
  },
  submitText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  toggleBtn: { alignItems: 'center', marginTop: 18 },
  toggleText: { fontSize: 14, color: '#6B7280' },
  toggleLink: { color: COLORS.brand, fontWeight: '600' },
});
