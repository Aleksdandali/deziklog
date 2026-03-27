import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, SafeAreaView, TouchableOpacity,
  Dimensions, ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { useCart } from '../../lib/cart-context';
import { COLORS, FONT, RADIUS, SHADOW } from '../../lib/constants';
import { SkeletonProductCard } from '../../components/Skeleton';
import type { Product, ProductCategory } from '../../lib/types';

const CACHE_KEY_PRODUCTS = 'dezik_cache_products';
const CACHE_KEY_CATEGORIES = 'dezik_cache_categories';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_GAP = 12;
const CARD_W = (SCREEN_W - 24 * 2 - CARD_GAP) / 2;

function formatPrice(price: number): string {
  return price.toLocaleString('uk-UA') + ' ₴';
}

export default function CatalogScreen() {
  const router = useRouter();
  const { addItem, itemCount } = useCart();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    Promise.all([
      AsyncStorage.getItem(CACHE_KEY_CATEGORIES),
      AsyncStorage.getItem(CACHE_KEY_PRODUCTS),
    ]).then(([cachedCats, cachedProds]) => {
      if (!mounted) return;
      if (cachedCats) try { setCategories(JSON.parse(cachedCats)); } catch (e) { console.warn('Catalog: cached categories parse error:', e); }
      if (cachedProds) try { setProducts(JSON.parse(cachedProds)); setLoading(false); } catch (e) { console.warn('Catalog: cached products parse error:', e); }
    });

    (async () => {
      try {
        const [catRes, prodRes] = await Promise.all([
          supabase.from('product_categories').select('*').order('sort_order'),
          supabase.from('products').select('*, category:product_categories(name)').eq('in_stock', true).order('sort_order'),
        ]);
        if (!mounted) return;
        if (catRes.data) {
          setCategories(catRes.data);
          AsyncStorage.setItem(CACHE_KEY_CATEGORIES, JSON.stringify(catRes.data)).catch(() => {});
        }
        if (prodRes.data) {
          setProducts(prodRes.data);
          AsyncStorage.setItem(CACHE_KEY_PRODUCTS, JSON.stringify(prodRes.data)).catch(() => {});
          // expo-image handles disk caching natively — no manual prefetch needed
        }
      } catch (err) {
        console.warn('Catalog: failed to load products:', err);
      } finally { if (mounted) setLoading(false); }
    })();

    return () => { mounted = false; };
  }, []);

  const filtered = useMemo(
    () => selectedCat ? products.filter((p) => p.category_id === selectedCat) : products,
    [selectedCat, products],
  );

  const handleAdd = (product: Product) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addItem(product);
  };

  const allCats: { id: string | null; name: string }[] = [
    { id: null, name: 'Всі' },
    ...categories,
  ];

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>Магазин</Text>
          <Text style={s.subtitle}>Продукція DEZIK · {filtered.length} товарів</Text>
        </View>
        <TouchableOpacity style={s.cartBtn} onPress={() => router.push('/cart')} activeOpacity={0.7}>
          <Ionicons name="cart-outline" size={22} color={COLORS.text} />
          {itemCount > 0 && (
            <View style={s.badge}>
              <Text style={s.badgeText}>{itemCount > 99 ? '99+' : itemCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Category pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.catList}
      >
        {allCats.map((cat) => {
          const active = selectedCat === cat.id;
          return (
            <TouchableOpacity
              key={cat.id ?? 'all'}
              style={[s.catPill, active && s.catPillActive]}
              onPress={() => setSelectedCat(cat.id)}
              activeOpacity={0.8}
            >
              <Text style={[s.catPillText, active && s.catPillTextActive]}>{cat.name}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>



      {/* Grid */}
      {loading && products.length === 0 ? (
        <View style={s.skeletonGrid}>
          <SkeletonProductCard width={CARD_W} />
          <SkeletonProductCard width={CARD_W} />
          <SkeletonProductCard width={CARD_W} />
          <SkeletonProductCard width={CARD_W} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          numColumns={2}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          columnWrapperStyle={s.gridRow}
          contentContainerStyle={s.gridContent}
          initialNumToRender={6}
          maxToRenderPerBatch={8}
          windowSize={5}
          renderItem={({ item }) => {
            const catName = item.category?.name;
            return (
              <TouchableOpacity
                style={s.card}
                activeOpacity={0.95}
                onPress={() => router.push(`/product/${item.id}`)}
              >
                {item.image_path ? (
                  <Image
                    source={{ uri: item.image_path }}
                    style={s.cardImage}
                    contentFit="contain"
                    cachePolicy="disk"
                    transition={200}
                    recyclingKey={item.id}
                  />
                ) : (
                  <View style={[s.cardImage, s.cardImagePlaceholder]}>
                    <Feather name="package" size={28} color={COLORS.textTertiary} />
                  </View>
                )}

                <View style={s.cardBody}>
                  {catName && <Text style={s.cardCategory}>{catName}</Text>}
                  <Text style={s.cardName} numberOfLines={3}>{item.name}</Text>

                  <View style={s.stockRow}>
                    <View style={[s.stockDot, { backgroundColor: item.in_stock ? COLORS.success : COLORS.danger }]} />
                    <Text style={[s.stockText, { color: item.in_stock ? COLORS.success : COLORS.danger }]}>
                      {item.in_stock ? 'В наявності' : 'Немає'}
                    </Text>
                  </View>

                  <Text style={s.cardPrice}>{formatPrice(item.price)}</Text>

                  <TouchableOpacity
                    style={[s.addBtn, !item.in_stock && { opacity: 0.3 }]}
                    onPress={() => handleAdd(item)}
                    disabled={!item.in_stock}
                    activeOpacity={0.85}
                  >
                    <Feather name="plus" size={16} color="#fff" />
                    <Text style={s.addBtnText}>В кошик</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={s.empty}><Text style={s.emptyText}>Товарів не знайдено</Text></View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8,
  },
  title: { fontSize: 28, fontFamily: FONT.bold, color: COLORS.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, fontFamily: FONT.regular, color: COLORS.textSecondary, marginTop: 2 },
  cartBtn: {
    width: 44, height: 44, borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  badge: {
    position: 'absolute', top: -4, right: -4,
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: COLORS.brand,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  badgeText: { fontSize: 11, fontFamily: FONT.bold, color: '#fff' },

  // Category pills
  catList: { paddingHorizontal: 24, paddingVertical: 12 },
  catPill: {
    height: 36, paddingHorizontal: 16, borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    marginRight: 8, alignItems: 'center', justifyContent: 'center',
  },
  catPillActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  catPillText: { fontSize: 14, fontFamily: FONT.medium, color: COLORS.text },
  catPillTextActive: { color: '#fff' },


  // Skeleton
  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP, paddingHorizontal: 24 },

  gridRow: { gap: CARD_GAP, paddingHorizontal: 24 },
  gridContent: { paddingBottom: 32, gap: CARD_GAP },

  card: {
    width: CARD_W, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
    ...SHADOW.sm,
  },
  cardImage: { width: '100%', height: CARD_W, backgroundColor: COLORS.cardBg },
  cardImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { padding: 12 },
  cardCategory: { fontSize: 11, fontFamily: FONT.semibold, color: COLORS.brand, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardName: { fontSize: 13, fontFamily: FONT.medium, color: COLORS.text, lineHeight: 18, minHeight: 54 },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  stockDot: { width: 6, height: 6, borderRadius: 3 },
  stockText: { fontSize: 12, fontFamily: FONT.medium },
  cardPrice: { fontSize: 17, fontFamily: FONT.bold, color: COLORS.text, marginTop: 8 },
  addBtn: {
    flexDirection: 'row', gap: 6,
    height: 38, borderRadius: RADIUS.sm, backgroundColor: COLORS.brand,
    alignItems: 'center', justifyContent: 'center', marginTop: 10,
  },
  addBtnText: { fontSize: 13, fontFamily: FONT.semibold, color: '#fff' },

  empty: { alignItems: 'center', paddingTop: 40 },
  emptyText: { fontSize: 15, fontFamily: FONT.regular, color: COLORS.textSecondary },
});
