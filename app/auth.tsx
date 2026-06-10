import React, { useState, useRef, useEffect } from 'react';
import {
  View, TouchableOpacity, StyleSheet,
  SafeAreaView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { AppText as Text, AppTextInput as TextInput } from '../components/AppText';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { COLORS, POST_AUTH_ROUTE_KEY } from '../lib/constants';

type Step = 'phone' | 'otp';

const OTP_LENGTH = 6;
const RESEND_SECONDS = 60;
const VALID_PREFIXES = ['39', '50', '63', '66', '67', '68', '73', '91', '92', '93', '94', '95', '96', '97', '98', '99'];

/** Format raw digits (after +380) into "XX XXX XX XX" */
function formatLocalPhone(digits: string): string {
  const d = digits.slice(0, 9);
  let out = '';
  if (d.length > 0) out += d.slice(0, 2);
  if (d.length > 2) out += ' ' + d.slice(2, 5);
  if (d.length > 5) out += ' ' + d.slice(5, 7);
  if (d.length > 7) out += ' ' + d.slice(7, 9);
  return out;
}

function localizeError(msg: string): string {
  if (msg.includes('Token has expired')) return 'Код прострочений. Запросіть новий.';
  if (msg.includes('Invalid login credentials') || msg.includes('Token not found') || msg.includes('expired or is invalid')) {
    return 'Невірний код, спробуйте ще раз';
  }
  if (msg.includes('Phone not confirmed')) return 'Невірний код, спробуйте ще раз';
  const rateLimit = msg.match(/you can only request this after (\d+)s/i);
  if (rateLimit) return `Зачекайте ${rateLimit[1]} секунд перед новою спробою`;
  if (msg.toLowerCase().includes('network')) return "Перевірте з'єднання";
  if (msg.toLowerCase().includes('rate limit')) return 'Забагато спроб. Зачекайте хвилину.';
  return msg;
}

export default function AuthScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('phone');
  const [phoneDigits, setPhoneDigits] = useState(''); // 9 raw digits after +380
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const otpRefs = useRef<Array<TextInput | null>>([]);

  // Resend countdown
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((v) => (v <= 1 ? 0 : v - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const fullPhone = `+380${phoneDigits}`;

  const validatePhone = (): string | null => {
    if (phoneDigits.length !== 9) return 'Введіть 9 цифр номера';
    if (!VALID_PREFIXES.includes(phoneDigits.slice(0, 2))) {
      return 'Невірний код оператора';
    }
    return null;
  };

  const sendOtp = async () => {
    const err = validatePhone();
    if (err) { Alert.alert('Увага', err); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: fullPhone });
      if (error) throw error;
      setStep('otp');
      setOtp(['', '', '', '', '', '']);
      setResendIn(RESEND_SECONDS);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (e: unknown) {
      Alert.alert('Помилка', localizeError(e instanceof Error ? e.message : 'Щось пішло не так'));
    } finally {
      setLoading(false);
    }
  };

  // App Review 5.1.1(v): browsing the shop must not require registration.
  // If the user arrived here from the guest catalog ("Увійти" button), going
  // back preserves their place; on a cold start there is no history, so we
  // land them straight in the catalog tab.
  const browseAsGuest = () => {
    // The user declined to sign in — drop any stashed post-auth destination
    // so a later organic sign-in doesn't teleport them into an old flow.
    AsyncStorage.removeItem(POST_AUTH_ROUTE_KEY).catch(() => {});
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/catalog' as any);
    }
  };

  const verifyOtp = async (code: string) => {
    if (code.length !== OTP_LENGTH) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ phone: fullPhone, token: code, type: 'sms' });
      if (error) throw error;
      // onAuthStateChange in AuthProvider handles navigation
    } catch (e: unknown) {
      Alert.alert('Помилка', localizeError(e instanceof Error ? e.message : 'Невірний код'));
      setOtp(['', '', '', '', '', '']);
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    // Handle paste: if value contains multiple digits, distribute across cells
    const digits = value.replace(/\D/g, '');
    if (digits.length === 0) {
      const next = [...otp];
      next[index] = '';
      setOtp(next);
      return;
    }
    if (digits.length >= OTP_LENGTH) {
      const code = digits.slice(0, OTP_LENGTH).split('');
      const padded = [...code, ...Array(OTP_LENGTH - code.length).fill('')];
      setOtp(padded);
      otpRefs.current[OTP_LENGTH - 1]?.blur();
      verifyOtp(padded.join(''));
      return;
    }
    const next = [...otp];
    next[index] = digits[0];
    setOtp(next);
    if (index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    } else {
      // Last digit entered — auto-submit
      const code = next.join('');
      if (code.length === OTP_LENGTH) {
        otpRefs.current[index]?.blur();
        verifyOtp(code);
      }
    }
  };

  const handleOtpKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
      const next = [...otp];
      next[index - 1] = '';
      setOtp(next);
    }
  };

  // ── Step 2: OTP ──
  if (step === 'otp') {
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
            <TouchableOpacity
              style={styles.backLink}
              onPress={() => { setStep('phone'); setOtp(['', '', '', '', '', '']); }}
              hitSlop={12}
            >
              <Feather name="arrow-left" size={18} color={COLORS.brand} />
              <Text style={styles.backLinkText}>Назад</Text>
            </TouchableOpacity>

            <View style={styles.logoBlock}>
              <LinearGradient colors={[COLORS.brand, COLORS.brandDark]} style={styles.logoCircle}>
                <Feather name="message-square" size={28} color="#FFFFFF" />
              </LinearGradient>
              <Text style={styles.appName}>Введіть код</Text>
              <Text style={styles.appDesc}>
                Ми надіслали SMS на{'\n'}
                <Text style={styles.phoneHighlight}>+380 {formatLocalPhone(phoneDigits)}</Text>
              </Text>
            </View>

            <View style={styles.card}>
              <View style={styles.otpRow}>
                {otp.map((digit, i) => (
                  <TextInput
                    key={i}
                    ref={(r) => { otpRefs.current[i] = r; }}
                    style={[styles.otpCell, digit ? styles.otpCellFilled : null]}
                    value={digit}
                    onChangeText={(v) => handleOtpChange(i, v)}
                    onKeyPress={({ nativeEvent }) => handleOtpKeyPress(i, nativeEvent.key)}
                    keyboardType="number-pad"
                    maxLength={OTP_LENGTH}
                    textContentType="oneTimeCode"
                    autoComplete="sms-otp"
                    selectTextOnFocus
                    editable={!loading}
                  />
                ))}
              </View>

              {loading && (
                <View style={{ alignItems: 'center', marginTop: 12 }}>
                  <ActivityIndicator color={COLORS.brand} />
                </View>
              )}

              <TouchableOpacity
                style={styles.resendBtn}
                onPress={sendOtp}
                disabled={resendIn > 0 || loading}
                activeOpacity={0.7}
              >
                <Text style={[styles.resendText, resendIn > 0 && styles.resendTextDisabled]}>
                  {resendIn > 0 ? `Надіслати знову через ${resendIn}с` : 'Надіслати знову'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Step 1: Phone ──
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
            <LinearGradient colors={[COLORS.brand, COLORS.brandDark]} style={styles.logoCircle}>
              <Text style={styles.logoLetter}>D</Text>
            </LinearGradient>
            <Text style={styles.appName}>Dezik Log</Text>
            <Text style={styles.appDesc}>Журнал стерилізації</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.formTitle}>Вхід за номером телефону</Text>
            <Text style={styles.formSubtitle}>Ми надішлемо SMS з кодом підтвердження</Text>

            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Feather name="phone" size={14} color={COLORS.textSecondary} />
                <Text style={styles.inputLabel}>Номер телефону</Text>
              </View>
              <View style={styles.phoneInputRow}>
                <View style={styles.phonePrefix}>
                  <Text style={styles.phonePrefixText}>+380</Text>
                </View>
                <TextInput
                  style={styles.phoneInput}
                  placeholder="XX XXX XX XX"
                  placeholderTextColor="#A0A4B8"
                  value={formatLocalPhone(phoneDigits)}
                  onChangeText={(v) => setPhoneDigits(v.replace(/\D/g, '').slice(0, 9))}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  maxLength={13} // 9 digits + 3 spaces + 1 buffer
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
              onPress={sendOtp}
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
                  <Text style={styles.submitText}>Отримати код</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <Text style={styles.legalHint}>
              Натискаючи «Отримати код», ви погоджуєтеся з обробкою персональних даних.
            </Text>
          </View>

          <TouchableOpacity style={styles.guestLink} onPress={browseAsGuest} activeOpacity={0.7} hitSlop={8}>
            <Feather name="shopping-bag" size={15} color={COLORS.brand} />
            <Text style={styles.guestLinkText}>Переглянути каталог без реєстрації</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 24 },

  backLink: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', paddingVertical: 8, marginBottom: 6,
  },
  backLinkText: { fontSize: 15, fontWeight: '600', color: COLORS.brand },

  logoBlock: { alignItems: 'center', marginBottom: 28 },
  logoCircle: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    shadowColor: COLORS.brand, shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35, shadowRadius: 20, elevation: 10,
  },
  logoLetter: { fontSize: 32, fontWeight: '800', color: '#FFFFFF' },
  appName: { fontSize: 28, fontWeight: '800', color: '#1B1B1B', letterSpacing: -0.5, textAlign: 'center' },
  appDesc: { fontSize: 14, color: '#6B7280', marginTop: 6, textAlign: 'center', lineHeight: 20 },
  phoneHighlight: { fontWeight: '700', color: '#1B1B1B' },

  card: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 22,
    borderWidth: 1, borderColor: '#e2e4ed',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06, shadowRadius: 16, elevation: 4,
  },
  formTitle: { fontSize: 20, fontWeight: '700', color: '#1B1B1B', textAlign: 'center', marginBottom: 6 },
  formSubtitle: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginBottom: 18 },

  inputGroup: { marginBottom: 18 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5, marginLeft: 2 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#6B7280' },

  phoneInputRow: {
    flexDirection: 'row', height: 48, borderRadius: 12,
    borderWidth: 1, borderColor: '#e2e4ed', overflow: 'hidden',
    backgroundColor: '#f5f6fa',
  },
  phonePrefix: {
    paddingHorizontal: 14, justifyContent: 'center',
    backgroundColor: '#eef0f5', borderRightWidth: 1, borderRightColor: '#e2e4ed',
  },
  phonePrefixText: { fontSize: 15, fontWeight: '600', color: '#1B1B1B' },
  phoneInput: { flex: 1, paddingHorizontal: 12, fontSize: 15, color: '#1B1B1B' },

  otpRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  otpCell: {
    flex: 1, height: 56, borderRadius: 12,
    borderWidth: 1, borderColor: '#e2e4ed',
    backgroundColor: '#f5f6fa',
    textAlign: 'center', fontSize: 22, fontWeight: '700', color: '#1B1B1B',
  },
  otpCellFilled: { borderColor: COLORS.brand, backgroundColor: '#FFFFFF' },

  resendBtn: { alignItems: 'center', marginTop: 18, paddingVertical: 8 },
  resendText: { fontSize: 14, fontWeight: '600', color: COLORS.brand },
  resendTextDisabled: { color: '#A0A4B8' },

  submitBtn: { marginTop: 4, borderRadius: 14, overflow: 'hidden' },
  submitBtnDisabled: { opacity: 0.6 },
  submitGradient: {
    height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.brand, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35, shadowRadius: 16, elevation: 8,
  },
  submitText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  legalHint: { fontSize: 12, color: '#6B7280', textAlign: 'center', marginTop: 14, lineHeight: 17 },

  guestLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 20, paddingVertical: 10,
  },
  guestLinkText: { fontSize: 15, fontWeight: '600', color: COLORS.brand },
});
