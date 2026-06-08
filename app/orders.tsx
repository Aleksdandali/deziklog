// Unified order history: native orders (orders table) merged with legacy
// KeyCRM-only orders (read-only, pulled live via the get-keycrm-history edge
// function). KeyCRM-only items show with an "Архів" badge and a "Повторити"
// action — native orders open the detail screen.

import React, { useState, useCallback, useRef } from 'react';
import {
  View, FlatList, StyleSheet, SafeAreaView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { AppText as Text } from '../components/AppText';
import { SkeletonEntryCard } from '../components/Skeleton';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../lib/auth-context';
import { useCart } from '../lib/cart-context';
import { getOrders, getKeyCRMHistory } from '../lib/api';
import { supabase } from '../lib/supabase';
import { COLORS } from '../lib/constants';
import { RADII } from '../lib/theme';
import type { Order, OrderItem, KeyCRMHistoryOrder, KeyCRMHistoryItem, Product } from '../lib/types';
import { formatPrice, formatDateShort } from '../lib/formatters';

type FeatherIcon = 'clock' | 'package' | 'check-circle' | 'truck' | 'x-circle' | 'archive';

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; icon: FeatherIcon }> = {
  pending: { label: 'Нове', color: COLORS.warning, bg: COLORS.warningBg, icon: 'clock' },
  processing: { label: 'Збирається', color: '#2563EB', bg: '#EFF6FF', icon: 'package' },
  confirmed: { label: 'Підтверджено', color: COLORS.success, bg: COLORS.successBg, icon: 'check-circle' },
  delivered: { label: 'Доставлено', color: COLORS.success, bg: COLORS.successBg, icon: 'truck' },
  canceled: { label: 'Скасовано', color: COLORS.danger, bg: COLORS.dangerBg, icon: 'x-circle' },
};

