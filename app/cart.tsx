import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, FlatList, StyleSheet, SafeAreaView, TouchableOpacity,
  Alert, KeyboardAvoidingView, Platform, ScrollView,
  ActivityIndicator, Animated, LayoutAnimation, UIManager,
} from 'react-native';
import { AppText as Text, AppTextInput as TextInput } from '../components/AppText';
import { useRouter } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { ProductImage } from '../components/ProductImage';
import { useCart, CartItem } from '../lib/cart-context';
import { useAuth, useSessionGuard } from '../lib/auth-context';
import { createOrder, searchNPCities, getNPWarehouses, resolveNPCityByName, getProfile, getProductsStockStatus } from '../lib/api';
import { supabase } from '../lib/supabase';
import { COLORS, FONT, RADIUS, FREE_SHIPPING_THRESHOLD, POST_AUTH_ROUTE_KEY } from '../lib/constants';
import type { NPCity, NPWarehouse, DeliveryType, Profile } from '../lib/types';
import { formatPrice } from '../lib/formatters';

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
  const orderingRef = useRef(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [confirmedTotal, setConfirmedTotal] = useState(0);

  // Nova Poshta state
  const [cityQuery, setCityQuery] = useState('');
  const [cities, setCities] = useState<NPCity[]>([]);
  const [selectedCity, setSelectedCity] = useState<NPCity | null>(null);
  const [loadingCities, setLoadingCities] = useState(false);
  const [cityError, setCityError] = useState<string | null>(null);

  const [warehouseQuery, setWarehouseQuery] = useState('');
  const [warehouses, setWarehouses] = useState<NPWarehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<NPWarehouse | null>(null);
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);
  const [warehouseError, setWarehouseError] = useState<string | null>(null);

  // Buyer + recipient
  const [buyerProfile, setBuyerProfile] = useState<Profile | null>(null);
  const [otherRecipient, setOtherRecipient] = useState(false);
  const [recipientFirstName, setRecipientFirstName] = useState('');
  const [recipientLastName, setRecipientLastName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('+380');

  // Delivery type
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('warehouse');
  const [paymentMethod, setPaymentMethod] = useState<'nalozhka' | 'rozrahunok'>('nalozhka');
  const [addressStreet, setAddressStreet] = useState('');
  const [addressBuilding, setAddressBuilding] = useState('');
  const [addressApartment, setAddressApartment] = useState('');

  const cityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pre-fill from profile
  useEffect(() => {
    if (!session?.user?.id) return;
    (async () => {
      const p = await getProfile(session.user.id);
      if (!p) return;
      setBuyerProfile(p);
      if (p.name) setFirstName(p.name);
      if (p.last_name) setLastName(p.last_name);
      if (p.phone) setPhone(formatPhone(p.phone));
      setDeliveryType(p.delivery_type || 'warehouse');
      if (p.city && p.city_ref) {
        setSelectedCity({ ref: p.city_ref, name: p.city, region: '' });
        setCityQuery(p.city);
      } else if (p.city) {
        // Legacy profile data with city name but no city_ref —
        // resolve the ref via NP search so the warehouse picker isn't gated out.
        setCityQuery(p.city);
        const match = await resolveNPCityByName(p.city);
        if (match) {
          setSelectedCity(match);
          if ((p.delivery_type ?? 'warehouse') === 'warehouse') {
            try {
              const whs = await getNPWarehouses(match.ref);
              setWarehouses(whs);
            } catch {/* ignore — user can re-pick manually */}
          }
        }
      }
      if (p.delivery_type !== 'address' && p.warehouse_ref && p.warehouse_name) {
        setSelectedWarehouse({ ref: p.warehouse_ref, description: p.warehouse_name, number: '' });
        setWarehouseQuery(p.warehouse_name);
      }
      if (p.address_street) setAddressStreet(p.address_street);
      if (p.address_building) setAddressBuilding(p.address_building);
      if (p.address_apartment) setAddressApartment(p.address_apartment);
    })();
  }, [session?.user?.id]);

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
      setCityError(null);
      try {
        const result = await searchNPCities(text);
        setCities(result);
      } catch (err) {
        setCities([]);
        setCityError('Не вдалось завантажити міста. Перевірте інтернет.');
      }
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
    setWarehouseError(null);
    try {
      const result = await getNPWarehouses(city.ref);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setWarehouses(result);
    } catch (err) {
      setWarehouses([]);
      setWarehouseError('Не вдалось завантажити відділення. Перевірте інтернет.');
    }
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

  // App Review 5.1.1(v): guests may browse and fill a local cart, but
  // checkout is an account-based feature — it needs a profile, Nova Poshta
  // lookups and an order row, all auth-gated server-side. The cart lives in
  // AsyncStorage, so nothing is lost across the sign-in.
  const startCheckout = () => {
    if (!session) {
      Alert.alert(
        'Потрібен вхід',
        'Щоб оформити замовлення, увійдіть за номером телефону. Товари в кошику збережуться.',
        [
          { text: 'Скасувати', style: 'cancel' },
          {
            text: 'Увійти',
            onPress: () => {
              // Bring the user back to checkout right after the sign-in
              // (read-and-cleared by the post-auth effect in app/_layout.tsx).
              AsyncStorage.setItem(POST_AUTH_ROUTE_KEY, '/cart').catch(() => {});
              router.push('/auth' as any);
            },
          },
        ],
      );
      return;
    }
    setShowCheckout(true);
  };

  const handleOrder = async () => {
    // Synchronous re-entry guard: `disabled={ordering}` depends on a re-render,
    // so two taps in the same frame both passed it and created duplicate orders.
    if (orderingRef.current) return;
    if (items.length === 0) { Alert.alert('Кошик порожній'); return; }
    if (!firstName.trim()) { Alert.alert("Вкажіть ім'я в профілі"); return; }
    if (!selectedCity) { Alert.alert('Оберіть місто'); return; }
    if (deliveryType === 'warehouse' && !selectedWarehouse) { Alert.alert('Оберіть відділення'); return; }
    if (deliveryType === 'address' && !addressStreet.trim()) { Alert.alert('Вкажіть вулицю'); return; }
    if (otherRecipient) {
      if (!recipientFirstName.trim()) { Alert.alert("Вкажіть ім'я отримувача"); return; }
      if (!isPhoneValid(recipientPhone)) { Alert.alert('Невірний телефон отримувача'); return; }
    }

    const rFirstName = otherRecipient ? recipientFirstName.trim() : firstName.trim();
    const rLastName = otherRecipient ? recipientLastName.trim() : lastName.trim();
    const rPhone = otherRecipient ? phoneToDigits(recipientPhone) : phoneToDigits(phone);

    const deliveryAddr = deliveryType === 'warehouse'
      ? `${selectedCity.name}, ${selectedWarehouse!.description}`
      : `${selectedCity.name}, ${addressStreet.trim()} ${addressBuilding.trim()}${addressApartment.trim() ? ', кв. ' + addressApartment.trim() : ''}`;

    orderingRef.current = true;
    setOrdering(true);
    try {
      const uid = await getUid();
      if (!uid) {
        Alert.alert('Сесія закінчилась', 'Потрібно увійти знову.', [
          { text: 'Скасувати', style: 'cancel' },
          { text: 'Увійти', onPress: () => { supabase.auth.signOut(); } },
        ]);
        return;
      }

      // ── Pre-flight stock check ──
      // The DB trigger `enforce_order_item_price` rejects out-of-stock or
      // deleted products with a generic PostgrestError. Catalog filters
      // `in_stock=true`, but locally-persisted cart items can drift after a
      // product is taken out of stock or discontinued. We surface a clear
      // Ukrainian message and offer to drop the offending items, instead of
      // failing the whole checkout with an opaque error.
      const cartIds = items.map((i) => i.product.id);
      const live = await getProductsStockStatus(cartIds);
      const liveById = new Map(live.map((p) => [p.id, p]));
      const unavailable = items.filter((i) => {
        const p = liveById.get(i.product.id);
        return !p || p.in_stock !== true;
      });
      if (unavailable.length > 0) {
        const names = unavailable.map((i) => `• ${i.product.name}`).join('\n');
        const removeUnavailable = () => {
          unavailable.forEach((i) => removeItem(i.product.id));
        };
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        if (unavailable.length === items.length) {
          Alert.alert(
            'Товари більше не доступні',
            `Жоден з товарів у кошику більше не доступний:\n\n${names}`,
            [{ text: 'Очистити кошик', style: 'destructive', onPress: removeUnavailable }],
          );
        } else {
          Alert.alert(
            'Деякі товари недоступні',
            `Ці позиції більше не доступні і будуть видалені з кошика:\n\n${names}\n\nОформити замовлення без них?`,
            [
              { text: 'Скасувати', style: 'cancel' },
              { text: 'Видалити та продовжити', onPress: removeUnavailable },
            ],
          );
        }
        return;
      }

      // price_at_order / product_name / total_amount are filled by DB triggers
      // (see lib/api.ts createOrder for the rationale).
      await createOrder(uid, {
        delivery_address: deliveryAddr,
        delivery_type: deliveryType,
        phone: phoneToDigits(phone),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        recipient_first_name: rFirstName,
        recipient_last_name: rLastName,
        recipient_phone: rPhone,
        city_ref: selectedCity.ref,
        city_name: selectedCity.name,
        warehouse_ref: deliveryType === 'warehouse' ? selectedWarehouse?.ref : undefined,
        warehouse_name: deliveryType === 'warehouse' ? selectedWarehouse?.description : undefined,
        address_street: deliveryType === 'address' ? addressStreet.trim() : undefined,
        address_building: deliveryType === 'address' ? addressBuilding.trim() : undefined,
        address_apartment: deliveryType === 'address' ? addressApartment.trim() : undefined,
        payment_method: paymentMethod,
      }, items.map((i) => ({
        product_id: i.product.id,
        quantity: i.quantity,
      })));

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setConfirmedTotal(total);
      clearCart();
      setOrderSuccess(true);
    } catch (err: unknown) {
      // Supabase PostgrestError is a plain object, not an Error instance, so
      // `err instanceof Error` is false and `err.message` was previously
      // swallowed. Extract message defensively from any shape we might get.
      console.warn('[cart] order failed:', err);
      const errObj = (err && typeof err === 'object') ? (err as Record<string, unknown>) : {};
      const rawMsg = typeof errObj.message === 'string' ? errObj.message : '';
      const rawDetails = typeof errObj.details === 'string' ? errObj.details : '';
      const combined = `${rawMsg} ${rawDetails}`.trim();

      // The trigger raises "Product <UUID> does not exist" with the actual
      // UUID, OR an FK violation has details like "Key (product_id)=(<uuid>)…".
      // Extract any UUID we can find so we know which cart line is bad and
      // can auto-prune it instead of asking the user to nuke the whole cart.
      const uuidMatch = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(combined);
      const badId = uuidMatch?.[0];
      const badItem = badId ? items.find((i) => i.product.id.toLowerCase() === badId.toLowerCase()) : undefined;

      const oosMatch = /Product "(.+?)" is out of stock/i.exec(rawMsg);
      const isMissing = /does not exist|not present in table|foreign key/i.test(combined);
      const isBadQty = /Quantity must be/i.test(rawMsg);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      if (oosMatch) {
        Alert.alert('Помилка', `Товар "${oosMatch[1]}" більше не в наявності. Видаліть його з кошика.`);
      } else if (isMissing && badItem) {
        // Surgical removal: drop only the offending item and offer retry.
        Alert.alert(
          'Товар більше не доступний',
          `"${badItem.product.name}" видалено з каталогу. Видалити його з кошика і спробувати знову?`,
          [
            { text: 'Скасувати', style: 'cancel' },
            // Just drop the item — user re-taps "Замовити" so the next call sees
          // fresh `items` instead of relying on a stale-closure setTimeout retry.
          { text: 'Видалити з кошика', onPress: () => removeItem(badItem.product.id) },
          ],
        );
      } else if (isMissing) {
        // Couldn't parse the UUID — fall back to clearing the cart, but
        // also dump the raw msg so we can debug if user screenshots it.
        Alert.alert(
          'Помилка',
          `Деяких товарів у кошику більше не існує.\n\n${combined.slice(0, 200)}`,
          [
            { text: 'Скасувати', style: 'cancel' },
            { text: 'Очистити кошик', style: 'destructive', onPress: () => { clearCart(); setShowCheckout(false); } },
          ],
        );
      } else if (isBadQty) {
        Alert.alert('Помилка', 'Невірна кількість товару.');
      } else {
        // Unknown error — show raw payload so we have something to debug.
        const parts: string[] = [];
        if (rawMsg) parts.push(rawMsg);
        if (typeof errObj.code === 'string' || typeof errObj.code === 'number') parts.push(`code: ${errObj.code}`);
        if (rawDetails) parts.push(`details: ${rawDetails}`);
        if (typeof errObj.hint === 'string' && errObj.hint) parts.push(`hint: ${errObj.hint}`);
        if (parts.length === 0) {
          try { parts.push(JSON.stringify(err)?.slice(0, 400) || String(err)); } catch { parts.push(String(err)); }
        }
        Alert.alert('Помилка', `Не вдалось оформити замовлення.\n\n${parts.join('\n')}`);
      }
    } finally {
      orderingRef.current = false;
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
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <View style={s.headerRow}>
            <TouchableOpacity onPress={() => setShowCheckout(false)} style={s.backBtn}>
              <Ionicons name="arrow-back" size={22} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={s.headerTitle}>Оформлення</Text>
            <View style={{ width: 36 }} />
          </View>

          <ScrollView
            style={s.checkoutBody}
            contentContainerStyle={{ paddingBottom: 200 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            {/* Buyer (read-only from profile) */}
            <Text style={s.sectionLabel}>Покупець</Text>
            <View style={s.buyerCard}>
              <View style={{ flex: 1 }}>
                <Text style={s.buyerName}>{firstName} {lastName}</Text>
                <Text style={s.buyerPhone}>{phone}</Text>
              </View>
              <TouchableOpacity onPress={() => { router.push('/(tabs)/profile' as any); }} hitSlop={12}>
                <Text style={s.buyerEditLink}>Змінити</Text>
              </TouchableOpacity>
            </View>

            {/* Recipient */}
            <Text style={s.sectionLabel}>Отримувач</Text>
            <View style={s.toggleRow}>
              <TouchableOpacity
                style={[s.toggleChip, !otherRecipient && s.toggleChipActive]}
                onPress={() => setOtherRecipient(false)}
                activeOpacity={0.8}
              >
                <Text style={[s.toggleChipText, !otherRecipient && s.toggleChipTextActive]}>Я ({firstName || 'покупець'})</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.toggleChip, otherRecipient && s.toggleChipActive]}
                onPress={() => setOtherRecipient(true)}
                activeOpacity={0.8}
              >
                <Text style={[s.toggleChipText, otherRecipient && s.toggleChipTextActive]}>Інший отримувач</Text>
              </TouchableOpacity>
            </View>

            {otherRecipient && (
              <>
                <Text style={s.fieldLabel}>Ім'я отримувача *</Text>
                <TextInput style={s.input} value={recipientFirstName} onChangeText={setRecipientFirstName} placeholder="Ім'я" placeholderTextColor="#A0A4B8" maxLength={50} />

                <Text style={s.fieldLabel}>Прізвище отримувача</Text>
                <TextInput style={s.input} value={recipientLastName} onChangeText={setRecipientLastName} placeholder="Прізвище" placeholderTextColor="#A0A4B8" maxLength={50} />

                <Text style={s.fieldLabel}>Телефон отримувача *</Text>
                <TextInput
                  style={s.input}
                  value={recipientPhone}
                  onChangeText={(t) => setRecipientPhone(formatPhone(t))}
                  placeholder="+380 XX XXX XX XX"
                  keyboardType="phone-pad"
                  placeholderTextColor="#A0A4B8"
                  maxLength={17}
                />
              </>
            )}

            {/* Delivery */}
            <Text style={s.sectionLabel}>Доставка</Text>
            <View style={s.toggleRow}>
              <TouchableOpacity
                style={[s.toggleChip, deliveryType === 'warehouse' && s.toggleChipActive]}
                onPress={() => { Haptics.selectionAsync(); LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setDeliveryType('warehouse'); }}
                activeOpacity={0.8}
              >
                <Feather name="package" size={14} color={deliveryType === 'warehouse' ? '#fff' : COLORS.textSecondary} />
                <Text style={[s.toggleChipText, deliveryType === 'warehouse' && s.toggleChipTextActive]}>На відділення</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.toggleChip, deliveryType === 'address' && s.toggleChipActive]}
                onPress={() => { Haptics.selectionAsync(); LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setDeliveryType('address'); }}
                activeOpacity={0.8}
              >
                <Feather name="home" size={14} color={deliveryType === 'address' ? '#fff' : COLORS.textSecondary} />
                <Text style={[s.toggleChipText, deliveryType === 'address' && s.toggleChipTextActive]}>За адресою</Text>
              </TouchableOpacity>
            </View>

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
            {cityError && !loadingCities && (
              <Text style={s.npErrorText}>{cityError}</Text>
            )}
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

            {deliveryType === 'warehouse' && selectedCity && (
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
                {warehouseError && !loadingWarehouses && (
                  <Text style={s.npErrorText}>{warehouseError}</Text>
                )}
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

            {deliveryType === 'address' && selectedCity && (
              <>
                <Text style={s.fieldLabel}>Вулиця *</Text>
                <TextInput style={s.input} value={addressStreet} onChangeText={setAddressStreet} placeholder="Назва вулиці" placeholderTextColor="#A0A4B8" maxLength={100} />

                <View style={s.addressRow}>
                  <View style={s.addressFieldWide}>
                    <Text style={s.fieldLabel}>Будинок</Text>
                    <TextInput style={s.input} value={addressBuilding} onChangeText={setAddressBuilding} placeholder="№" placeholderTextColor="#A0A4B8" maxLength={20} />
                  </View>
                  <View style={s.addressFieldNarrow}>
                    <Text style={s.fieldLabel}>Квартира</Text>
                    <TextInput style={s.input} value={addressApartment} onChangeText={setAddressApartment} placeholder="кв." placeholderTextColor="#A0A4B8" maxLength={10} />
                  </View>
                </View>
              </>
            )}

            {/* Payment method */}
            <Text style={[s.sectionLabel, { marginTop: 8 }]}>Оплата</Text>
            <View style={s.toggleRow}>
              <TouchableOpacity
                style={[s.toggleChip, s.payChip, paymentMethod === 'nalozhka' && s.toggleChipActive]}
                onPress={() => { Haptics.selectionAsync(); setPaymentMethod('nalozhka'); }}
                activeOpacity={0.8}
              >
                <Text style={[s.toggleChipText, s.payChipText, paymentMethod === 'nalozhka' && s.toggleChipTextActive]} numberOfLines={2}>Накладений платіж</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.toggleChip, s.payChip, paymentMethod === 'rozrahunok' && s.toggleChipActive]}
                onPress={() => { Haptics.selectionAsync(); setPaymentMethod('rozrahunok'); }}
                activeOpacity={0.8}
              >
                <Text style={[s.toggleChipText, s.payChipText, paymentMethod === 'rozrahunok' && s.toggleChipTextActive]} numberOfLines={2}>Розрахунковий рахунок</Text>
              </TouchableOpacity>
            </View>

            {/* Order summary */}
            <View style={s.orderSummary}>
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Товарів</Text>
                <Text style={s.summaryValue}>{itemCount}</Text>
              </View>
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Доставка</Text>
                <Text style={[s.summaryValue, total >= FREE_SHIPPING_THRESHOLD && { color: COLORS.success }]}>
                  {total >= FREE_SHIPPING_THRESHOLD ? 'Безкоштовно' : 'За тарифами НП'}
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
            <ProductImage
              uri={item.product.image_path}
              style={s.itemImage}
              placeholderStyle={s.itemImageEmpty}
              iconSize={20}
              iconColor={COLORS.textSecondary}
            />
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
        {total >= FREE_SHIPPING_THRESHOLD && (
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
        <TouchableOpacity style={s.checkoutBtn} onPress={startCheckout} activeOpacity={0.9}>
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

  // Buyer card
  buyerCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg, borderRadius: 12, padding: 14, marginBottom: 4 },
  buyerName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  buyerPhone: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  buyerEditLink: { fontSize: 13, fontWeight: '600', color: COLORS.brand },

  // Toggle chips
  toggleRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  toggleChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.bg },
  toggleChipActive: { borderColor: COLORS.brand, backgroundColor: COLORS.brand },
  toggleChipText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  toggleChipTextActive: { color: '#fff' },
  payChip: { minHeight: 50, paddingHorizontal: 8 },
  payChipText: { textAlign: 'center', lineHeight: 17 },

  // Address fields
  addressRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  addressFieldWide: { flex: 2 },
  addressFieldNarrow: { flex: 1 },

  // NP Dropdown
  dropdown: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, backgroundColor: COLORS.surface, marginTop: 6, marginBottom: 8, overflow: 'hidden' },
  dropdownItem: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  dropdownText: { fontSize: 14, color: COLORS.text },
  dropdownHint: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  dropdownLoader: { marginTop: 8, marginBottom: 4 },
  npErrorText: { fontSize: 13, color: COLORS.danger, marginTop: 8, marginBottom: 4, lineHeight: 18 },

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
