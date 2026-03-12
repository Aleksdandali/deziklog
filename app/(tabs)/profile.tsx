import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { User, ChevronRight, Thermometer, Scissors, LogOut } from 'lucide-react-native';
import { COLORS } from '@/lib/constants';
import { getProfile, upsertProfile, signOut, getInstruments, getSterilizers } from '@/lib/api';
import type { Profile } from '@/lib/types';

const MENU_ITEMS = [
  { key: 'sterilizers', label: 'Стерилізатори', icon: Thermometer, route: '/cabinet/sterilizers' },
  { key: 'instruments', label: 'Інструменти', icon: Scissors, route: '/cabinet/instruments' },
] as const;

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [salonName, setSalonName] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({ sterilizers: 0, instruments: 0 });

  useFocusEffect(useCallback(() => {
    (async () => {
      try {
        const [p, instr, ster] = await Promise.all([getProfile(), getInstruments(), getSterilizers()]);
        if (p) {
          setProfile(p);
          setName(p.name || '');
          setSalonName(p.salon_name || '');
        }
        setCounts({ instruments: instr.length, sterilizers: ster.length });
      } catch (err) {
        console.error('Profile load error:', err);
      }
    })();
  }, []));

  const handleSave = async () => {
    try {
      const updated = await upsertProfile({ name: name.trim(), salon_name: salonName.trim() });
      setProfile(updated);
      setEditing(false);
    } catch (err: any) {
      Alert.alert('Помилка', err.message);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Вийти?', '', [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Вийти', style: 'destructive', onPress: async () => {
        try { await signOut(); } catch {}
      }},
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.header}>
          <Text style={styles.title}>Кабінет</Text>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <User size={32} color={COLORS.brand} strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1 }}>
            {editing ? (
              <View style={{ gap: 8 }}>
                <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Ваше ім'я" placeholderTextColor={COLORS.textSecondary} />
                <TextInput style={styles.input} value={salonName} onChangeText={setSalonName} placeholder="Назва салону" placeholderTextColor={COLORS.textSecondary} />
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
                  <Text style={styles.saveBtnText}>Зберегти</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setEditing(true)} activeOpacity={0.7}>
                <Text style={styles.profileName}>{profile?.name || "Додати ім'я"}</Text>
                <Text style={styles.profileRole}>{profile?.salon_name || 'Натисніть щоб редагувати'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.menuSection}>
          <Text style={styles.menuTitle}>Налаштування</Text>
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <TouchableOpacity key={item.key} style={styles.menuItem} onPress={() => router.push(item.route as any)} activeOpacity={0.7}>
                <View style={styles.menuIcon}>
                  <Icon size={18} color={COLORS.brand} strokeWidth={1.8} />
                </View>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <View style={styles.menuRight}>
                  <Text style={styles.menuCount}>{counts[item.key] ?? 0}</Text>
                  <ChevronRight size={16} color={COLORS.textSecondary} />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleSignOut} activeOpacity={0.7}>
          <LogOut size={14} color={COLORS.danger} strokeWidth={2} />
          <Text style={styles.logoutText}>Вийти з акаунту</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.text },
  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 16, marginTop: 12,
    backgroundColor: COLORS.white, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 16,
  },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.cardBg, alignItems: 'center', justifyContent: 'center' },
  profileName: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  profileRole: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  input: { height: 40, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, fontSize: 14, color: COLORS.text, backgroundColor: COLORS.bg },
  saveBtn: { height: 36, backgroundColor: COLORS.brand, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.white },
  menuSection: { marginTop: 24, paddingHorizontal: 16 },
  menuTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  menuItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 8 },
  menuIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.cardBg, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  menuLabel: { fontSize: 15, fontWeight: '600', color: COLORS.text, flex: 1 },
  menuRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  menuCount: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, backgroundColor: COLORS.cardBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 32, padding: 12 },
  logoutText: { fontSize: 13, color: COLORS.danger, fontWeight: '500' },
});
