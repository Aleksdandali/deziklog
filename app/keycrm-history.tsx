// Legacy KeyCRM order history (read-only, live-view).
// Shown to masters whose orders pre-date the mobile app — pulled from KeyCRM
// on-demand via the get-keycrm-history edge function, deduped against
// orders.keycrm_order_id so we never double-show a synced order.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, SafeAreaView, TouchableOpacity,
  RefreshControl, Animated, Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { getKeyCRMHistory } from '../lib/api';
import { COLORS } from '../lib/constants';
import { RADII } from '../lib/theme';
import type { KeyCRMHistoryOrder } from '../lib/types';
import { formatPrice, formatDateShort } from '../lib/formatters';

type FeatherIcon = 'clock' | 'package' | 'check-circle' | 'truck' | 'x-circle' | 'archive';

// KeyCRM status groups are arbitrary per-account; we keep a sane default and
// only colorize the ones that map cleanly to our palette.
function statusVisual(group: string | null | undefined): { color: string; bg: string; icon: FeatherIcon } {
  switch ((group || '').toLowerCase()) {
    case 'success':
    case 'completed':
      return { color: COLORS.success, bg: COLORS.successBg, icon: 'check-circle' };
    case 'shipped':
    case 'delivery':
      return { color: '#2563EB', bg: '#EFF6FF', icon: 'truck' };
    case 'processing':
    case 'in_progress':
      return { color: '#2563EB', bg: '#EFF6FF', icon: 'package' };
    case 'canceled':
    case 'cancelled':
    case 'failed':
      return { color: COLORS.danger, bg: COLORS.dangerBg, icon: 'x-circle' };
    case 'new':
    case 'pending':
      return { color: COLORS.warning, bg: COLORS.warningBg, icon: 'clock' };
    default:
      return { color: COLORS.textSecondary, bg: COLORS.cardBg, icon: 'archive' };
  }
}

