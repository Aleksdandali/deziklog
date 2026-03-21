import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView,
  Alert, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { getOrderById } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth-context';
import { useCart } from '../../lib/cart-context';
import { COLORS } from '../../lib/constants';
import { RADII } from '../../lib/theme';
import type { Order, OrderItem, Product } from '../../lib/types';

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending: { label: 'Нове', color: COLORS.warning, bg: COLORS.warningBg, icon: 'clock' },
  confirmed: { label: 'Підтверджено', color: COLORS.success, bg: COLORS.successBg, icon: 'check-circle' },
  canceled: { label: 'Скасовано', color: COLORS.danger, bg: COLORS.dangerBg, icon: 'x-circle' },
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return '--'; }
}

function fmtPrice(n: number): string {
  return n.toLocaleString('uk-UA') + ' ₴';
}

export default function OrderDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { addItem, clearCart } = useCart();
  const userId = session?.user?.id;

  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [productImages, setProductImages] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [reordering, setReordering] = useState(false);

  useEffect(() => {
    if (!id || !userId) return;
    (async () => {
      const result = await getOrderById(id, userId);
      if (result) {
        setOrder(result.order);
        setItems(result.items);
        // Fetch product images
        const productIds = result.items.map((i) => i.product_id);
        if (productIds.length > 0) {
          const { data: products } = await supabase
            .from('products')
            .select('id, image_path')
            .in('id', productIds);
          if (products) {
            const map: Record<string, string | null> = {};
            products.forEach((p: { id: string; image_path: string | null }) => {
              map[p.id] = p.image_path;
            });
            setProductImages(map);
          }
        }
      }
      setLoading(false);
    })();
  }, [id, userId]);

  // Realtime: listen for order status changes
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`order-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` },
        (payload) => {
          const newStatus = payload.new?.status;
          if (newStatus && order && newStatus !== order.status) {
            setOrder((prev) => prev ? { ...prev, status: newStatus } : prev);
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id, order?.status]);

  const handleReorder = async () => {
    if (!items.length) return;
    setReordering(true);
    try {
      const productIds = items.map((i) => i.product_id);
      const { data: products } = await supabase
        .from('products')
        .select('*')
        .in('id', productIds);

      if (!products?.length) {
        Alert.alert('Помилка', 'Товари більше недоступні');
        setReordering(false);
        return;
      }

      const productMap = new Map<string, Product>();
      products.forEach((p: Product) => productMap.set(p.id, p));

      const unavailable: string[] = [];
      const toAdd: { product: Product; qty: number }[] = [];

      for (const item of items) {
        const product = productMap.get(item.product_id);
        if (!product || !product.in_stock) {
          unavailable.push(item.product_name);
        } else {
          toAdd.push({ product, qty: item.quantity });
        }
      }

      if (toAdd.length === 0) {
        Alert.alert('Товари недоступні', 'На жаль, жоден товар з цього замовлення зараз не в наявності');
        setReordering(false);
        return;
      }

      clearCart();
      for (const { product, qty } of toAdd) {
        for (let i = 0; i < qty; i++) {
          addItem(product);
        }
      }

      if (unavailable.length > 0) {
        Alert.alert(
          'Деякі товари недоступні',
          `${unavailable.join(', ')} — зараз немає в наявності. Решту додано в кошик.`,
          [{ text: 'OK', onPress: () => router.push('/cart' as any) }],
        );
      } else {
        router.push('/cart' as any);
      }
    } catch {
      Alert.alert('Помилка', 'Не вдалось повторити замовлення');
    }
    setReordering(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={st.container}>
        <View style={st.center}>
          <ActivityIndicator color={COLORS.brand} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={st.container}>
        <View style={st.center}>
          <Feather name="alert-circle" size={40} color={COLORS.textSecondary} />
          <Text style={st.loadingText}>Замовлення не знайдено</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={st.linkText}>Повернутись</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const status = STATUS_CFG[order.status] ?? STATUS_CFG.pending;
  const totalItems = items.reduce((s, i) => s + i.quantity, 0);
  const deliveryCost = order.np_delivery_cost;

  return (
    <SafeAreaView style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Feather name="chevron-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>Замовлення</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.body}>
        {/* Status banner */}
        <View style={[st.statusBanner, { backgroundColor: status.bg }]}>
          <View style={st.statusBannerLeft}>
            <View style={[st.statusIconWrap, { backgroundColor: status.color + '20' }]}>
              <Feather name={status.icon as any} size={18} color={status.color} />
            </View>
            <View>
              <Text style={[st.statusLabel, { color: status.color }]}>{status.label}</Text>
              <Text style={st.statusDate}>{fmtDate(order.created_at)}</Text>
            </View>
          </View>
          {order.np_ttn && (
            <View style={st.ttnChip}>
              <Feather name="truck" size={12} color={COLORS.brand} />
              <Text style={st.ttnText}>ТТН</Text>
            </View>
          )}
        </View>

        {/* Items */}
        <Text style={st.sectionLabel}>
          Товари · {totalItems} шт
        </Text>
        <View style={st.card}>
          {items.map((item, idx) => {
            const imgUri = productImages[item.product_id];
            return (
              <View key={item.id}>
                {idx > 0 && <View style={st.divider} />}
                <TouchableOpacity
                  style={st.itemRow}
                  activeOpacity={0.7}
                  onPress={() => router.push(`/product/${item.product_id}` as any)}
                >
                  {imgUri ? (
                    <Image
                      source={{ uri: imgUri }}
                      style={st.itemImage}
                      contentFit="contain"
                      cachePolicy="disk"
                      transition={200}
                    />
                  ) : (
                    <View style={[st.itemImage, st.itemImageEmpty]}>
                      <Feather name="package" size={20} color={COLORS.textTertiary} />
                    </View>
                  )}
                  <View style={st.itemInfo}>
                    <Text style={st.itemName} numberOfLines={2}>{item.product_name}</Text>
                    <Text style={st.itemQty}>{item.quantity} шт × {fmtPrice(item.price_at_order)}</Text>
                  </View>
                  <Text style={st.itemTotal}>{fmtPrice(item.quantity * item.price_at_order)}</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {/* Summary */}
        <View style={st.summaryCard}>
          <View style={st.summaryRow}>
            <Text style={st.summaryLabel}>Товари ({totalItems} шт)</Text>
            <Text style={st.summaryValue}>{fmtPrice(order.total_amount - (deliveryCost ?? 0))}</Text>
          </View>
          {deliveryCost != null && deliveryCost > 0 && (
            <View style={st.summaryRow}>
              <Text style={st.summaryLabel}>Доставка</Text>
              <Text style={st.summaryValue}>{fmtPrice(deliveryCost)}</Text>
            </View>
          )}
          <View style={st.summaryDivider} />
          <View style={st.summaryRow}>
            <Text style={st.totalLabel}>Разом</Text>
            <Text style={st.totalValue}>{fmtPrice(order.total_amount)}</Text>
          </View>
        </View>

        {/* Delivery */}
        {(order.city_name || order.warehouse_name || order.delivery_address || order.np_ttn) && (
          <>
            <Text style={st.sectionLabel}>Доставка</Text>
            <View style={st.card}>
              {order.city_name && (
                <InfoRow icon="map-pin" label="Місто" text={order.city_name} />
              )}
              {order.warehouse_name && (
                <InfoRow icon="home" label="Відділення" text={order.warehouse_name} />
              )}
              {!order.city_name && !order.warehouse_name && order.delivery_address && (
                <InfoRow icon="map" label="Адреса" text={order.delivery_address} />
              )}
              {order.np_ttn && (
                <InfoRow icon="truck" label="ТТН" text={order.np_ttn} highlight />
              )}
            </View>
          </>
        )}

        {/* Contact */}
        <Text style={st.sectionLabel}>Контакти</Text>
        <View style={st.card}>
          {(order.first_name || order.last_name) && (
            <InfoRow icon="user" label="Отримувач" text={[order.first_name, order.last_name].filter(Boolean).join(' ')} />
          )}
          <InfoRow icon="phone" label="Телефон" text={order.phone} />
          {order.notes && <InfoRow icon="message-circle" label="Коментар" text={order.notes} />}
        </View>

        {/* Reorder button */}
        <TouchableOpacity
          style={[st.reorderBtn, reordering && { opacity: 0.7 }]}
          activeOpacity={0.85}
          onPress={handleReorder}
          disabled={reordering}
        >
          <LinearGradient
            colors={[COLORS.brand, COLORS.brandDark]}
            style={st.reorderGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            {reordering ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Feather name="refresh-cw" size={16} color="#fff" />
                <Text style={st.reorderText}>Повторити замовлення</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ icon, label, text, highlight }: { icon: string; label: string; text: string; highlight?: boolean }) {
  return (
    <View style={st.infoRow}>
      <View style={st.infoIconWrap}>
        <Feather name={icon as any} size={14} color={highlight ? COLORS.brand : COLORS.textSecondary} />
      </View>
      <View style={st.infoTextWrap}>
        <Text style={st.infoLabel}>{label}</Text>
        <Text style={[st.infoText, highlight && { color: COLORS.brand, fontWeight: '600' }]}>{text}</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8,
    backgroundColor: COLORS.bg,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  body: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 15, color: COLORS.textSecondary },
  linkText: { fontSize: 14, fontWeight: '600', color: COLORS.brand },

  // Status banner
  statusBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 16, padding: 16, marginBottom: 4,
  },
  statusBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  statusLabel: { fontSize: 15, fontWeight: '700' },
  statusDate: { fontSize: 13, color: COLORS.textSecondary, marginTop: 1 },
  ttnChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.brandLight, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8,
  },
  ttnText: { fontSize: 12, fontWeight: '600', color: COLORS.brand },

  // Section
  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: COLORS.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: 20, marginBottom: 10,
  },

  // Card
  card: {
    backgroundColor: COLORS.white, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border,
    padding: 4, overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: COLORS.borderLight, marginHorizontal: 12 },

  // Item row
  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, gap: 12,
  },
  itemImage: {
    width: 56, height: 56, borderRadius: 10,
    backgroundColor: COLORS.cardBg,
  },
  itemImageEmpty: {
    alignItems: 'center', justifyContent: 'center',
  },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: '600', color: COLORS.text, lineHeight: 18 },
  itemQty: { fontSize: 12, color: COLORS.textSecondary, marginTop: 3 },
  itemTotal: { fontSize: 15, fontWeight: '700', color: COLORS.text },

  // Summary
  summaryCard: {
    backgroundColor: COLORS.white, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border,
    padding: 16, marginTop: 12, gap: 8,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 14, color: COLORS.textSecondary },
  summaryValue: { fontSize: 14, fontWeight: '500', color: COLORS.text },
  summaryDivider: { height: 1, backgroundColor: COLORS.borderLight, marginVertical: 4 },
  totalLabel: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  totalValue: { fontSize: 20, fontWeight: '800', color: COLORS.brand },

  // Info rows
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12 },
  infoIconWrap: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: COLORS.cardBg,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  infoTextWrap: { flex: 1 },
  infoLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textTertiary, textTransform: 'uppercase', letterSpacing: 0.3 },
  infoText: { fontSize: 14, color: COLORS.text, marginTop: 2, lineHeight: 19 },

  // Reorder
  reorderBtn: { marginTop: 24 },
  reorderGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 52, borderRadius: 14,
  },
  reorderText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
