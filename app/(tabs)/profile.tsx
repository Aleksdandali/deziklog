import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity,
  TextInput, Alert, Switch, ActivityIndicator, LayoutAnimation, UIManager, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth-context';
import { getProfile, getOrders, searchNPCities, getNPWarehouses, type SterilizationSession } from '../../lib/api';
import type { OrderItem, NPCity, NPWarehouse } from '../../lib/types';
import { generateJournalPDF } from '../../lib/pdf-export';
import { getCached, setCache } from '../../lib/cache';
import { COLORS } from '../../lib/constants';
import { RADII } from '../../lib/theme';
import type { UserRole, Order } from '../../lib/types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface ProfileData {
  id: string;
  name: string | null;
  last_name: string | null;
  salon_name: string | null;
  phone: string | null;
  city: string | null;
  city_ref: string | null;
  warehouse_ref: string | null;
  warehouse_name: string | null;
  email: string | null;
  role: UserRole;
  notification_cycle_done: boolean;
  notification_cycle_idle: boolean;
  notification_order_status: boolean;
}

const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Власник салону',
  staff: 'Майстер',
};

const ROLE_ICONS: Record<UserRole, string> = {
  owner: 'shield',
  staff: 'user',
};

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending: { label: 'Нове', color: COLORS.warning, bg: COLORS.warningBg, icon: 'clock' },
  confirmed: { label: 'Підтверджено', color: COLORS.success, bg: COLORS.successBg, icon: 'check-circle' },
  canceled: { label: 'Скасовано', color: COLORS.danger, bg: COLORS.dangerBg, icon: 'x-circle' },
};

function formatPrice(price: number): string {
  return price.toLocaleString('uk-UA') + ' ₴';
}

function formatOrderDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
  } catch { return '--'; }
}

function formatFullDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return '--'; }
}

