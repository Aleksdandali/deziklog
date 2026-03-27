import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, SafeAreaView, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../lib/auth-context';
import { getOrders } from '../lib/api';
import { COLORS } from '../lib/constants';
import { RADII } from '../lib/theme';
import type { Order } from '../lib/types';

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending: { label: 'Нове', color: COLORS.warning, bg: COLORS.warningBg, icon: 'clock' },
  confirmed: { label: 'Підтверджено', color: COLORS.success, bg: COLORS.successBg, icon: 'check-circle' },
  canceled: { label: 'Скасовано', color: COLORS.danger, bg: COLORS.dangerBg, icon: 'x-circle' },
};

function formatPrice(price: number): string {
  return price.toLocaleString('uk-UA') + ' ₴';
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return '--'; }
}

function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
  } catch { return '--'; }
}

export default function OrdersScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!userId) return;
    if (isRefresh) setRefreshing(true);
    try {
      const data = await getOrders(userId);
      setOrders(data);
    } catch (err) {
      console.warn('Orders: failed to load:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const totalAmount = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0);

  return (
    <SafeAreaView style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Feather name="arrow-left" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={st.title}>Мої замовлення</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Summary */}
      {orders.length > 0 && (
        <View style={st.summary}>
          <View style={st.summaryItem}>
            <Text style={st.summaryValue}>{orders.length}</Text>
            <Text style={st.summaryLabel}>замовлень</Text>
          </View>
          <View style={st.summaryDivider} />
          <View style={st.summaryItem}>
            <Text style={st.summaryValue}>{formatPrice(totalAmount)}</Text>
            <Text style={st.summaryLabel}>загалом</Text>
          </View>
        </View>
      )}

      {loading ? (
        <View style={st.centered}>
          <ActivityIndicator color={COLORS.brand} />
        </View>
      ) : orders.length === 0 ? (
        <View style={st.centered}>
          <View style={st.emptyIcon}>
            <Feather name="shopping-bag" size={36} color={COLORS.textTertiary} />
          </View>
          <Text style={st.emptyTitle}>Замовлень поки немає</Text>
          <Text style={st.emptyText}>Ваші замовлення з магазину{'\n'}з'являться тут</Text>
          <TouchableOpacity style={st.shopBtn} onPress={() => { router.back(); setTimeout(() => router.push('/(tabs)/catalog'), 300); }} activeOpacity={0.85}>
            <Feather name="shopping-cart" size={16} color={COLORS.brand} />
            <Text style={st.shopBtnText}>Перейти в магазин</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={COLORS.brand} />}
          renderItem={({ item: o }) => {
            const cfg = STATUS_CFG[o.status] ?? STATUS_CFG.pending;
            const items = (o as any).order_items ?? [];
            const totalItems = items.reduce((sum: number, i: any) => sum + i.quantity, 0);
            const itemNames: string[] = items.slice(0, 2).map((i: any) => i.product_name);
            const moreCount = items.length - 2;

            return (
              <TouchableOpacity
                style={st.card}
                activeOpacity={0.7}
                onPress={() => router.push(`/order/${o.id}` as any)}
              >
                {/* Status bar */}
                <View style={[st.cardStatusBar, { backgroundColor: cfg.color }]} />

                <View style={st.cardBody}>
                  {/* Top: date + status */}
                  <View style={st.cardTop}>
                    <View style={st.cardDateRow}>
                      <Feather name={cfg.icon as any} size={14} color={cfg.color} />
                      <Text style={st.cardDate}>{formatDateShort(o.created_at)}</Text>
                    </View>
                    <View style={[st.cardBadge, { backgroundColor: cfg.bg }]}>
                      <Text style={[st.cardBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  </View>

                  {/* Items */}
                  {itemNames.length > 0 && (
                    <View style={st.cardItems}>
                      {itemNames.map((name, idx) => (
                        <Text key={idx} style={st.cardItemName} numberOfLines={1}>{name}</Text>
                      ))}
                      {moreCount > 0 && (
                        <Text style={st.cardMoreItems}>+ ще {moreCount}</Text>
                      )}
                    </View>
                  )}

                  {/* Bottom: price + meta */}
                  <View style={st.cardBottom}>
                    <Text style={st.cardPrice}>{formatPrice(o.total_amount)}</Text>
                    <View style={st.cardMeta}>
                      {totalItems > 0 && (
                        <View style={st.metaChip}>
                          <Feather name="package" size={11} color={COLORS.textTertiary} />
                          <Text style={st.metaText}>{totalItems} шт</Text>
                        </View>
                      )}
                      {o.np_ttn && (
                        <View style={st.metaChip}>
                          <Feather name="truck" size={11} color={COLORS.textTertiary} />
                          <Text style={st.metaText}>ТТН</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* City */}
                  {o.city_name && (
                    <View style={st.cardFooter}>
                      <Feather name="map-pin" size={11} color={COLORS.textTertiary} />
                      <Text style={st.cardCity} numberOfLines={1}>{o.city_name}</Text>
                    </View>
                  )}
                </View>

                <View style={st.cardChevron}>
                  <Feather name="chevron-right" size={16} color={COLORS.textTertiary} />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: '700', color: COLORS.text },

  // Summary
  summary: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 20, marginBottom: 16, padding: 14,
    backgroundColor: COLORS.white, borderRadius: RADII.md,
    borderWidth: 1, borderColor: COLORS.border,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  summaryLabel: { fontSize: 12, fontWeight: '500', color: COLORS.textSecondary, marginTop: 2 },
  summaryDivider: { width: 1, height: 28, backgroundColor: COLORS.border },

  // Empty
  emptyIcon: {
    width: 72, height: 72, borderRadius: 24,
    backgroundColor: COLORS.cardBg, alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20, marginTop: 4 },
  shopBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 20, paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: 12, backgroundColor: COLORS.brandLight,
  },
  shopBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.brand },

  // Card
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.white, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border,
    overflow: 'hidden', marginBottom: 10,
  },
  cardStatusBar: { width: 4, alignSelf: 'stretch' },
  cardBody: { flex: 1, padding: 14, gap: 8 },
  cardChevron: { paddingRight: 12 },

  // Card top
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardDateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardDate: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  cardBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  cardBadgeText: { fontSize: 11, fontWeight: '700' },

  // Card items
  cardItems: { gap: 2 },
  cardItemName: { fontSize: 13, fontWeight: '400', color: COLORS.textSecondary },
  cardMoreItems: { fontSize: 12, fontWeight: '500', color: COLORS.textTertiary },

  // Card bottom
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardPrice: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  cardMeta: { flexDirection: 'row', gap: 6 },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: COLORS.cardBg, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  metaText: { fontSize: 11, fontWeight: '500', color: COLORS.textSecondary },

  // Card footer
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardCity: { fontSize: 12, color: COLORS.textTertiary, flex: 1 },
});
