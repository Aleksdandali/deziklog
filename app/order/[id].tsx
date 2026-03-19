import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { getOrderById } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { COLORS } from '../../lib/constants';
import { RADII } from '../../lib/theme';
import type { Order, OrderItem } from '../../lib/types';

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Нове', color: COLORS.warning, bg: COLORS.warningBg },
  confirmed: { label: 'Підтверджено', color: COLORS.success, bg: COLORS.successBg },
  canceled: { label: 'Скасовано', color: COLORS.danger, bg: COLORS.dangerBg },
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return '--'; }
}

export default function OrderDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !userId) return;
    (async () => {
      const result = await getOrderById(id, userId);
      if (result) {
        setOrder(result.order);
        setItems(result.items);
      }
      setLoading(false);
    })();
  }, [id, userId]);

  if (loading) {
    return (
      <SafeAreaView style={st.container}>
        <View style={st.center}><Text style={st.loadingText}>Завантаження...</Text></View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={st.container}>
        <View style={st.center}>
          <Feather name="alert-circle" size={40} color={COLORS.textSecondary} />
          <Text style={st.loadingText}>Замовлення не знайдено</Text>
          <TouchableOpacity onPress={() => router.back()}><Text style={st.linkText}>Повернутись</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const status = STATUS_LABELS[order.status] ?? STATUS_LABELS.pending;

  return (
    <SafeAreaView style={st.container}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Feather name="chevron-left" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>Замовлення</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.body}>
        {/* Status + date */}
        <View style={st.topRow}>
          <Text style={st.date}>{fmtDate(order.created_at)}</Text>
          <View style={[st.badge, { backgroundColor: status.bg }]}>
            <Text style={[st.badgeText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>

        {/* Items */}
        <Text style={st.sectionLabel}>Позиції</Text>
        <View style={st.card}>
          {items.map((item, idx) => (
            <View key={item.id}>
              {idx > 0 && <View style={st.divider} />}
              <View style={st.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={st.itemName}>{item.product_name}</Text>
                  <Text style={st.itemQty}>{item.quantity} шт × {item.price_at_order} ₴</Text>
                </View>
                <Text style={st.itemTotal}>{item.quantity * item.price_at_order} ₴</Text>
              </View>
            </View>
          ))}
          <View style={st.divider} />
          <View style={st.totalRow}>
            <Text style={st.totalLabel}>Разом</Text>
            <Text style={st.totalValue}>{order.total_amount} ₴</Text>
          </View>
        </View>

        {/* Delivery */}
        <Text style={st.sectionLabel}>Доставка</Text>
        <View style={st.card}>
          {order.city_name && (
            <InfoRow icon="map-pin" text={order.city_name} />
          )}
          {order.warehouse_name && (
            <InfoRow icon="package" text={order.warehouse_name} />
          )}
          {!order.city_name && !order.warehouse_name && order.delivery_address && (
            <InfoRow icon="map" text={order.delivery_address} />
          )}
          {order.np_ttn && (
            <InfoRow icon="truck" text={`ТТН: ${order.np_ttn}`} />
          )}
        </View>

        {/* Contact */}
        <Text style={st.sectionLabel}>Контакти</Text>
        <View style={st.card}>
          {(order.first_name || order.last_name) && (
            <InfoRow icon="user" text={[order.first_name, order.last_name].filter(Boolean).join(' ')} />
          )}
          <InfoRow icon="phone" text={order.phone} />
          {order.notes && <InfoRow icon="message-circle" text={order.notes} />}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={st.infoRow}>
      <Feather name={icon as any} size={15} color={COLORS.textSecondary} />
      <Text style={st.infoText}>{text}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  body: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 15, color: COLORS.textSecondary },
  linkText: { fontSize: 14, fontWeight: '600', color: COLORS.brand },

  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  date: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADII.pill },
  badgeText: { fontSize: 12, fontWeight: '700' },

  sectionLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 8 },

  card: { backgroundColor: COLORS.cardBg, borderRadius: RADII.lg, padding: 14, gap: 8 },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 4 },

  itemRow: { flexDirection: 'row', alignItems: 'center' },
  itemName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  itemQty: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  itemTotal: { fontSize: 15, fontWeight: '700', color: COLORS.text },

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 },
  totalLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  totalValue: { fontSize: 18, fontWeight: '800', color: COLORS.brand },

  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  infoText: { fontSize: 14, color: COLORS.text, flex: 1 },
});
