import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from './_layout';
import { COLORS } from '../lib/constants';

interface Props {
  onComplete: () => void;
}

export default function OnboardingScreen({ onComplete }: Props) {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const userEmail = session?.user?.email;

  const [name, setName] = useState('');
  const [salonName, setSalonName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Помилка', "Введіть ваше ім'я"); return; }
    if (!salonName.trim()) { Alert.alert('Помилка', 'Введіть назву салону'); return; }
    if (!phone.trim()) { Alert.alert('Помилка', 'Введіть телефон'); return; }
    if (!city.trim()) { Alert.alert('Помилка', 'Введіть місто'); return; }
    if (!userId) { Alert.alert('Помилка', 'Сесія не знайдена'); return; }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          name: name.trim(),
          salon_name: salonName.trim(),
          phone: phone.trim(),
          city: city.trim(),
          updated_at: new Date().toISOString(),
        });
      if (error) throw error;
      onComplete();
    } catch (err: any) {
      Alert.alert('Помилка', err.message || 'Не вдалось зберегти');
    } finally {
      setSaving(false);
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
            {userEmail ? (
              <View style={styles.emailRow}>
                <Feather name="mail" size={14} color={COLORS.textSecondary} />
                <Text style={styles.emailText}>{userEmail}</Text>
              </View>
            ) : null}

            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Feather name="user" size={14} color={COLORS.textSecondary} />
                <Text style={styles.inputLabel}>Ваше ім'я *</Text>
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
                <Feather name="phone" size={14} color={COLORS.textSecondary} />
                <Text style={styles.inputLabel}>Телефон *</Text>
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
                <Text style={styles.inputLabel}>Місто *</Text>
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
  emailRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 14, marginBottom: 16,
    backgroundColor: COLORS.cardBg, borderRadius: 10,
  },
  emailText: { fontSize: 14, color: COLORS.textSecondary },

  inputGroup: { marginBottom: 14 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5, marginLeft: 2 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  input: {
    height: 48, borderRadius: 12, borderWidth: 1, borderColor: '#e2e4ed',
    backgroundColor: '#f5f6fa', paddingHorizontal: 14, fontSize: 15, color: '#1B1B1B',
  },

  saveBtn: { marginTop: 6, borderRadius: 14, overflow: 'hidden' },
  saveGradient: {
    height: 52, borderRadius: 14, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