export default function ProfileScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const userEmail = session?.user?.email;

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [lastName, setLastName] = useState('');
  const [salonName, setSalonName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');

  // Nova Poshta delivery
  const [cityQuery, setCityQuery] = useState('');
  const [npCities, setNpCities] = useState<NPCity[]>([]);
  const [selectedCity, setSelectedCity] = useState<NPCity | null>(null);
  const [loadingCities, setLoadingCities] = useState(false);
  const [warehouseQuery, setWarehouseQuery] = useState('');
  const [npWarehouses, setNpWarehouses] = useState<NPWarehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<NPWarehouse | null>(null);
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);
  const cityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [orders, setOrders] = useState<(Order & { order_items?: OrderItem[] })[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  const applyProfile = (p: ProfileData) => {
    setProfile(p);
    setName(p.name || '');
    setLastName(p.last_name || '');
    setSalonName(p.salon_name || '');
    setPhone(p.phone || '');
    setCity(p.city || '');
    // Restore NP delivery data
    setCityQuery(p.city || '');
    if (p.city && p.city_ref) {
      setSelectedCity({ ref: p.city_ref, name: p.city, region: '' });
    } else {
      setSelectedCity(null);
    }
    if (p.warehouse_ref && p.warehouse_name) {
      setSelectedWarehouse({ ref: p.warehouse_ref, description: p.warehouse_name, number: '' });
      setWarehouseQuery(p.warehouse_name);
    } else {
      setSelectedWarehouse(null);
      setWarehouseQuery('');
    }
    setNpCities([]);
    setNpWarehouses([]);
  };

  useFocusEffect(useCallback(() => {
    if (!userId) return;
    getCached<ProfileData>(`profile_${userId}`).then((cached) => {
      if (cached && !profile) applyProfile(cached);
    });
    (async () => {
      try {
        const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
        if (data) {
          const p: ProfileData = {
            id: data.id,
            name: data.name,
            last_name: data.last_name ?? null,
            salon_name: data.salon_name,
            phone: data.phone,
            city: data.city,
            city_ref: data.city_ref ?? null,
            warehouse_ref: data.warehouse_ref ?? null,
            warehouse_name: data.warehouse_name ?? null,
            email: userEmail ?? null,
            role: data.role ?? 'owner',
            notification_cycle_done: data.notification_cycle_done ?? true,
            notification_cycle_idle: data.notification_cycle_idle ?? true,
            notification_order_status: data.notification_order_status ?? true,
          };
          applyProfile(p);
          setCache(`profile_${userId}`, p);
        }
      } catch {}
      try {
        const o = await getOrders(userId);
        setOrders(o.slice(0, 10));
      } catch {}
      setLoadingOrders(false);
    })();
  }, [userId]));

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const cityName = selectedCity?.name || city.trim() || null;
      await supabase.from('profiles')
        .update({
          name: name.trim() || null,
          last_name: lastName.trim() || null,
          salon_name: salonName.trim() || null,
          phone: phone.trim() || null,
          city: cityName,
          city_ref: selectedCity?.ref || null,
          warehouse_ref: selectedWarehouse?.ref || null,
          warehouse_name: selectedWarehouse?.description || null,
        })
        .eq('id', userId);
      setProfile((p) => p ? {
        ...p,
        name: name.trim(),
        last_name: lastName.trim(),
        salon_name: salonName.trim(),
        phone: phone.trim(),
        city: cityName,
        city_ref: selectedCity?.ref || null,
        warehouse_ref: selectedWarehouse?.ref || null,
        warehouse_name: selectedWarehouse?.description || null,
      } : p);
      setEditing(false);
    } catch (err: any) {
      Alert.alert('Помилка', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleRole = async () => {
    if (!userId || !profile) return;
    const newRole: UserRole = profile.role === 'owner' ? 'staff' : 'owner';
    try {
      await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
      const updated = { ...profile, role: newRole };
      setProfile(updated);
      setCache(`profile_${userId}`, updated);
    } catch (err: any) {
      Alert.alert('Помилка', err.message);
    }
  };

  const handleToggleNotification = async (field: 'notification_cycle_done' | 'notification_cycle_idle' | 'notification_order_status', value: boolean) => {
    if (!userId || !profile) return;
    try {
      await supabase.from('profiles').update({ [field]: value }).eq('id', userId);
      const updated = { ...profile, [field]: value };
      setProfile(updated);
      setCache(`profile_${userId}`, updated);
    } catch {}
  };

  const handleExportPDF = async () => {
    if (!userId) return;
    try {
      const { data: sessions } = await supabase
        .from('sterilization_sessions').select('*').eq('user_id', userId)
        .in('status', ['completed', 'failed']).order('created_at', { ascending: false });
      if (!sessions?.length) { Alert.alert('Немає записів'); return; }
      const prof = await getProfile(userId);
      const pdfData = sessions.map((s: SterilizationSession) => ({
        id: s.id, user_id: s.user_id, instrument_id: null, sterilizer_id: s.sterilizer_id,
        instrument_name: s.instrument_names, sterilizer_name: s.sterilizer_name,
        packet_type: s.packet_type, duration_minutes: s.duration_minutes,
        temperature: s.temperature, result: s.result === 'success' ? 'passed' : 'failed',
        notes: null, started_at: s.started_at || s.created_at, created_at: s.created_at,
      }));
      const uri = await generateJournalPDF(pdfData, prof?.salon_name ?? undefined);
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Журнал', UTI: 'com.adobe.pdf' });
    } catch { Alert.alert('Помилка', 'Не вдалось створити PDF'); }
  };

  const handleSignOut = () => {
    Alert.alert('Вийти з акаунту?', 'Ви зможете увійти знову в будь-який час', [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Вийти', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  };

  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = () => {
    Alert.alert(
      'Видалити акаунт?',
      'Всі ваші дані (журнал, замовлення, профіль) будуть видалені назавжди. Цю дію неможливо скасувати.',
      [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Видалити назавжди',
          style: 'destructive',
          onPress: () => {
            // Double confirmation
            Alert.alert(
              'Ви впевнені?',
              'Натисніть "Так, видалити" щоб остаточно видалити акаунт та всі дані.',
              [
                { text: 'Ні', style: 'cancel' },
                {
                  text: 'Так, видалити',
                  style: 'destructive',
                  onPress: doDeleteAccount,
                },
              ],
            );
          },
        },
      ],
    );
  };

  const doDeleteAccount = async () => {
    if (!userId) return;
    setDeleting(true);
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession?.access_token) {
        Alert.alert('Помилка', 'Сесія закінчилась. Увійдіть знову.');
        setDeleting(false);
        return;
      }

      const resp = await supabase.functions.invoke('delete-account', {
        headers: { Authorization: `Bearer ${currentSession.access_token}` },
      });

      if (resp.error) throw new Error(resp.error.message);

      await supabase.auth.signOut();
    } catch (err: any) {
      Alert.alert('Помилка', err.message || 'Не вдалось видалити акаунт');
    } finally {
      setDeleting(false);
    }
  };

  const initial = profile?.name ? profile.name.charAt(0).toUpperCase() : '?';
  const displayName = [profile?.name, profile?.last_name].filter(Boolean).join(' ') || '—';

  return (
    <SafeAreaView style={s.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {/* ── Header with gradient ── */}
        <LinearGradient
          colors={['#eceef5', COLORS.bg]}
          style={s.headerGradient}
        >
          <Text style={s.title}>Кабінет</Text>
        </LinearGradient>

        {/* ── Profile Card ── */}
        <View style={s.profileCard}>
          {editing ? (
            /* ── Edit mode ── */
            <View>
              <View style={s.editHeader}>
                <Text style={s.editTitle}>Редагування профілю</Text>
              </View>
              <View style={s.editFields}>
                <EditField label="Ім'я *" value={name} onChangeText={setName} placeholder="Ваше ім'я" icon="user" />
                <EditField label="Прізвище *" value={lastName} onChangeText={setLastName} placeholder="Ваше прізвище" icon="user" />
                <EditField label="Назва салону" value={salonName} onChangeText={setSalonName} placeholder="Назва вашого салону" icon="home" />
                <EditField label="Телефон" value={phone} onChangeText={setPhone} placeholder="+380..." keyboardType="phone-pad" icon="phone" />

                {/* Nova Poshta City */}
                <View style={s.editFieldWrap}>
                  <Text style={s.editFieldLabel}>Місто (Нова Пошта)</Text>
                  <View style={s.npInputWrap}>
                    <Feather name="map-pin" size={15} color={COLORS.textTertiary} style={s.editInputIcon} />
                    <TextInput
                      style={[s.editFieldInput, { paddingLeft: 40, paddingRight: 40 }, selectedCity && s.npInputSelected]}
                      value={cityQuery}
                      onChangeText={(text) => {
                        setCityQuery(text);
                        setSelectedCity(null);
                        setSelectedWarehouse(null);
                        setNpWarehouses([]);
                        setWarehouseQuery('');
                        if (cityTimerRef.current) clearTimeout(cityTimerRef.current);
                        if (text.length < 2) { setNpCities([]); return; }
                        cityTimerRef.current = setTimeout(async () => {
                          setLoadingCities(true);
                          try { const result = await searchNPCities(text); setNpCities(result); } catch { setNpCities([]); }
                          setLoadingCities(false);
                        }, 300);
                      }}
                      placeholder="Почніть вводити назву міста"
                      placeholderTextColor={COLORS.textTertiary}
                    />
                    {selectedCity && (
                      <TouchableOpacity style={s.npClearBtn} onPress={() => {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setCityQuery(''); setSelectedCity(null); setNpWarehouses([]); setSelectedWarehouse(null); setWarehouseQuery('');
                      }}>
                        <Ionicons name="close-circle" size={20} color={COLORS.textSecondary} />
                      </TouchableOpacity>
                    )}
                  </View>
                  {loadingCities && <ActivityIndicator style={{ marginTop: 6 }} color={COLORS.brand} />}
                  {npCities.length > 0 && !selectedCity && (
                    <View style={s.npDropdown}>
                      {npCities.map((c) => (
                        <TouchableOpacity key={c.ref} style={s.npDropdownItem} onPress={async () => {
                          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                          setSelectedCity(c); setCityQuery(c.name); setNpCities([]);
                          setSelectedWarehouse(null); setWarehouseQuery('');
                          setLoadingWarehouses(true);
                          try { const wh = await getNPWarehouses(c.ref); LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setNpWarehouses(wh); } catch { setNpWarehouses([]); }
                          setLoadingWarehouses(false);
                        }}>
                          <Text style={s.npDropdownText}>{c.name}</Text>
                          {c.region ? <Text style={s.npDropdownHint}>{c.region}</Text> : null}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                {/* Nova Poshta Warehouse */}
                {selectedCity && (
                  <View style={s.editFieldWrap}>
                    <Text style={s.editFieldLabel}>Відділення Нової Пошти</Text>
                    <View style={s.npInputWrap}>
                      <Feather name="package" size={15} color={COLORS.textTertiary} style={s.editInputIcon} />
                      <TextInput
                        style={[s.editFieldInput, { paddingLeft: 40, paddingRight: 40 }, selectedWarehouse && s.npInputSelected]}
                        value={warehouseQuery}
                        onChangeText={(text) => {
                          setWarehouseQuery(text);
                          if (selectedWarehouse) { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setSelectedWarehouse(null); }
                        }}
                        placeholder="Пошук за номером або адресою"
                        placeholderTextColor={COLORS.textTertiary}
                      />
                      {selectedWarehouse && (
                        <TouchableOpacity style={s.npClearBtn} onPress={() => {
                          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                          setWarehouseQuery(''); setSelectedWarehouse(null);
                        }}>
                          <Ionicons name="close-circle" size={20} color={COLORS.textSecondary} />
                        </TouchableOpacity>
                      )}
                    </View>
                    {loadingWarehouses && <ActivityIndicator style={{ marginTop: 6 }} color={COLORS.brand} />}
                    {!selectedWarehouse && npWarehouses.length > 0 && (
                      <View style={s.npDropdown}>
                        <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                          {(warehouseQuery && !selectedWarehouse
                            ? npWarehouses.filter((w) => w.description.toLowerCase().includes(warehouseQuery.toLowerCase()))
                            : npWarehouses
                          ).map((wh) => (
                            <TouchableOpacity key={wh.ref} style={s.npDropdownItem} onPress={() => {
                              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                              setSelectedWarehouse(wh); setWarehouseQuery(wh.description);
                            }}>
                              <Text style={s.npDropdownText}>{wh.description}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                )}

                <View style={s.editBtns}>
                  <TouchableOpacity
                    style={[s.saveBtn, saving && { opacity: 0.7 }]}
                    onPress={handleSave}
                    activeOpacity={0.85}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Feather name="check" size={16} color="#fff" />
                        <Text style={s.saveBtnText}>Зберегти</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity style={s.cancelBtn} onPress={() => { setEditing(false); if (profile) applyProfile(profile); }} activeOpacity={0.7}>
                    <Text style={s.cancelBtnText}>Скасувати</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : (
            /* ── View mode ── */
            <View>
              <View style={s.profileTop}>
                <LinearGradient colors={[COLORS.brandDark, COLORS.brand]} style={s.avatar}>
                  <Text style={s.avatarText}>{initial}</Text>
                </LinearGradient>
                <View style={s.profileInfo}>
                  <Text style={s.profileName}>{displayName}</Text>
                  {profile?.salon_name ? (
                    <Text style={s.profileSalon}>{profile.salon_name}</Text>
                  ) : null}
                  <TouchableOpacity style={s.roleBadge} onPress={handleToggleRole} activeOpacity={0.7}>
                    <Feather name={ROLE_ICONS[profile?.role ?? 'owner'] as any} size={12} color={COLORS.brand} />
                    <Text style={s.roleText}>{ROLE_LABELS[profile?.role ?? 'owner']}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={s.profileDivider} />

              <View style={s.contactGrid}>
                <ContactItem icon="phone" label="Телефон" value={profile?.phone} />
                <ContactItem icon="map-pin" label="Місто" value={profile?.city} />
                {profile?.warehouse_name && (
                  <ContactItem icon="package" label="Відділення НП" value={profile.warehouse_name} />
                )}
                <ContactItem icon="mail" label="Email" value={userEmail} />
              </View>

              <TouchableOpacity style={s.editProfileBtn} onPress={() => {
                setEditing(true);
                // Load warehouses if city already selected
                if (selectedCity && !npWarehouses.length) {
                  (async () => {
                    setLoadingWarehouses(true);
                    try { const wh = await getNPWarehouses(selectedCity.ref); setNpWarehouses(wh); } catch { setNpWarehouses([]); }
                    setLoadingWarehouses(false);
                  })();
                }
              }} activeOpacity={0.7}>
                <Feather name="edit-2" size={14} color={COLORS.brand} />
                <Text style={s.editProfileBtnText}>Редагувати профіль</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── Orders ── */}
        <SectionHeader title="Мої замовлення" count={orders.length} />
        {loadingOrders ? (
          <View style={s.emptyBlock}>
            <ActivityIndicator color={COLORS.brand} />
          </View>
        ) : orders.length === 0 ? (
          <View style={s.emptyBlock}>
            <Feather name="shopping-bag" size={32} color={COLORS.textTertiary} />
            <Text style={s.emptyTitle}>Замовлень поки немає</Text>
            <Text style={s.emptySubtitle}>Ваші замовлення з магазину з'являться тут</Text>
          </View>
        ) : (
          <View style={s.section}>
            {orders.map((o) => {
              const st = STATUS_LABELS[o.status] ?? STATUS_LABELS.pending;
              const items = o.order_items ?? [];
              const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
              const itemNames = items.slice(0, 2).map((i) => i.product_name);
              const moreCount = items.length - 2;
              return (
                <TouchableOpacity
                  key={o.id}
                  style={s.orderCard}
                  activeOpacity={0.7}
                  onPress={() => router.push(`/order/${o.id}` as any)}
                >
                  {/* Top row: date + status */}
                  <View style={s.orderTopRow}>
                    <View style={s.orderDateRow}>
                      <View style={[s.orderStatusDot, { backgroundColor: st.bg }]}>
                        <Feather name={st.icon as any} size={12} color={st.color} />
                      </View>
                      <Text style={s.orderDate}>{formatOrderDate(o.created_at)}</Text>
                    </View>
                    <View style={[s.orderBadge, { backgroundColor: st.bg }]}>
                      <Text style={[s.orderBadgeText, { color: st.color }]}>{st.label}</Text>
                    </View>
                  </View>

                  {/* Item names */}
                  {itemNames.length > 0 && (
                    <View style={s.orderItemsList}>
                      {itemNames.map((name, idx) => (
                        <Text key={idx} style={s.orderItemName} numberOfLines={1}>
                          {name}
                        </Text>
                      ))}
                      {moreCount > 0 && (
                        <Text style={s.orderMoreItems}>+ ще {moreCount} поз.</Text>
                      )}
                    </View>
                  )}

                  {/* Bottom row: amount + meta */}
                  <View style={s.orderBottomRow}>
                    <Text style={s.orderAmount}>{formatPrice(o.total_amount)}</Text>
                    <View style={s.orderMeta}>
                      {totalItems > 0 && (
                        <View style={s.orderMetaChip}>
                          <Feather name="package" size={11} color={COLORS.textTertiary} />
                          <Text style={s.orderMetaText}>{totalItems} шт</Text>
                        </View>
                      )}
                      {o.np_ttn && (
                        <View style={s.orderMetaChip}>
                          <Feather name="truck" size={11} color={COLORS.textTertiary} />
                          <Text style={s.orderMetaText}>ТТН</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* City + chevron */}
                  {o.city_name && (
                    <View style={s.orderFooter}>
                      <Feather name="map-pin" size={11} color={COLORS.textTertiary} />
                      <Text style={s.orderCity} numberOfLines={1}>{o.city_name}</Text>
                      <Feather name="chevron-right" size={14} color={COLORS.textTertiary} />
                    </View>
                  )}
                  {!o.city_name && (
                    <View style={s.orderFooter}>
                      <View style={{ flex: 1 }} />
                      <Feather name="chevron-right" size={14} color={COLORS.textTertiary} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── Equipment ── */}
        <SectionHeader title="Обладнання" />
        <View style={s.section}>
          <MenuItem
            icon="radiator"
            iconColor="#E65100"
            iconBg="#FFF3E0"
            label="Стерилізатори"
            subtitle="Управління обладнанням"
            onPress={() => router.push('/cabinet/sterilizers' as any)}
          />
          <MenuItem
            icon="scissors-cutting"
            iconColor={COLORS.brand}
            iconBg="#E8EAF6"
            label="Інструменти"
            subtitle="Перелік інструментів"
            onPress={() => router.push('/cabinet/instruments' as any)}
          />
          <MenuItemFeather
            icon="users"
            iconColor="#1B5E20"
            iconBg="#E8F5E9"
            label="Співробітники"
            subtitle="Хто проводить стерилізацію"
            onPress={() => router.push('/cabinet/employees' as any)}
          />
          <MenuItemFeather
            icon="download"
            iconColor="#E65100"
            iconBg="#FFF3E0"
            label="Експорт журналу PDF"
            subtitle="Завантажити журнал стерилізацій"
            onPress={handleExportPDF}
          />
        </View>

        {/* ── Notifications ── */}
        <SectionHeader title="Сповіщення" />
        <View style={s.notifCard}>
          <NotifToggle
            icon="bell"
            label="Завершення циклу"
            sublabel="Повідомлення коли цикл стерилізації завершено"
            value={profile?.notification_cycle_done ?? true}
            onToggle={(v) => handleToggleNotification('notification_cycle_done', v)}
          />
          <View style={s.notifDivider} />
          <NotifToggle
            icon="clock"
            label="Нагадування про цикли"
            sublabel="Якщо давно не було стерилізацій"
            value={profile?.notification_cycle_idle ?? true}
            onToggle={(v) => handleToggleNotification('notification_cycle_idle', v)}
          />
          <View style={s.notifDivider} />
          <NotifToggle
            icon="truck"
            label="Статус замовлення"
            sublabel="Зміна статусу замовлення з магазину"
            value={profile?.notification_order_status ?? true}
            onToggle={(v) => handleToggleNotification('notification_order_status', v)}
          />
        </View>

        {/* ── Sign out ── */}
        <TouchableOpacity style={s.logoutBtn} onPress={handleSignOut} activeOpacity={0.7}>
          <Feather name="log-out" size={16} color={COLORS.danger} />
          <Text style={s.logoutText}>Вийти з акаунту</Text>
        </TouchableOpacity>

        {/* ── Delete account (Apple requirement) ── */}
        <TouchableOpacity
          style={s.deleteBtn}
          onPress={handleDeleteAccount}
          activeOpacity={0.7}
          disabled={deleting}
        >
          {deleting ? (
            <ActivityIndicator color={COLORS.textTertiary} size="small" />
          ) : (
            <>
              <Feather name="trash-2" size={14} color={COLORS.textTertiary} />
              <Text style={s.deleteText}>Видалити акаунт</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={s.versionText}>Dezik v1.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-components ──

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
      {count !== undefined && count > 0 && (
        <View style={s.sectionCountBadge}>
          <Text style={s.sectionCount}>{count}</Text>
        </View>
      )}
    </View>
  );
}

function ContactItem({ icon, label, value }: { icon: string; label: string; value?: string | null }) {
  return (
    <View style={s.contactItem}>
      <View style={s.contactIconWrap}>
        <Feather name={icon as any} size={14} color={COLORS.brand} />
      </View>
      <View style={s.contactTextWrap}>
        <Text style={s.contactLabel}>{label}</Text>
        <Text style={s.contactValue} numberOfLines={1}>{value || '—'}</Text>
      </View>
    </View>
  );
}

function EditField({ label, value, onChangeText, keyboardType, placeholder, icon }: {
  label: string; value: string; onChangeText: (v: string) => void; keyboardType?: any; placeholder?: string; icon?: string;
}) {
  return (
    <View style={s.editFieldWrap}>
      <Text style={s.editFieldLabel}>{label}</Text>
      <View style={s.editInputWrap}>
        {icon && (
          <Feather name={icon as any} size={15} color={COLORS.textTertiary} style={s.editInputIcon} />
        )}
        <TextInput
          style={[s.editFieldInput, icon ? { paddingLeft: 40 } : undefined]}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textTertiary}
        />
      </View>
    </View>
  );
}

function MenuItem({ icon, iconColor, iconBg, label, subtitle, onPress }: {
  icon: string; iconColor: string; iconBg: string; label: string; subtitle?: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.menuItem} onPress={onPress} activeOpacity={0.7}>
      <View style={[s.menuIcon, { backgroundColor: iconBg }]}>
        <MaterialCommunityIcons name={icon as any} size={20} color={iconColor} />
      </View>
      <View style={s.menuTextWrap}>
        <Text style={s.menuLabel}>{label}</Text>
        {subtitle && <Text style={s.menuSubtitle}>{subtitle}</Text>}
      </View>
      <Feather name="chevron-right" size={16} color={COLORS.textTertiary} />
    </TouchableOpacity>
  );
}

function MenuItemFeather({ icon, iconColor, iconBg, label, subtitle, onPress }: {
  icon: string; iconColor: string; iconBg: string; label: string; subtitle?: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.menuItem} onPress={onPress} activeOpacity={0.7}>
      <View style={[s.menuIcon, { backgroundColor: iconBg }]}>
        <Feather name={icon as any} size={20} color={iconColor} />
      </View>
      <View style={s.menuTextWrap}>
        <Text style={s.menuLabel}>{label}</Text>
        {subtitle && <Text style={s.menuSubtitle}>{subtitle}</Text>}
      </View>
      <Feather name="chevron-right" size={16} color={COLORS.textTertiary} />
    </TouchableOpacity>
  );
}

function NotifToggle({ icon, label, sublabel, value, onToggle }: {
  icon: string; label: string; sublabel: string; value: boolean; onToggle: (v: boolean) => void;
}) {
  return (
    <View style={s.notifRow}>
      <View style={s.notifIconWrap}>
        <Feather name={icon as any} size={16} color={COLORS.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.notifLabel}>{label}</Text>
        <Text style={s.notifSub}>{sublabel}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: COLORS.border, true: COLORS.brand }}
        thumbColor="#fff"
      />
    </View>
  );
}

// ── Styles ──

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  // Header
  headerGradient: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 12 },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.text },

  // Profile card
  profileCard: {
    marginHorizontal: 24,
    marginTop: 12,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  profileTop: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 24, fontWeight: '700', color: '#fff' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  profileSalon: { fontSize: 14, color: COLORS.textSecondary, marginTop: 2 },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start', marginTop: 8,
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: COLORS.brandLight,
    borderRadius: RADII.pill,
  },
  roleText: { fontSize: 12, fontWeight: '700', color: COLORS.brand },

  profileDivider: { height: 1, backgroundColor: COLORS.borderLight, marginVertical: 16 },

  // Contact grid
  contactGrid: { gap: 12 },
  contactItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  contactIconWrap: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: COLORS.brandLight,
    alignItems: 'center', justifyContent: 'center',
  },
  contactTextWrap: { flex: 1 },
  contactLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textTertiary, textTransform: 'uppercase', letterSpacing: 0.3 },
  contactValue: { fontSize: 15, fontWeight: '500', color: COLORS.text, marginTop: 1 },

  editProfileBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, alignSelf: 'stretch', marginTop: 16, paddingVertical: 10,
    backgroundColor: COLORS.brandLight, borderRadius: 12,
  },
  editProfileBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.brand },

  // Edit fields
  editHeader: { marginBottom: 16 },
  editTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  editFields: { gap: 12 },
  editFieldWrap: {},
  editFieldLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 6 },
  editInputWrap: { position: 'relative' },
  editInputIcon: { position: 'absolute', left: 14, top: 14, zIndex: 1 },
  editFieldInput: {
    height: 48, borderRadius: 12, borderWidth: 1,
    borderColor: COLORS.border, backgroundColor: COLORS.bg,
    paddingHorizontal: 14, fontSize: 15, color: COLORS.text,
  },
  editBtns: { gap: 8, marginTop: 8 },
  saveBtn: {
    height: 48, borderRadius: 12, backgroundColor: COLORS.brand,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelBtnText: { fontSize: 14, fontWeight: '500', color: COLORS.textSecondary },

  // Section header
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, marginTop: 28, marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  sectionCountBadge: {
    backgroundColor: COLORS.brandLight, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  sectionCount: { fontSize: 12, fontWeight: '700', color: COLORS.brand },

  section: { paddingHorizontal: 24, gap: 8 },

  // Orders
  orderCard: {
    backgroundColor: COLORS.white, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border,
    padding: 16, gap: 10,
  },
  orderTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderDateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orderStatusDot: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  orderDate: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  orderBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADII.pill },
  orderBadgeText: { fontSize: 11, fontWeight: '700' },
  orderItemsList: { gap: 2, paddingLeft: 36 },
  orderItemName: { fontSize: 13, color: COLORS.textSecondary },
  orderMoreItems: { fontSize: 12, color: COLORS.textTertiary, fontStyle: 'italic' },
  orderBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 36 },
  orderAmount: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  orderMeta: { flexDirection: 'row', gap: 8 },
  orderMetaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: COLORS.cardBg, paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 6,
  },
  orderMetaText: { fontSize: 11, color: COLORS.textTertiary, fontWeight: '500' },
  orderFooter: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingTop: 6, borderTopWidth: 1, borderTopColor: COLORS.borderLight,
    paddingLeft: 36,
  },
  orderCity: { fontSize: 12, color: COLORS.textTertiary, flex: 1 },

  // Empty
  emptyBlock: { paddingHorizontal: 24, paddingVertical: 32, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: COLORS.textSecondary },
  emptySubtitle: { fontSize: 13, color: COLORS.textTertiary, textAlign: 'center' },

  // Menu items
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.white, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border,
    padding: 14, gap: 12,
  },
  menuIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  menuTextWrap: { flex: 1 },
  menuLabel: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  menuSubtitle: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },

  // Notifications
  notifCard: {
    marginHorizontal: 24,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 4,
  },
  notifDivider: { height: 1, backgroundColor: COLORS.borderLight, marginHorizontal: 12 },
  notifRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  notifIconWrap: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: COLORS.brandLight,
    alignItems: 'center', justifyContent: 'center',
  },
  notifLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  notifSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },

  // Logout
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, marginTop: 24, marginHorizontal: 24,
    backgroundColor: COLORS.dangerBg, borderRadius: 14,
  },
  logoutText: { fontSize: 14, fontWeight: '600', color: COLORS.danger },

  // Delete account
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, marginTop: 8, marginHorizontal: 24,
  },
  deleteText: { fontSize: 13, color: COLORS.textTertiary },

  // Nova Poshta
  npInputWrap: { position: 'relative' },
  npInputSelected: { borderColor: COLORS.brand, backgroundColor: COLORS.brandLight },
  npClearBtn: { position: 'absolute', right: 12, top: 14, zIndex: 1 },
  npDropdown: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, backgroundColor: COLORS.white, marginTop: 6, overflow: 'hidden' },
  npDropdownItem: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  npDropdownText: { fontSize: 14, color: COLORS.text },
  npDropdownHint: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },

  // Version
  versionText: { textAlign: 'center', fontSize: 12, color: COLORS.textTertiary, marginTop: 16 },
});
