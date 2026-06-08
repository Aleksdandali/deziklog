import React, { useState, useEffect } from 'react';
import {
  View, TouchableOpacity, StyleSheet,
  SafeAreaView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { AppText as Text, AppTextInput as TextInput } from '../components/AppText';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';
import { COLORS } from '../lib/constants';

interface Props {
  onComplete: () => void;
}

/** Format E.164 +380XXXXXXXXX to display string */
function formatPhoneDisplay(raw?: string | null): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  let d = digits;
  if (d.startsWith('380')) d = d.slice(3);
  let out = '+380';
  if (d.length > 0) out += ' ' + d.slice(0, 2);
  if (d.length > 2) out += ' ' + d.slice(2, 5);
  if (d.length > 5) out += ' ' + d.slice(5, 7);
  if (d.length > 7) out += ' ' + d.slice(7, 9);
  return out;
}

export default function OnboardingScreen({ onComplete }: Props) {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const userPhone = session?.user?.phone;
  const meta = session?.user?.user_metadata;

  const [name, setName] = useState(meta?.name ?? '');
  const [lastName, setLastName] = useState(meta?.last_name ?? '');
  const [salonName, setSalonName] = useState(meta?.salon_name ?? '');
  const [email, setEmail] = useState(meta?.email ?? '');
  const [city, setCity] = useState(meta?.city ?? '');
  const [saving, setSaving] = useState(false);
  const [autofilled, setAutofilled] = useState(false);

  // Best-effort KeyCRM buyer lookup runs in background — form shows immediately.
  // If the lookup returns before the user starts typing, fields prefill.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('lookup-keycrm-buyer');
        if (cancelled) return;
        if (!error && data?.found) {
          // KeyCRM stores full_name as "First Last"; first token → name, rest → last_name.
          if (data.full_name) {
            const parts = String(data.full_name).trim().split(/\s+/);
            setName((prev: string) => prev.trim() ? prev : (parts[0] || ''));
            if (parts.length > 1) {
              setLastName((prev: string) => prev.trim() ? prev : parts.slice(1).join(' '));
            }
          }
          if (data.email) setEmail((prev: string) => prev.trim() ? prev : String(data.email));
          if (data.address) setCity((prev: string) => prev.trim() ? prev : String(data.address));
          setAutofilled(true);
        }
      } catch {
        // best-effort — never block onboarding
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // Escape hatch: user landed in onboarding with the wrong phone / a stale account
  // and needs to sign out without filling the form.
  const handleSignOut = () => {
    Alert.alert(
      'Вийти з акаунту?',
      'Ви зможете увійти знову з іншим номером телефону.',
      [
        { text: 'Скасувати', style: 'cancel' },
        { text: 'Вийти', style: 'destructive', onPress: () => supabase.auth.signOut().catch(() => {}) },
      ],
    );
  };

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert("Введіть ваше ім'я"); return; }
    if (!salonName.trim()) { Alert.alert('Введіть назву салону'); return; }
    if (!userId) {
      Alert.alert('Помилка авторизації', 'Спробуйте вийти і зайти знову.', [
        { text: 'Вийти', style: 'destructive', onPress: () => supabase.auth.signOut().catch(() => {}) },
      ]);
      return;
    }

    setSaving(true);
    try {
      if (__DEV__) console.log('[Onboarding] saving profile for', userId.slice(0, 8));
      const profileData: Record<string, any> = {
        id: userId,
        name: name.trim(),
        salon_name: salonName.trim(),
        updated_at: new Date().toISOString(),
      };
      if (lastName.trim()) profileData.last_name = lastName.trim();
      if (email.trim()) profileData.email = email.trim();
      if (city.trim()) profileData.city = city.trim();
      if (userPhone) profileData.phone = userPhone;

      const { error } = await supabase
        .from('profiles')
        .upsert(profileData);
      if (error) throw error;
      if (__DEV__) console.log('[Onboarding] profile saved OK');
      onComplete();
    } catch (err: unknown) {
      Alert.alert('Помилка', err instanceof Error ? err.message : 'Не вдалось зберегти');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleSignOut} hitSlop={12} style={styles.signOutBtn}>
          <Feather name="log-out" size={14} color={COLORS.textSecondary} />
          <Text style={styles.signOutText}>Вийти</Text>
        </TouchableOpacity>
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <LinearGradient
              colors={[COLORS.brand, COLORS.brandDark]}
              style={styles.iconCircle}
            >
              <Feather name="user-check" size={28} color="#FFFFFF" />
            </LinearGradient>
            <Text style={styles.title}>Заповніть профіль</Text>
            <Text style={styles.subtitle}>
              Ці дані потрібні для журналу стерилізації та звітів
            </Text>
          </View>

          <View style={styles.card}>
            {userPhone ? (
              <View style={styles.phoneRow}>
                <Feather name="phone" size={14} color={COLORS.textSecondary} />
                <Text style={styles.phoneText}>{formatPhoneDisplay(userPhone)}</Text>
              </View>
            ) : null}

            {autofilled ? (
              <View style={styles.autofillBadge}>
                <Feather name="zap" size={12} color={COLORS.brand} />
                <Text style={styles.autofillBadgeText}>Дані заповнено з вашого замовлення</Text>
              </View>
            ) : null}

            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Feather name="user" size={14} color={COLORS.textSecondary} />
                <Text style={styles.inputLabel}>Ваше ім'я *</Text>
              </View>
              <TextInput
                style={styles.input}
                placeholder="Олена"
                placeholderTextColor="#A0A4B8"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Feather name="user" size={14} color={COLORS.textSecondary} />
                <Text style={styles.inputLabel}>Прізвище</Text>
              </View>
              <TextInput
                style={styles.input}
                placeholder="Коваленко"
                placeholderTextColor="#A0A4B8"
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Ionicons name="business-outline" size={14} color={COLORS.textSecondary} />
                <Text style={styles.inputLabel}>Назва салону *</Text>
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

            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={[COLORS.brand, COLORS.brandDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.saveGradient}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Feather name="check" size={18} color="#FFFFFF" />
                    <Text style={styles.saveBtnText}>Зберегти та продовжити</Text>
                  </>
                )}
              </LinearGradient>
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

  header: { alignItems: 'center', marginBottom: 24 },
  iconCircle: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
    shadowColor: COLORS.brand, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 16, elevation: 8,
  },
  title: { fontSize: 24, fontWeight: '800', color: '#1B1B1B' },
  subtitle: { fontSize: 14, color: '#6B7280', marginTop: 6, textAlign: 'center', lineHeight: 20 },

  card: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 22,
    borderWidth: 1, borderColor: '#e2e4ed',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06, shadowRadius: 16, elevation: 4,
  },
  phoneRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 14, marginBottom: 12,
    backgroundColor: COLORS.cardBg, borderRadius: 10,
  },
  phoneText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '600' },

  autofillBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 12, marginBottom: 14,
    backgroundColor: '#F0F4FF', borderRadius: 8,
    borderWidth: 1, borderColor: '#DCE3FF',
  },
  autofillBadgeText: { fontSize: 12, color: COLORS.brand, fontWeight: '600' },

  inputGroup: { marginBottom: 14 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5, marginLeft: 2 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  input: {
    height: 48, borderRadius: 12, borderWidth: 1, borderColor: '#e2e4ed',
    backgroundColor: '#f5f6fa', paddingHorizontal: 14, fontSize: 15, color: '#1B1B1B',
  },

  topBar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 4 },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 10 },
  signOutText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },

  saveBtn: { marginTop: 6, borderRadius: 14, overflow: 'hidden' },
  saveGradient: {
    height: 52, borderRadius: 14, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
