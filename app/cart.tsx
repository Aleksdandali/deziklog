import React, { useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, SafeAreaView, TouchableOpacity,
  TextInput, Alert, Image, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useCart, CartItem } from '../lib/cart-context';
import { useAuth } from './_layout';

const COLORS = {
  bg: '#f5f6fa', white: '#FFFFFF', text: '#1B1B1B', textSecondary: '#6B7280',
  border: '#e2e4ed', brand: '#4b569e', brandDark: '#363f75',
  danger: '#E53935', cardBg: '#eceef5', success: '#43A047',
};

function formatPrice(price: number): string {
  return `${Math.round(price)} ₴`;
}

export default function CartScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const { items, removeItem, updateQuantity, clearCart, total, itemCount } = useCart();

  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [ordering, setOrdering] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);

  const handleOrder = async () => {
    if (!userId) { Alert.alert('Помилка', 'Сесія закінчилась, перезайдіть'); return; }
    if (!address.trim()) { Alert.alert('Увага', 'Введіть адресу доставки'); return; }
    if (!phone.trim()) { Alert.alert('Увага', 'Введіть телефон'); return; }

    setOrdering(true);
    try {
      const { data: order, error } = await supabase
        .from('orders')
        .insert({
          user_id: userId,
          status: 'pending',
          total_amount: total,
          delivery_address: address.trim(),
          phone: phone.trim(),
        })
        .select()
        .single();

      if (error) throw error;

      if (order) {
        const orderItems = items.map((i) => ({
          order_id: order.id,
          product_id: i.product.id,
          quantity: i.quantity,
          price_at_order: i.product.price,
        }));
        const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
        if (itemsError) console.error('Order items error:', itemsError.message);

        clearCart();
        Alert.alert("Замовлення прийнято", "Ми зв'яжемось з вами для підтвердження", [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    } catch (err: any) {
      console.error('Order error:', err.message);
      Alert.alert('Помилка', err.message || 'Не вдалось оформити замовлення');
    } finally {
      setOrdering(false);
    }
  };

  const renderCartItem = ({ item }: { item: CartItem }) => (
    <View style={styles.itemCard}>
      {item.product.image_path ? (
        <Image source={{ uri: item.product.image_path }} style={styles.itemImage} />
      ) : (
        <View style={[styles.itemImage, styles.itemPlaceholder]}>
          <Ionicons name="cube-outline" size={24} color={COLORS.textSecondary} />
        </View>
      )}
      <View style={styles.itemInfo}>
        <Text style={styles.itemName} numberOfLines={2}>{item.product.name}</Text>
        <Text style={styles.itemPrice}>{formatPrice(item.product.price)}</Text>
      </View>
      <View style={styles.itemActions}>
        <View style={styles.qtyRow}>
          <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQuantity(item.product.id, item.quantity - 1)} activeOpacity={0.7}>
            <Feather name="minus" size={14} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.qtyText}>{item.quantity}</Text>
          <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQuantity(item.product.id, item.quantity + 1)} activeOpacity={0.7}>
            <Feather name="plus" size={14} color={COLORS.text} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => removeItem(item.product.id)} hitSlop={8}>
          <Feather name="trash-2" size={15} color={COLORS.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (items.length === 0 && !showCheckout) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Кошик</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="cart-outline" size={48} color={COLORS.textSecondary} />
          </View>
          <Text style={styles.emptyTitle}>Кошик порожній</Text>
          <Text style={styles.emptyText}>Додайте товари з каталогу</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Feather name="shopping-bag" size={16} color={COLORS.brand} />
            <Text style={styles.emptyBtnText}>До каталогу</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Кошик ({itemCount})</Text>
          <TouchableOpacity onPress={() => { clearCart(); setShowCheckout(false); }} hitSlop={8}>
            <Text style={styles.clearText}>Очистити</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={items}
          keyExtractor={(item) => item.product.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
          renderItem={renderCartItem}
          ListFooterComponent={
            showCheckout ? (
              <View style={styles.checkoutForm}>
                <Text style={styles.checkoutTitle}>Оформлення замовлення</Text>
                <View style={styles.inputGroup}>
                  <Feather name="map-pin" size={16} color={COLORS.textSecondary} style={{ marginLeft: 12 }} />
                  <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="Адреса доставки" placeholderTextColor={COLORS.textSecondary} />
                </View>
                <View style={styles.inputGroup}>
                  <Feather name="phone" size={16} color={COLORS.textSecondary} style={{ marginLeft: 12 }} />
                  <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Телефон" placeholderTextColor={COLORS.textSecondary} keyboardType="phone-pad" />
                </View>
              </View>
            ) : null
          }
        />

        <View style={styles.footer}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Разом:</Text>
            <Text style={styles.totalValue}>{formatPrice(total)}</Text>
          </View>
          {showCheckout ? (
            <TouchableOpacity
              style={[styles.orderBtn, ordering && { opacity: 0.6 }]}
              onPress={handleOrder}
              disabled={ordering}
              activeOpacity={0.85}
            >
              <Feather name="check" size={18} color={COLORS.white} />
              <Text style={styles.orderBtnText}>{ordering ? 'Оформлення...' : 'Підтвердити замовлення'}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.checkoutBtn} onPress={() => setShowCheckout(true)} activeOpacity={0.85}>
              <Ionicons name="card-outline" size={18} color={COLORS.white} />
              <Text style={styles.checkoutBtnText}>Оформити замовлення</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  clearText: { fontSize: 13, fontWeight: '600', color: COLORS.danger },

  itemCard: { flexDirection: 'row', backgroundColor: COLORS.white, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 12, marginBottom: 8 },
  itemImage: { width: 64, height: 64, borderRadius: 10, backgroundColor: COLORS.cardBg },
  itemPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  itemInfo: { flex: 1, marginHorizontal: 12, justifyContent: 'center' },
  itemName: { fontSize: 14, fontWeight: '600', color: COLORS.text, lineHeight: 18 },
  itemPrice: { fontSize: 14, fontWeight: '700', color: COLORS.brand, marginTop: 4 },
  itemActions: { alignItems: 'center', justifyContent: 'space-between' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  qtyText: { fontSize: 14, fontWeight: '700', color: COLORS.text, minWidth: 20, textAlign: 'center' },

  footer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.white },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  totalLabel: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  totalValue: { fontSize: 22, fontWeight: '800', color: COLORS.brand },
  checkoutBtn: { flexDirection: 'row', height: 52, borderRadius: 14, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: COLORS.brand, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  checkoutBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.white },
  orderBtn: { flexDirection: 'row', height: 52, borderRadius: 14, backgroundColor: COLORS.success, alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: COLORS.success, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  orderBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.white },

  checkoutForm: { backgroundColor: COLORS.white, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 16, marginTop: 8, gap: 10 },
  checkoutTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  inputGroup: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, backgroundColor: COLORS.bg },
  input: { flex: 1, height: 44, paddingHorizontal: 10, fontSize: 14, color: COLORS.text },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyIcon: { width: 88, height: 88, borderRadius: 44, backgroundColor: COLORS.cardBg, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 20 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: COLORS.brand, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  emptyBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.brand },
});