// Map KeyCRM status groups to our palette (groups are arbitrary per account).
function legacyStatusVisual(group: string | null | undefined): { color: string; bg: string; icon: FeatherIcon } {
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

// Match legacy item names to current in-stock products. Exact normalized
// match first, then bidirectional substring fallback. Renamed catalog items
// gracefully end up in `unmatched`.
function matchProducts(
  items: KeyCRMHistoryItem[],
  products: Product[],
): { matched: Array<{ product: Product; quantity: number }>; unmatched: string[] } {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const matched: Array<{ product: Product; quantity: number }> = [];
  const unmatched: string[] = [];
  for (const item of items) {
    const iname = norm(item.name);
    if (!iname) continue;
    let p = products.find((pr) => norm(pr.name) === iname);
    if (!p) {
      p = products.find((pr) => {
        const pname = norm(pr.name);
        return iname.includes(pname) || pname.includes(iname);
      });
    }
    if (p) matched.push({ product: p, quantity: Math.max(1, Math.floor(item.quantity)) });
    else unmatched.push(item.name);
  }
  return { matched, unmatched };
}

// Discriminated union for the merged list.
type Row =
  | { kind: 'native'; createdAt: string; order: Order }
  | { kind: 'legacy'; createdAt: string; order: KeyCRMHistoryOrder };

// Cache KeyCRM history for 5 min — the edge function hits an external API
// and useFocusEffect re-fires on every tab switch. User-pulled refresh
// still bypasses the cache. Keyed by userId so signing out as A and in as
// B doesn't leak A's history into B's screen.
const LEGACY_TTL_MS = 5 * 60 * 1000;
const legacyCache: { userId: string | null; at: number; data: KeyCRMHistoryOrder[] } = { userId: null, at: 0, data: [] };

export default function OrdersScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { addItems } = useCart();
  const userId = session?.user?.id;

  const [native, setNative] = useState<Order[]>([]);
  const [legacy, setLegacy] = useState<KeyCRMHistoryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [repeatingId, setRepeatingId] = useState<number | null>(null);
  // Synchronous guard against double-tap during the products fetch window —
  // `repeatingId` state lags behind the second tap and lets it slip through.
  const repeatBusyRef = useRef(false);
  // Products are only needed for "Повторити" matching, so load them
  // lazily on the first repeat tap (and cache for the screen lifetime).
  const productsRef = useRef<Product[] | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!userId) return;
    if (isRefresh) setRefreshing(true);

    const useCache = !isRefresh
      && legacyCache.userId === userId
      && legacyCache.data.length > 0
      && (Date.now() - legacyCache.at) < LEGACY_TTL_MS;
    try {
      const [ordersData, legacyData] = await Promise.all([
        getOrders(userId),
        useCache ? Promise.resolve(legacyCache.data) : getKeyCRMHistory(),
      ]);
      setNative(ordersData);
      setLegacy(legacyData);
      if (!useCache) { legacyCache.userId = userId; legacyCache.at = Date.now(); legacyCache.data = legacyData; }
    } catch (err) {
      console.warn('Orders: failed to load:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Merge + sort by created_at desc. KeyCRM-only rows that share a date
  // with a native order are not deduped here — the edge function already
  // filters by orders.keycrm_order_id, so duplication isn't possible.
  const rows: Row[] = React.useMemo(() => {
    const all: Row[] = [
      ...native.map((o): Row => ({ kind: 'native', createdAt: o.created_at, order: o })),
      ...legacy.map((o): Row => ({ kind: 'legacy', createdAt: o.created_at, order: o })),
    ];
    return all.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [native, legacy]);

  const totalAmount = native.reduce((s, o) => s + (o.total_amount || 0), 0)
                    + legacy.reduce((s, o) => s + (o.total || 0), 0);

  const handleRepeat = useCallback(async (order: KeyCRMHistoryOrder) => {
    if (repeatBusyRef.current) return;
    repeatBusyRef.current = true;
    setRepeatingId(order.keycrm_order_id);

    const clearBusy = () => { repeatBusyRef.current = false; setRepeatingId(null); };

    // Lazy-fetch products on first repeat (cached for screen lifetime).
    if (productsRef.current === null) {
      const { data } = await supabase.from('products').select('*').eq('in_stock', true);
      productsRef.current = (data ?? []) as Product[];
    }
    const products = productsRef.current;

    // Small delay lets the spinner render before Alert pops.
    setTimeout(() => {
      const { matched, unmatched } = matchProducts(order.items, products);

      if (matched.length === 0) {
        clearBusy();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        Alert.alert(
          'Товари більше не доступні',
          'Жоден товар з цього замовлення зараз не продається. Подивіться актуальний каталог.',
          [
            { text: 'Скасувати', style: 'cancel' },
            { text: 'У каталог', onPress: () => { router.back(); setTimeout(() => router.push('/(tabs)/catalog' as never), 250); } },
          ],
        );
        return;
      }

      const addAndGo = () => {
        addItems(matched);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        clearBusy();
        router.push('/cart' as never);
      };

      if (unmatched.length > 0) {
        const preview = unmatched.slice(0, 3).join('\n• ');
        const moreNote = unmatched.length > 3 ? `\n…і ще ${unmatched.length - 3}` : '';
        Alert.alert(
          `Додано ${matched.length} з ${matched.length + unmatched.length}`,
          `Не знайдено в каталозі:\n• ${preview}${moreNote}`,
          [
            { text: 'Скасувати', style: 'cancel', onPress: clearBusy },
            { text: 'Додати знайдені', onPress: addAndGo },
          ],
        );
      } else {
        addAndGo();
      }
    }, 0);
  }, [addItems, router]);

  const totalCount = native.length + legacy.length;

  return (
    <SafeAreaView style={st.container}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Feather name="arrow-left" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={st.title}>Мої замовлення</Text>
        <View style={{ width: 36 }} />
      </View>

      {totalCount > 0 && (
        <View style={st.summary}>
          <View style={st.summaryItem}>
            <Text style={st.summaryValue}>{totalCount}</Text>
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
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <SkeletonEntryCard /><SkeletonEntryCard /><SkeletonEntryCard /><SkeletonEntryCard />
        </View>
      ) : totalCount === 0 ? (
        <View style={st.centered}>
          <View style={st.emptyIcon}>
            <Feather name="shopping-bag" size={36} color={COLORS.textTertiary} />
          </View>
          <Text style={st.emptyTitle}>Замовлень поки немає</Text>
          <Text style={st.emptyText}>Ваші замовлення з магазину{'\n'}з&apos;являться тут</Text>
          <TouchableOpacity style={st.shopBtn} onPress={() => { router.back(); setTimeout(() => router.push('/(tabs)/catalog'), 300); }} activeOpacity={0.85}>
            <Feather name="shopping-cart" size={16} color={COLORS.brand} />
            <Text style={st.shopBtnText}>Перейти в магазин</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.kind === 'native' ? `n:${row.order.id}` : `l:${row.order.keycrm_order_id}`}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={COLORS.brand} />}
          renderItem={({ item }) =>
            item.kind === 'native'
              ? <NativeCard order={item.order} onOpen={() => router.push(`/order/${item.order.id}` as `/${string}`)} />
              : <LegacyCard
                  order={item.order}
                  isRepeating={repeatingId === item.order.keycrm_order_id}
                  disabled={repeatingId !== null}
                  onRepeat={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); handleRepeat(item.order); }}
                />
          }
        />
      )}
    </SafeAreaView>
  );
}

// ── Cards ───────────────────────────────────────────────────────────────────

