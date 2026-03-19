import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { COLORS } from '../lib/constants';

/** Map Supabase error messages to Ukrainian */
function localizeError(msg: string): string {
  const map: Record<string, string> = {
    'Invalid login credentials': 'Невірний email або пароль',
    'Email not confirmed': 'Email не підтверджено. Перевірте пошту.',
    'User already registered': 'Цей email вже зареєстровано. Спробуйте увійти.',
    'Password should be at least 6 characters': 'Пароль має містити щонайменше 6 символів',
    'Unable to validate email address: invalid format': 'Невірний формат email',
    'Signup requires a valid password': 'Введіть пароль',
    'For security purposes, you can only request this after': 'Забагато спроб. Зачекайте хвилину.',
  };
  for (const [key, value] of Object.entries(map)) {
    if (msg.includes(key)) return value;
  }
  return msg;
}

export default function AuthScreen() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const validate = (): string | null => {
    if (!email.trim()) return 'Введіть email';
    if (!/\S+@\S+\.\S+/.test(email.trim())) return 'Невірний формат email';
    if (!password.trim()) return 'Введіть пароль';
    if (password.trim().length < 6) return 'Пароль — мінімум 6 символів';
    return null;
  };

  const handleSubmit = async () => {
    const errorMsg = validate();
    if (errorMsg) {
      Alert.alert('Увага', errorMsg);
      return;
    }

    setLoading(true);
    try {
      if (isRegister) {
        if (__DEV__) console.log('[Auth Screen] signUp start:', email.trim());

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password.trim(),
        });

        if (__DEV__) console.log('[Auth Screen] signUp result:', {
          error: error?.message ?? null,
          hasSession: !!data?.session,
          hasUser: !!data?.user,
          userId: data?.user?.id?.slice(0, 8),
          identities: data?.user?.identities?.length,
          emailConfirmed: data?.user?.email_confirmed_at ?? 'not confirmed',
          accessToken: data?.session?.access_token ? 'present' : 'missing',
        });

        if (error) throw error;

        // Supabase gotcha: if user already exists with confirmation OFF,
        // it returns user with empty identities array and no error
        if (data?.user && (!data.user.identities || data.user.identities.length === 0)) {
          Alert.alert(
            'Цей email вже зареєстровано',
            'Спробуйте увійти замість реєстрації.',
            [{ text: 'OK', onPress: () => setIsRegister(false) }],
          );
          return;
        }

        if (!data.session) {
          // Email confirmation is ON — show check-email screen
          if (__DEV__) console.log('[Auth Screen] No session after signUp — showing confirmation screen');
          setShowConfirmation(true);
        } else {
          // Confirmation OFF — session exists, onAuthStateChange will pick it up
          if (__DEV__) console.log('[Auth Screen] Session received — waiting for onAuthStateChange');
        }
      } else {
        if (__DEV__) console.log('[Auth Screen] signIn start:', email.trim());

        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim(),
        });

        if (__DEV__) console.log('[Auth Screen] signIn result:', {
          error: error?.message ?? null,
          hasSession: !!data?.session,
          userId: data?.user?.id?.slice(0, 8),
        });

        if (error) throw error;
        // onAuthStateChange in AuthProvider handles navigation
      }
    } catch (err: any) {
      if (__DEV__) console.error('[Auth Screen] Error:', err?.message, err);
      const msg = localizeError(err?.message || 'Щось пішло не так');
      Alert.alert('Помилка', msg);
    } finally {
      setLoading(false);
    }
  };

  // Confirmation screen after registration
  if (showConfirmation) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.confirmationContainer}>
          <View style={styles.confirmationIcon}>
            <Feather name="mail" size={36} color={COLORS.brand} />
          </View>
          <Text style={styles.confirmationTitle}>Перевірте пошту</Text>
          <Text style={styles.confirmationText}>
            Ми надіслали лист на{'\n'}
            <Text style={styles.confirmationEmail}>{email.trim()}</Text>
          </Text>
          <Text style={styles.confirmationHint}>
            Натисніть посилання в листі, щоб підтвердити акаунт. Після цього поверніться сюди та увійдіть.
          </Text>
          <TouchableOpacity
            style={styles.confirmationBtn}
            onPress={() => { setShowConfirmation(false); setIsRegister(false); }}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={[COLORS.brand, COLORS.brandDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.submitGradient}
            >
              <Text style={styles.submitText}>Повернутись до входу</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

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
              {isRegister ? 'Створити акаунт' : 'Вхід'}
            </Text>

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
                textContentType="emailAddress"
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
                autoComplete={isRegister ? 'new-password' : 'password'}
                textContentType={isRegister ? 'newPassword' : 'password'}
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

  // Confirmation screen
  confirmationContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
  },
  confirmationIcon: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.cardBg,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  confirmationTitle: {
    fontSize: 24, fontWeight: '800', color: '#1B1B1B', marginBottom: 12,
  },
  confirmationText: {
    fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22,
  },
  confirmationEmail: {
    fontWeight: '700', color: COLORS.brand,
  },
  confirmationHint: {
    fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20,
    marginTop: 16, marginBottom: 28,
  },
  confirmationBtn: { width: '100%', borderRadius: 14, overflow: 'hidden' },
});
