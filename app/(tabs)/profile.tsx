import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { User, ChevronRight, Thermometer, Scissors, Package, FlaskConical, Trash2 } from 'lucide-react-native';
import { COLORS } from '@/lib/constants';
import { getProfile, saveProfile, clearAllData } from '@/lib/storage';
import type { UserProfile } from '@/lib/types';

const MENU_ITEMS = [
  { key: 'sterilizers', label: 'Стерилізатори', icon: Thermometer, route: '/cabinet/sterilizers' },
  { key: 'instruments', label: 'Інструменти', icon: Scissors, route: '/cabinet/instruments' },
  { key: 'packs', label: 'Пакети', icon: Package, route: '/cabinet/packs' },
  { key: 'preparations', label: 'Препарати', icon: FlaskConical, route: '/cabinet/preparations' },
] as const;

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile>({ name: '', role: 'Майстер манікюру', sterilizers: [], instruments: [], packs: [], preparations: [] });
  const [editing, setEditing] = useState(false);

  useFocusEffect(useCallback(() => {
    (async () => setProfile(await getProfile()))();
  }, []));

  const handleSave = async () => {
    await saveProfile(profile);
    setEditing(false);
  };

  const handleClear = () => {
    Alert.alert('Видалити всі дані?', 'Журнал, розчини та налаштування будуть видалені.', [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Видалити', style: 'destructive', onPress: async () => {
        await clearAllData();
        setProfile({ name: '', role: 'Майстер манікюру', sterilizers: [], instruments: [], packs: [], preparations: [] });
        Alert.alert('Готово', 'Всі дані видалено');
      }},
    ]);
  };

  const getCount = (key: string): number => {
    const arr = (profile as any)[key];
    return Array.isArray(arr) ? arr.length : 0;
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.header}>
          <Text style={styles.title}>Кабінет</Text>
        </View>

        {/* Profile card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <User size={32} color={COLORS.brand} strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1 }}>
            {editing ? (
              <View style={{ gap: 8 }}>
                <TextInput
                  style={styles.input}
                  value={profile.name}
                  onChangeText={(t) => setProfile((p) => ({ ...p, name: t }))}
                  placeholder="Ваше ім'я"
                  placeholderTextColor={COLORS.textSecondary}
                />
                <TextInput
                  style={styles.input}
                  value={profile.role}
                  onChangeText={(t) => setProfile((p) => ({ ...p, role: t }))}
                  placeholder="Роль"
                  placeholderTextColor={COLORS.textSecondary}
                />
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
                  <Text style={styles.saveBtnText}>Зберегти</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setEditing(true)} activeOpacity={0.7}>
                <Text style={styles.profileName}>{profile.name || 'Додати ім\'я'}</Text>
                <Text style={styles.profileRole}>{profile.role}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Menu */}
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
                  <Text style={styles.menuCount}>{getCount(item.key)}</Text>
                  <ChevronRight size={16} color={COLORS.textSecondary} />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Danger zone */}
        <TouchableOpacity style={styles.dangerBtn} onPress={handleClear} activeOpacity={0.7}>
          <Trash2 size={14} color={COLORS.danger} strokeWidth={2} />
          <Text style={styles.dangerText}>Видалити всі дані</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileName: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  profileRole: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  input: {
    height: 40,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: COLORS.bg,
  },
  saveBtn: {
    height: 36,
    backgroundColor: COLORS.brand,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.white },
  menuSection: { marginTop: 24, paddingHorizontal: 16 },
  menuTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 8,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuLabel: { fontSize: 15, fontWeight: '600', color: COLORS.text, flex: 1 },
  menuRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  menuCount: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, backgroundColor: COLORS.cardBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 32, padding: 12 },
  dangerText: { fontSize: 13, color: COLORS.danger, fontWeight: '500' },
});
