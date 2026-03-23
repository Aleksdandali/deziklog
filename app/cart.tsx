import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, FlatList, StyleSheet, SafeAreaView, TouchableOpacity,
  TextInput, Alert, KeyboardAvoidingView, Platform, ScrollView,
  ActivityIndicator, Animated, LayoutAnimation, UIManager,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { Image } from 'expo-image';
import { useCart, CartItem } from '../lib/cart-context';
import { useAuth, useSessionGuard } from '../lib/auth-context';
import { createOrder, searchNPCities, getNPWarehouses } from '../lib/api';
import { COLORS, FONT, RADIUS } from '../lib/constants';
import type { NPCity, NPWarehouse } from '../lib/types';

function formatPrice(price: number): string {
  return price.toLocaleString('uk-UA') + ' ₴';
}

/** Format raw digits to +380 XX XXX XX XX */
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  // Strip leading +380 or 380 or 0 to normalize
  let d = digits;
  if (d.startsWith('380')) d = d.slice(3);
  else if (d.startsWith('0')) d = d.slice(1);
  // Limit to 9 digits after country code
  d = d.slice(0, 9);

  let result = '+380';
  if (d.length > 0) result += ' ' + d.slice(0, 2);
  if (d.length > 2) result += ' ' + d.slice(2, 5);
  if (d.length > 5) result += ' ' + d.slice(5, 7);
  if (d.length > 7) result += ' ' + d.slice(7, 9);
  return result;
}

/** Extract raw digits (380XXXXXXXXX) from formatted phone */
function phoneToDigits(formatted: string): string {
  return formatted.replace(/\D/g, '');
}

function isPhoneValid(formatted: string): boolean {
  return phoneToDigits(formatted).length === 12; // 380 + 9 digits
}

