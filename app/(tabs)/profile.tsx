import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../_layout';
import { COLORS } from '../../lib/constants';

interface ProfileRow {
  id: string;
  name: string | null;
  salon_name: string | null;
  phone: string | null;
  city: string | null;
}

export default function ProfileScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [salonName, setSalonName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [counts, setCounts] = useState({ sterilizers: 0, instruments: 0 });
  const [orders, setOrders] = useState<any[]>([]);

  useFocusEffect(useCallback(() => {
    if (!userId) return;
    (async () => {
      const [profileRes, instrRes, sterRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('instruments').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('sterilizers').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      ]);

      if (profileRes.error) console.error('Profile error:', profileRes.error.message);
      if (profileRes.data) {
        const p = profileRes.data as ProfileRow;
        setProfile(p);
        setName(p.name || '');
        setSalonName(p.salon_name || '');
        setPhone(p.phone || '');
        setCity(p.city || '');
      }
      setCounts({ instruments: instrRes.count ?? 0, sterilizers: sterRes.count ?? 0 });

      const orderRes = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5);
      if (orderRes.data) setOrders(orderRes.data);
    })();
  }, [userId]));

  const handleSave = async () => {
    if (!userId) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ name: name.trim() || null, salon_name: salonName.trim() || null, phone: phone.trim() || null, city: city.trim() || null })
        .eq('id', userId);
      if (error) throw error;
      setProfile((p) => p ? { ...p, name: name.trim(), salon_name: salonName.trim(), phone: phone.trim(), city: city.trim() } : p);
      setEditing(false);
    } catch (err: any) {
      Alert.alert('Помилка', err.message);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Вийти з акаунту?', 'Ви впевнені, що хочете вийти?', [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Вийти', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  };

  const getInitials = () => {
    if (!profile?.name) return '?';
    const parts = profile.name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.header}><Text style={styles.title}>Кабінет</Text></View>

        <View style={styles.profileCard}>
          <LinearGradient colors={[COLORS.brandDark, COLORS.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials()}</Text>
          </LinearGradient>
          <View style={styles.profileInfo}>
            {editing ? (
              <View style={styles.editForm}>
                <View style={styles.inputGroup}>
                  <Feather name="user" size={16} color={COLORS.textSecondary} style={styles.inputIcon} />
                  <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Ваше ім'я" placeholderTextColor={COLORS.textSecondary} />
                </View>
                <View style={styles.inputGroup}>
                  <Ionicons name="business-outline" size={16} color={COLORS.textSecondary} style={styles.inputIcon} />
                  <TextInput style={styles.input} value={salonName} onChangeText={setSalonName} placeholder="Назва салону" placeholderTextColor={COLORS.textSecondary} />
                </View>
                <View style={styles.inputGroup}>
                  <Feather name="phone" size={16} color={COLORS.textSecondary} style={styles.inputIcon} />
                  <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Телефон" placeholderTextColor={COLORS.textSecondary} keyboardType="phone-pad" />
                </View>
                <View style={styles.inputGroup}>
                  <Feather name="map-pin" size={16} color={COLORS.textSecondary} style={styles.inputIcon} />
                  <TextInput style={styles.input} value={city} onChangeText={setCity} placeholder="Місто" placeholderTextColor={COLORS.textSecondary} />
                </View>
                <View style={styles.editActions}>
                  <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
                    <Feather name="check" size={16} color={COLORS.white} />
                    <Text style={styles.saveBtnText}>Зберегти</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditing(false)} activeOpacity={0.8}>
                    <Text style={styles.cancelBtnText}>Скасувати</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View>
                <Text style={styles.profileName}>{profile?.name || "Ваше ім'я"}</Text>
                {profile?.salon_name ? <Text style={styles.profileSalon}>{profile.salon_name}</Text> : null}
                <View style={styles.profileDetails}>
                  {profile?.phone ? (<View style={styles.detailRow}><Feather name="phone" size={12} color={COLORS.textSecondary} /><Text style={styles.detailText}>{profile.phone}</Text></View>) : null}
                  {profile?.city ? (<View style={styles.detailRow}><Feather name="map-pin" size={12} color={COLORS.textSecondary} /><Text style={styles.detailText}>{profile.city}</Text></View>) : null}
                </View>
                <TouchableOpacity style={styles.editProfileBtn} onPress={() => setEditing(true)} activeOpacity={0.7}>
                  <Feather name="edit-2" size={13} color={COLORS.brand} />
                  <Text style={styles.editProfileText}>Редагувати профіль</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        <View style={styles.menuSection}>
          <Text style={styles.menuSectionTitle}>Налаштування</Text>
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/cabinet/sterilizers' as any)} activeOpacity={0.7}>
            <View style={[styles.menuIcon, { backgroundColor: '#FFF3E0' }]}><MaterialCommunityIcons name="radiator" size={20} color="#E65100" /></View>
            <View style={styles.menuContent}><Text style={styles.menuLabel}>Стерилізатори</Text><Text style={styles.menuSub}>Обладнання для стерилізації</Text></View>
            <View style={styles.menuRight}><View style={styles.countBadge}><Text style={styles.countText}>{counts.sterilizers}</Text></View><Feather name="chevron-right" size={16} color={COLORS.textSecondary} /></View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/cabinet/instruments' as any)} activeOpacity={0.7}>
            <View style={[styles.menuIcon, { backgroundColor: '#E8EAF6' }]}><MaterialCommunityIcons name="scissors-cutting" size={20} color={COLORS.brand} /></View>
            <View style={styles.menuContent}><Text style={styles.menuLabel}>Інструменти</Text><Text style={styles.menuSub}>Ножиці, пінцети, кусачки</Text></View>
            <View style={styles.menuRight}><View style={styles.countBadge}><Text style={styles.countText}>{counts.instruments}</Text></View><Feather name="chevron-right" size={16} color={COLORS.textSecondary} /></View>
          </TouchableOpacity>
        </View>

        <View style={styles.ordersSection}>
          <Text style={styles.ordersTitle}>Мої замовлення</Text>
          {orders.length === 0 ? (
            <Text style={styles.ordersEmpty}>Замовлень поки немає</Text>
          ) : (
            orders.map((order) => (
              <View key={order.id} style={styles.orderCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.orderDate}>
                    {new Date(order.created_at).toLocaleDateString('uk-UA', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </Text>
                  <Text style={styles.orderStatus}>
                    {order.status === 'pending' ? 'Очікує' : order.status === 'confirmed' ? 'Підтверджено' : order.status}
                  </Text>
                </View>
                <Text style={styles.orderTotal}>{Math.round(order.total_amount)} ₴</Text>
              </View>
            ))
          )}
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          <TouchableOpacity
            style={styles.privacyLink}
            onPress={() => router.push('/legal/privacy' as any)}
            activeOpacity={0.7}
          >
            <Feather name="shield" size={16} color={COLORS.textSecondary} />
            <Text style={styles.privacyLinkText}>Політика конфіденційності</Text>
            <Feather name="chevron-right" size={14} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleSignOut} activeOpacity={0.7}>
          <Feather name="log-out" size={16} color={COLORS.danger} />
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
  profileCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginHorizontal: 16, marginTop: 12, backgroundColor: COLORS.white, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 16 },
  avatar: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22, fontWeight: '700', color: COLORS.white, letterSpacing: 1 },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  profileSalon: { fontSize: 14, color: COLORS.textSecondary, marginTop: 2 },
  profileDetails: { marginTop: 8, gap: 4 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailText: { fontSize: 13, color: COLORS.textSecondary },
  editProfileBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, alignSelf: 'flex-start', paddingVertical: 4 },
  editProfileText: { fontSize: 13, fontWeight: '600', color: COLORS.brand },
  editForm: { gap: 8 },
  inputGroup: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, backgroundColor: COLORS.bg, paddingHorizontal: 12 },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, height: 42, fontSize: 14, color: COLORS.text },
  editActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  saveBtn: { flexDirection: 'row', flex: 1, height: 40, backgroundColor: COLORS.brand, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 6 },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.white },
  cancelBtn: { height: 40, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  menuSection: { marginTop: 24, paddingHorizontal: 16 },
  menuSectionTitle: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  menuItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 8 },
  menuIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  menuContent: { flex: 1 },
  menuLabel: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  menuSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  menuRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countBadge: { backgroundColor: COLORS.cardBg, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8 },
  countText: { fontSize: 13, fontWeight: '700', color: COLORS.brand },
  ordersSection: { marginTop: 24, paddingHorizontal: 16, marginBottom: 16 },
  ordersTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 12 },
  ordersEmpty: { fontSize: 14, color: COLORS.textSecondary },
  orderCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.white, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 8 },
  orderDate: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  orderStatus: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  orderTotal: { fontSize: 16, fontWeight: '700', color: COLORS.brand },
  privacyLink: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, marginBottom: 8 },
  privacyLinkText: { fontSize: 14, color: COLORS.textSecondary, flex: 1 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, marginHorizontal: 16, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#FFCDD2', backgroundColor: '#FFF5F5' },
  logoutText: { fontSize: 14, color: COLORS.danger, fontWeight: '600' },
});