export default function KeyCRMHistoryScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<KeyCRMHistoryOrder[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const data = await getKeyCRMHistory();
      setOrders(data);
      setError(false);
    } catch (err) {
      console.warn('KeyCRM history: failed to load:', err);
      setError(true);
      setOrders([]);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    load(true);
  };

  const totalAmount = (orders ?? []).reduce((sum, o) => sum + (o.total || 0), 0);
  const isLoading = orders === null;

  return (
    <SafeAreaView style={st.container}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Feather name="arrow-left" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={st.title}>Історія з KeyCRM</Text>
        <View style={{ width: 36 }} />
      </View>

      {!isLoading && !error && (orders?.length ?? 0) > 0 && (
        <View style={st.summary}>
          <View style={st.summaryItem}>
            <Text style={st.summaryValue}>{orders?.length}</Text>
            <Text style={st.summaryLabel}>замовлень</Text>
          </View>
          <View style={st.summaryDivider} />
          <View style={st.summaryItem}>
            <Text style={st.summaryValue}>{formatPrice(totalAmount)}</Text>
            <Text style={st.summaryLabel}>загалом</Text>
          </View>
        </View>
      )}

      <View style={st.hint}>
        <Feather name="info" size={13} color={COLORS.textSecondary} />
        <Text style={st.hintText}>
          Замовлення, які ви робили до встановлення додатку.{'\n'}
          Дані оновлюються з KeyCRM.
        </Text>
      </View>

      {isLoading ? (
        <SkeletonList />
      ) : error ? (
        <View style={st.centered}>
          <View style={[st.emptyIcon, { backgroundColor: COLORS.dangerBg }]}>
            <Feather name="wifi-off" size={32} color={COLORS.danger} />
          </View>
          <Text style={st.emptyTitle}>Не вдалося завантажити</Text>
          <Text style={st.emptyText}>Перевірте з'єднання та спробуйте знову</Text>
          <TouchableOpacity style={st.shopBtn} onPress={() => { setOrders(null); load(); }} activeOpacity={0.85} hitSlop={12}>
            <Feather name="refresh-cw" size={16} color={COLORS.brand} />
            <Text style={st.shopBtnText}>Повторити</Text>
          </TouchableOpacity>
        </View>
      ) : orders!.length === 0 ? (
        <View style={st.centered}>
          <View style={st.emptyIcon}>
            <Feather name="archive" size={36} color={COLORS.textTertiary} />
          </View>
          <Text style={st.emptyTitle}>Історія порожня</Text>
          <Text style={st.emptyText}>
            У KeyCRM не знайдено попередніх{'\n'}
            замовлень з вашим номером
          </Text>
        </View>
      ) : (
        <FlatList
          data={orders!}
          keyExtractor={(item) => String(item.keycrm_order_id)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />
          }
          renderItem={({ item: o }) => {
            const vis = statusVisual(o.status_group);
            const totalItems = o.items.reduce((s, i) => s + i.quantity, 0);
            const itemNames = o.items.slice(0, 2).map((i) => i.name);
            const moreCount = o.items.length - 2;

            return (
              <View style={st.card}>
                <View style={[st.cardStatusBar, { backgroundColor: vis.color }]} />

                <View style={st.cardBody}>
                  <View style={st.cardTop}>
                    <View style={st.cardDateRow}>
                      <Feather name={vis.icon} size={14} color={vis.color} />
                      <Text style={st.cardDate}>{formatDateShort(o.created_at)}</Text>
                      <Text style={st.cardNumber}>№{o.number}</Text>
                    </View>
                    {o.status && (
                      <View style={[st.cardBadge, { backgroundColor: vis.bg }]}>
                        <Text style={[st.cardBadgeText, { color: vis.color }]} numberOfLines={1}>
                          {o.status}
                        </Text>
                      </View>
                    )}
                  </View>

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

                  <View style={st.cardBottom}>
                    <Text style={st.cardPrice}>{formatPrice(o.total)}</Text>
                    <View style={st.cardMeta}>
                      {totalItems > 0 && (
                        <View style={st.metaChip}>
                          <Feather name="package" size={11} color={COLORS.textTertiary} />
                          <Text style={st.metaText}>{totalItems} шт</Text>
                        </View>
                      )}
                      {o.ttn && (
                        <View style={st.metaChip}>
                          <Feather name="truck" size={11} color={COLORS.textTertiary} />
                          <Text style={st.metaText}>ТТН</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

// ── Skeleton ────────────────────────────────────────────────────────────────
function SkeletonList() {
  return (
    <View style={{ paddingHorizontal: 20 }}>
      {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
    </View>
  );
}

function SkeletonCard() {
  const opacity = React.useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View style={[st.skelCard, { opacity }]}>
      <View style={[st.skelBar]} />
      <View style={st.skelBody}>
        <View style={st.skelRow}>
          <View style={[st.skelLine, { width: 100 }]} />
          <View style={[st.skelLine, { width: 70, height: 18 }]} />
        </View>
        <View style={[st.skelLine, { width: '85%', marginTop: 4 }]} />
        <View style={[st.skelLine, { width: '60%' }]} />
        <View style={[st.skelRow, { marginTop: 4 }]}>
          <View style={[st.skelLine, { width: 90, height: 16 }]} />
          <View style={[st.skelLine, { width: 50, height: 14 }]} />
        </View>
      </View>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },

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
    marginHorizontal: 20, marginBottom: 12, padding: 14,
    backgroundColor: COLORS.white, borderRadius: RADII.md,
    borderWidth: 1, borderColor: COLORS.border,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  summaryLabel: { fontSize: 12, fontWeight: '500', color: COLORS.textSecondary, marginTop: 2 },
  summaryDivider: { width: 1, height: 28, backgroundColor: COLORS.border },

  // Hint
  hint: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    marginHorizontal: 20, marginBottom: 16, padding: 12,
    backgroundColor: COLORS.brandLight, borderRadius: RADII.md,
  },
  hintText: { flex: 1, fontSize: 12, lineHeight: 16, color: COLORS.textSecondary },

  // Empty / error
  emptyIcon: {
    width: 72, height: 72, borderRadius: 24,
    backgroundColor: COLORS.cardBg, alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },
  shopBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 16, paddingHorizontal: 24, paddingVertical: 12,
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

  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardDateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  cardDate: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  cardNumber: { fontSize: 12, fontWeight: '500', color: COLORS.textTertiary },
  cardBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, maxWidth: 130 },
  cardBadgeText: { fontSize: 11, fontWeight: '700' },

  cardItems: { gap: 2 },
  cardItemName: { fontSize: 13, fontWeight: '400', color: COLORS.textSecondary },
  cardMoreItems: { fontSize: 12, fontWeight: '500', color: COLORS.textTertiary },

  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardPrice: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  cardMeta: { flexDirection: 'row', gap: 6 },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: COLORS.cardBg, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  metaText: { fontSize: 11, fontWeight: '500', color: COLORS.textSecondary },

  // Skeleton
  skelCard: {
    flexDirection: 'row', alignItems: 'stretch',
    backgroundColor: COLORS.white, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border,
    overflow: 'hidden', marginBottom: 10,
  },
  skelBar: { width: 4, backgroundColor: COLORS.border },
  skelBody: { flex: 1, padding: 14, gap: 10 },
  skelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  skelLine: { height: 12, borderRadius: 6, backgroundColor: COLORS.cardBg },
});