export default function CartScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const getUid = useSessionGuard();
  const { items, removeItem, updateQuantity, clearCart, total, itemCount } = useCart();

  const [showCheckout, setShowCheckout] = useState(false);
  const [phone, setPhone] = useState('+380');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [ordering, setOrdering] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [confirmedTotal, setConfirmedTotal] = useState(0);

  // Nova Poshta state
  const [cityQuery, setCityQuery] = useState('');
  const [cities, setCities] = useState<NPCity[]>([]);
  const [selectedCity, setSelectedCity] = useState<NPCity | null>(null);
  const [loadingCities, setLoadingCities] = useState(false);

  const [warehouseQuery, setWarehouseQuery] = useState('');
  const [warehouses, setWarehouses] = useState<NPWarehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<NPWarehouse | null>(null);
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);

  const cityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePhoneChange = useCallback((text: string) => {
    setPhone(formatPhone(text));
  }, []);

  const handleCitySearch = useCallback((text: string) => {
    setCityQuery(text);
    setSelectedCity(null);
    setSelectedWarehouse(null);
    setWarehouses([]);
    setWarehouseQuery('');

    if (cityTimerRef.current) clearTimeout(cityTimerRef.current);
    if (text.length < 2) { setCities([]); return; }

    cityTimerRef.current = setTimeout(async () => {
      setLoadingCities(true);
      try {
        const result = await searchNPCities(text);
        setCities(result);
      } catch { setCities([]); }
      setLoadingCities(false);
    }, 300);
  }, []);

  const handleSelectCity = useCallback(async (city: NPCity) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedCity(city);
    setCityQuery(city.name);
    setCities([]);
    setSelectedWarehouse(null);
    setWarehouseQuery('');
    setLoadingWarehouses(true);
    try {
      const result = await getNPWarehouses(city.ref);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setWarehouses(result);
    } catch { setWarehouses([]); }
    setLoadingWarehouses(false);
  }, []);

  const handleSelectWarehouse = useCallback((wh: NPWarehouse) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedWarehouse(wh);
    setWarehouseQuery(wh.description);
  }, []);

  const filteredWarehouses = warehouseQuery && !selectedWarehouse
    ? warehouses.filter((w) => w.description.toLowerCase().includes(warehouseQuery.toLowerCase()))
    : warehouses;

  const handleOrder = async () => {
    if (!isPhoneValid(phone)) { Alert.alert('Невірний телефон', 'Введіть 9 цифр після +380'); return; }
    if (!firstName.trim()) { Alert.alert("Вкажіть ім'я"); return; }
    if (!lastName.trim()) { Alert.alert('Вкажіть прізвище'); return; }
    if (!selectedCity) { Alert.alert('Оберіть місто'); return; }
    if (!selectedWarehouse) { Alert.alert('Оберіть відділення'); return; }

    setOrdering(true);
    try {
      const uid = await getUid();
      if (!uid) { Alert.alert('Сесія закінчилась', 'Потрібно увійти знову.'); return; }

      await createOrder(uid, {
        total_amount: total,
        delivery_address: `${selectedCity.name}, ${selectedWarehouse.description}`,
        phone: phoneToDigits(phone),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        city_ref: selectedCity.ref,
        city_name: selectedCity.name,
        warehouse_ref: selectedWarehouse.ref,
        warehouse_name: selectedWarehouse.description,
      }, items.map((i) => ({
        product_id: i.product.id,
        product_name: i.product.name,
        quantity: i.quantity,
        price_at_order: i.product.price,
      })));

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setConfirmedTotal(total);
      clearCart();
      setOrderSuccess(true);
    } catch (err: any) {
      Alert.alert('Помилка', err.message || 'Не вдалось оформити замовлення');
    } finally {
      setOrdering(false);
    }
  };

  // ── Success ──
  if (orderSuccess) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.successWrap}>
          <View style={s.successIcon}>
            <Ionicons name="checkmark-circle" size={64} color="#43A047" />
          </View>
          <Text style={s.successTitle}>Замовлення оформлено!</Text>
          <Text style={s.successText}>Ми зв'яжемось з вами для підтвердження</Text>
          <Text style={s.successTotal}>Сума: {formatPrice(confirmedTotal)}</Text>
          <TouchableOpacity style={s.successBtn} onPress={() => router.replace('/(tabs)/catalog')} activeOpacity={0.9}>
            <Text style={s.successBtnText}>Продовжити покупки</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Empty ──
  if (items.length === 0 && !showCheckout) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Кошик</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={s.emptyWrap}>
          <Ionicons name="cart-outline" size={56} color={COLORS.textSecondary} />
          <Text style={s.emptyTitle}>Кошик порожній</Text>
          <Text style={s.emptyText}>Додайте товари з каталогу</Text>
          <TouchableOpacity style={s.emptyBtn} onPress={() => router.back()} activeOpacity={0.85}>
            <Text style={s.emptyBtnText}>До каталогу</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Checkout form ──
  if (showCheckout) {
    return (
      <SafeAreaView style={s.container}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.headerRow}>
            <TouchableOpacity onPress={() => setShowCheckout(false)} style={s.backBtn}>
              <Ionicons name="arrow-back" size={22} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={s.headerTitle}>Оформлення</Text>
            <View style={{ width: 36 }} />
          </View>

          <ScrollView
            style={s.checkoutBody}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Contact info */}
            <Text style={s.sectionLabel}>Контактна інформація</Text>

            <Text style={s.fieldLabel}>Телефон *</Text>
            <TextInput
              style={s.input}
              value={phone}
              onChangeText={handlePhoneChange}
              placeholder="+380 XX XXX XX XX"
              keyboardType="phone-pad"
              placeholderTextColor="#A0A4B8"
              maxLength={17}
            />

            <Text style={s.fieldLabel}>Ім'я *</Text>
            <TextInput style={s.input} value={firstName} onChangeText={setFirstName} placeholder="Ваше ім'я" placeholderTextColor="#A0A4B8" maxLength={50} />

            <Text style={s.fieldLabel}>Прізвище *</Text>
            <TextInput style={s.input} value={lastName} onChangeText={setLastName} placeholder="Ваше прізвище" placeholderTextColor="#A0A4B8" maxLength={50} />

            {/* Nova Poshta */}
            <Text style={s.sectionLabel}>Доставка Нова Пошта</Text>

            <Text style={s.fieldLabel}>Місто *</Text>
            <View style={s.inputWrap}>
              <TextInput
                style={[s.input, selectedCity && s.inputSelected]}
                value={cityQuery}
                onChangeText={handleCitySearch}
                placeholder="Почніть вводити назву"
                placeholderTextColor="#A0A4B8"
              />
              {selectedCity && (
                <TouchableOpacity style={s.clearField} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCityQuery(''); setSelectedCity(null); setWarehouses([]); setSelectedWarehouse(null); setWarehouseQuery(''); }}>
                  <Ionicons name="close-circle" size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            {loadingCities && <ActivityIndicator style={s.dropdownLoader} color={COLORS.brand} />}
            {cities.length > 0 && !selectedCity && (
              <View style={s.dropdown}>
                {cities.map((city) => (
                  <TouchableOpacity key={city.ref} style={s.dropdownItem} onPress={() => handleSelectCity(city)}>
                    <Text style={s.dropdownText}>{city.name}</Text>
                    {city.region ? <Text style={s.dropdownHint}>{city.region}</Text> : null}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {selectedCity && (
              <>
                <Text style={s.fieldLabel}>Відділення *</Text>
                <View style={s.inputWrap}>
                  <TextInput
                    style={[s.input, selectedWarehouse && s.inputSelected]}
                    value={warehouseQuery}
                    onChangeText={(text) => {
                      setWarehouseQuery(text);
                      if (selectedWarehouse) { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setSelectedWarehouse(null); }
                    }}
                    placeholder="Пошук за номером або адресою"
                    placeholderTextColor="#A0A4B8"
                  />
                  {selectedWarehouse && (
                    <TouchableOpacity style={s.clearField} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setWarehouseQuery(''); setSelectedWarehouse(null); }}>
                      <Ionicons name="close-circle" size={20} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  )}
                </View>
                {loadingWarehouses && <ActivityIndicator style={s.dropdownLoader} color={COLORS.brand} />}
                {!selectedWarehouse && filteredWarehouses.length > 0 && (
                  <View style={s.dropdown}>
                    <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                      {filteredWarehouses.map((wh) => (
                        <TouchableOpacity key={wh.ref} style={s.dropdownItem} onPress={() => handleSelectWarehouse(wh)}>
                          <Text style={[s.dropdownText, { flex: 1 }]}>{wh.description}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </>
            )}

            {/* Order summary */}
            <View style={s.orderSummary}>
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Товарів</Text>
                <Text style={s.summaryValue}>{itemCount}</Text>
              </View>
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Доставка</Text>
                <Text style={[s.summaryValue, total >= 2000 && { color: COLORS.success }]}>
                  {total >= 2000 ? 'Безкоштовно' : 'За тарифами НП'}
                </Text>
              </View>
              <View style={[s.summaryRow, { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 12, marginTop: 4 }]}>
                <Text style={s.summaryTotal}>Сума</Text>
                <Text style={s.summaryTotalPrice}>{formatPrice(total)}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[s.orderBtn, ordering && { opacity: 0.6 }]}
              onPress={handleOrder}
              disabled={ordering}
              activeOpacity={0.9}
            >
              <Text style={s.orderBtnText}>{ordering ? 'Оформлення...' : 'Підтвердити замовлення'}</Text>
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Cart items ──
  return (
    <SafeAreaView style={s.container}>
      <View style={s.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Кошик</Text>
        <View style={{ width: 36 }} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.product.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 16 }}
        renderItem={({ item }: { item: CartItem }) => (
          <View style={s.itemCard}>
            {item.product.image_path ? (
              <Image source={{ uri: item.product.image_path }} style={s.itemImage} contentFit="contain" cachePolicy="disk" />
            ) : (
              <View style={[s.itemImage, s.itemImageEmpty]}>
                <Feather name="package" size={20} color={COLORS.textSecondary} />
              </View>
            )}
            <View style={s.itemBody}>
              <Text style={s.itemName} numberOfLines={2}>{item.product.name}</Text>
              <Text style={s.itemPrice}>{formatPrice(item.product.price)}</Text>
              <View style={s.itemQtyRow}>
                <TouchableOpacity style={s.itemQtyBtn} onPress={() => updateQuantity(item.product.id, item.quantity - 1)}>
                  <Feather name="minus" size={16} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={s.itemQtyText}>{item.quantity}</Text>
                <TouchableOpacity style={s.itemQtyBtn} onPress={() => updateQuantity(item.product.id, item.quantity + 1)}>
                  <Feather name="plus" size={16} color={COLORS.text} />
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity onPress={() => removeItem(item.product.id)} hitSlop={12} style={s.itemDelete}>
              <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
            </TouchableOpacity>
          </View>
        )}
      />

      {/* Bottom */}
      <View style={s.cartFooter}>
        {total >= 2000 && (
          <View style={s.freeShipping}>
            <Text style={s.freeShippingText}>Безкоштовна доставка!</Text>
          </View>
        )}
        <View style={s.totalRow}>
          <Text style={s.totalLabel}>Кількість товарів</Text>
          <Text style={s.totalValue}>{itemCount} товарів</Text>
        </View>
        <View style={s.totalRow}>
          <Text style={s.sumLabel}>Сума</Text>
          <Text style={s.sumValue}>{formatPrice(total)}</Text>
        </View>
        <TouchableOpacity style={s.checkoutBtn} onPress={() => setShowCheckout(true)} activeOpacity={0.9}>
          <Text style={s.checkoutBtnText}>Оформити замовлення</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontFamily: FONT.semibold, color: COLORS.text },
  stepText: { fontSize: 14, color: COLORS.textSecondary },

  // Items
  itemCard: { flexDirection: 'row', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  itemImage: { width: 80, height: 80, borderRadius: 10, backgroundColor: COLORS.bg },
  itemImageEmpty: { alignItems: 'center', justifyContent: 'center' },
  itemBody: { flex: 1, marginLeft: 14 },
  itemName: { fontSize: 14, fontWeight: '500', color: COLORS.text, lineHeight: 18 },
  itemPrice: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginTop: 4 },
  itemQtyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  itemQtyBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  itemQtyText: { fontSize: 15, fontWeight: '700', color: COLORS.text, minWidth: 20, textAlign: 'center' },
  itemDelete: { justifyContent: 'center', paddingLeft: 12 },

  // Footer
  cartFooter: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 30, borderTopWidth: 1, borderTopColor: COLORS.border },
  freeShipping: { marginBottom: 12 },
  freeShippingText: { fontSize: 14, fontWeight: '600', color: COLORS.success },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  totalLabel: { fontSize: 14, color: COLORS.textSecondary },
  totalValue: { fontSize: 14, fontWeight: '500', color: COLORS.text },
  sumLabel: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  sumValue: { fontSize: 20, fontWeight: '700', color: COLORS.success },
  checkoutBtn: { height: 54, borderRadius: 14, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  checkoutBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // Checkout
  checkoutBody: { flex: 1, paddingHorizontal: 24, paddingTop: 4 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 24, marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '500', color: COLORS.textSecondary, marginBottom: 6, marginTop: 14 },
  inputWrap: { position: 'relative' },
  input: { height: 52, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 16, paddingRight: 44, fontSize: 16, color: COLORS.text, backgroundColor: COLORS.bg },
  inputSelected: { borderColor: COLORS.brand, backgroundColor: COLORS.brandLight },
  clearField: { position: 'absolute', right: 14, top: 16 },
  orderBtn: { height: 56, borderRadius: 14, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center' },
  orderBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // Order summary
  orderSummary: { backgroundColor: COLORS.bg, borderRadius: 14, padding: 16, marginTop: 24, marginBottom: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  summaryLabel: { fontSize: 14, color: COLORS.textSecondary },
  summaryValue: { fontSize: 14, fontWeight: '500', color: COLORS.text },
  summaryTotal: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  summaryTotalPrice: { fontSize: 18, fontWeight: '800', color: COLORS.success },

  // NP Dropdown
  dropdown: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, backgroundColor: COLORS.surface, marginTop: 6, marginBottom: 8, overflow: 'hidden' },
  dropdownItem: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  dropdownText: { fontSize: 14, color: COLORS.text },
  dropdownHint: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  dropdownLoader: { marginTop: 8, marginBottom: 4 },

  // Empty
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text, marginTop: 16 },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, marginTop: 6, marginBottom: 24 },
  emptyBtn: { height: 48, paddingHorizontal: 32, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.brand, alignItems: 'center', justifyContent: 'center' },
  emptyBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.brand },

  // Success
  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  successIcon: { marginBottom: 16 },
  successTitle: { fontSize: 24, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  successText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 12 },
  successTotal: { fontSize: 18, fontWeight: '700', color: COLORS.success, marginBottom: 32 },
  successBtn: { width: '100%', height: 54, borderRadius: 14, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center' },
  successBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