function NativeCard({ order, onOpen }: { order: Order; onOpen: () => void }) {
  const cfg = STATUS_CFG[order.status] ?? STATUS_CFG.pending;
  const orderItems: OrderItem[] = (order as Order & { order_items?: OrderItem[] }).order_items ?? [];
  const totalItems = orderItems.reduce((sum, i) => sum + i.quantity, 0);
  const itemNames = orderItems.slice(0, 2).map((i) => i.product_name);
  const moreCount = orderItems.length - 2;

  return (
    <TouchableOpacity style={st.card} activeOpacity={0.7} onPress={onOpen}>
      <View style={[st.cardStatusBar, { backgroundColor: cfg.color }]} />
      <View style={st.cardBody}>
        <View style={st.cardTop}>
          <View style={st.cardDateRow}>
            <Feather name={cfg.icon} size={14} color={cfg.color} />
            <Text style={st.cardDate}>{formatDateShort(order.created_at)}</Text>
          </View>
          <View style={[st.cardBadge, { backgroundColor: cfg.bg }]}>
            <Text style={[st.cardBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
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
          <Text style={st.cardPrice}>{formatPrice(order.total_amount)}</Text>
          <View style={st.cardMeta}>
            {totalItems > 0 && (
              <View style={st.metaChip}>
                <Feather name="package" size={11} color={COLORS.textTertiary} />
                <Text style={st.metaText}>{totalItems} шт</Text>
              </View>
            )}
            {order.np_ttn && (
              <View style={st.metaChip}>
                <Feather name="truck" size={11} color={COLORS.textTertiary} />
                <Text style={st.metaText}>ТТН</Text>
              </View>
            )}
          </View>
        </View>

        {order.city_name && (
          <View style={st.cardFooter}>
            <Feather name="map-pin" size={11} color={COLORS.textTertiary} />
            <Text style={st.cardCity} numberOfLines={1}>{order.city_name}</Text>
          </View>
        )}
      </View>

      <View style={st.cardChevron}>
        <Feather name="chevron-right" size={16} color={COLORS.textTertiary} />
      </View>
    </TouchableOpacity>
  );
}

function LegacyCard({
  order, isRepeating, disabled, onRepeat,
}: {
  order: KeyCRMHistoryOrder;
  isRepeating: boolean;
  disabled: boolean;
  onRepeat: () => void;
}) {
  const vis = legacyStatusVisual(order.status_group);
  const totalItems = order.items.reduce((s, i) => s + i.quantity, 0);
  const itemNames = order.items.slice(0, 2).map((i) => i.name);
  const moreCount = order.items.length - 2;

  return (
    <View style={st.card}>
      <View style={[st.cardStatusBar, { backgroundColor: vis.color }]} />
      <View style={st.cardBody}>
        <View style={st.cardTop}>
          <View style={st.cardDateRow}>
            <Feather name={vis.icon} size={14} color={vis.color} />
            <Text style={st.cardDate}>{formatDateShort(order.created_at)}</Text>
            <Text style={st.cardNumber}>№{order.number}</Text>
          </View>
          <View style={[st.cardBadge, { backgroundColor: COLORS.cardBg }]}>
            <Text style={[st.cardBadgeText, { color: COLORS.textSecondary }]} numberOfLines={1}>Архів</Text>
          </View>
        </View>

        {order.status && (
          <Text style={st.legacyStatus} numberOfLines={1}>{order.status}</Text>
        )}

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
          <Text style={st.cardPrice}>{formatPrice(order.total)}</Text>
          <View style={st.cardMeta}>
            {totalItems > 0 && (
              <View style={st.metaChip}>
                <Feather name="package" size={11} color={COLORS.textTertiary} />
                <Text style={st.metaText}>{totalItems} шт</Text>
              </View>
            )}
            {order.ttn && (
              <View style={st.metaChip}>
                <Feather name="truck" size={11} color={COLORS.textTertiary} />
                <Text style={st.metaText}>ТТН</Text>
              </View>
            )}
          </View>
        </View>

        {order.items.length > 0 && (
          <TouchableOpacity
            style={[st.repeatBtn, isRepeating && st.repeatBtnBusy]}
            activeOpacity={0.8}
            hitSlop={8}
            disabled={disabled}
            onPress={onRepeat}
          >
            {isRepeating ? (
              <ActivityIndicator size="small" color={COLORS.brand} />
            ) : (
              <>
                <Feather name="repeat" size={14} color={COLORS.brand} />
                <Text style={st.repeatBtnText}>Повторити замовлення</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
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

  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardCity: { fontSize: 12, color: COLORS.textTertiary, flex: 1 },

  // Legacy-only
  legacyStatus: { fontSize: 12, color: COLORS.textTertiary, fontStyle: 'italic' },
  repeatBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 4, paddingVertical: 10, borderRadius: 10,
    backgroundColor: COLORS.brandLight, minHeight: 38,
  },
  repeatBtnBusy: { opacity: 0.7 },
  repeatBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.brand },
});
