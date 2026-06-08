import React, { useState, useEffect } from 'react';
import {
  View, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  Dimensions,
} from 'react-native';
import { AppText as Text } from '../../components/AppText';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { getCached } from '../../lib/cache';
import { useCart } from '../../lib/cart-context';
import Skeleton from '../../components/Skeleton';
import { ProductImage } from '../../components/ProductImage';
import type { Product } from '../../lib/types';

const { width: SCREEN_W } = Dimensions.get('window');

function formatPrice(price: number): string {
  return price.toLocaleString('uk-UA') + ' ₴';
}

// Strip tags + decode common entities, preserving paragraph breaks.
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&[a-z#0-9]+;/gi, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n\n')
    .trim();
}

// Dezik product descriptions are stored as ONE flat paragraph (no markup), with
// section headers ("Призначення", "Сфера застосування", …) inline. Split them
// back into header + body sections for a readable layout. Unknown text before
// the first header is the intro block.
const SECTION_HEADERS = [
  'Призначення', 'Принцип дії', 'Дія', 'Переваги', 'Сфера застосування',
  'Обмеження', 'Протипоказання', 'Склад', 'Спосіб використання',
  'Як використовувати', 'Застосування', 'Приготування розчину', 'Очищення',
  'Дезінфекція', 'Стерилізація', 'Зберігання', 'Запобіжні заходи', 'Важливо',
  'Характеристики', 'Комплектація', 'Інформація про продукт', 'Про продукт',
];

function parseDescription(text: string): { header?: string; body: string }[] {
  const sorted = [...SECTION_HEADERS].sort((a, b) => b.length - a.length);
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\s*(${sorted.map(esc).join('|')})\\s+`, 'g');
  const parts = text.split(re); // [intro, h1, b1, h2, b2, …]
  const out: { header?: string; body: string }[] = [];
  const intro = parts[0]?.trim();
  if (intro) out.push({ body: intro });
  for (let i = 1; i < parts.length; i += 2) {
    const header = parts[i]?.trim();
    // Put numbered steps ("1. …") on their own lines.
    const body = (parts[i + 1] || '').trim().replace(/\s+(\d+\.\s)/g, '\n$1');
    if (header || body) out.push({ header, body });
  }
  return out;
}

export default function ProductDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { addItem, itemCount } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (!id) return;
    // Try cached catalog first for instant load
    getCached<Product[]>('products').then((cached) => {
      if (cached) {
        const found = cached.find((p) => p.id === id);
        if (found && !product) { setProduct(found); setLoading(false); }
      }
    });
    // Fetch fresh
    (async () => {
      const { data } = await supabase
        .from('products')
        .select('*, category:product_categories(name)')
        .eq('id', id)
        .single();
      if (data) { setProduct(data); }
      setLoading(false);
    })();
  }, [id]);

  const handleAdd = () => {
    if (!product) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    for (let i = 0; i < qty; i++) addItem(product);
  };

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <TouchableOpacity style={s.headerBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <View style={{ width: 40 }} />
        </View>
        <Skeleton width={SCREEN_W} height={SCREEN_W * 0.75} borderRadius={0} />
        <View style={{ padding: 24 }}>
          <Skeleton width={80} height={14} borderRadius={6} />
          <Skeleton width="80%" height={20} borderRadius={8} style={{ marginTop: 10 }} />
          <Skeleton width="50%" height={14} borderRadius={6} style={{ marginTop: 10 }} />
          <Skeleton width={100} height={26} borderRadius={8} style={{ marginTop: 16 }} />
        </View>
      </SafeAreaView>
    );
  }

  if (!product) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.loader}>
          <Text style={{ fontSize: 16, color: COLORS.textSecondary }}>Товар не знайдено</Text>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
            <Text style={{ color: COLORS.brand, fontWeight: '600' }}>Назад</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const catName = (product.category as any)?.name;
  const description = product.description ? stripHtml(product.description) : null;

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.headerBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <TouchableOpacity style={s.headerBtn} onPress={() => router.push('/cart')}>
          <Ionicons name="cart-outline" size={22} color={COLORS.text} />
          {itemCount > 0 && (
            <View style={s.headerBadge}>
              <Text style={s.headerBadgeText}>{itemCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Image */}
        <View style={s.imageWrap}>
          <ProductImage
            uri={product.image_path}
            style={s.image}
            placeholderStyle={s.imagePlaceholder}
            iconSize={64}
            iconColor={COLORS.textSecondary}
            transition={300}
          />
        </View>

        {/* Info */}
        <View style={s.info}>
          {catName && <Text style={s.brand}>{catName}</Text>}
          <Text style={s.name}>{product.name}</Text>
          {product.volume && <Text style={s.volume}>{product.volume}</Text>}

          {/* Stock */}
          <View style={[s.stockBadge, !product.in_stock && s.stockBadgeOut]}>
            <Text style={[s.stockBadgeText, !product.in_stock && s.stockBadgeTextOut]}>
              {product.in_stock ? 'В наявності' : 'Немає в наявності'}
            </Text>
          </View>

          {/* Price */}
          <Text style={s.price}>{formatPrice(product.price)}</Text>
        </View>

        {/* Description */}
        {description && (
          <>
            <View style={s.divider} />
            <View style={s.descSection}>
              <Text style={s.descTitle}>Опис</Text>
              {parseDescription(description).map((sec, i) => (
                <View key={i} style={i > 0 ? { marginTop: 16 } : undefined}>
                  {sec.header ? <Text style={s.descHeader}>{sec.header}</Text> : null}
                  {sec.body ? <Text style={s.descText}>{sec.body}</Text> : null}
                </View>
              ))}
            </View>
          </>
        )}

        {/* Specs */}
        <View style={s.divider} />
        <View style={s.specsSection}>
          <Text style={s.specsTitle}>Характеристики</Text>
          {product.volume && <SpecRow label="Об'єм" value={product.volume} />}
          {product.shelf_life_days && <SpecRow label="Термін придатності" value={`${product.shelf_life_days} днів`} />}
          {catName && <SpecRow label="Категорія" value={catName} />}
        </View>
      </ScrollView>

      {/* Bottom bar */}
      <View style={s.bottomBar}>
        <View style={s.bottomLeft}>
          <Text style={s.bottomPrice}>{formatPrice(product.price * qty)}</Text>
        </View>

        {/* Quantity */}
        <View style={s.qtyRow}>
          <TouchableOpacity style={s.qtyBtn} onPress={() => setQty(Math.max(1, qty - 1))} activeOpacity={0.7}>
            <Feather name="minus" size={18} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={s.qtyText}>{qty}</Text>
          <TouchableOpacity style={s.qtyBtn} onPress={() => setQty(qty + 1)} activeOpacity={0.7}>
            <Feather name="plus" size={18} color={COLORS.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Add to cart button */}
      <View style={s.addBarWrap}>
        <TouchableOpacity
          style={[s.addBar, !product.in_stock && s.addBarDisabled]}
          onPress={handleAdd}
          activeOpacity={0.9}
          disabled={!product.in_stock}
        >
          <Ionicons name="cart-outline" size={20} color="#fff" />
          <Text style={s.addBarText}>{product.in_stock ? 'Додати в кошик' : 'Немає в наявності'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.specRow}>
      <Text style={s.specLabel}>{label}</Text>
      <Text style={s.specValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  headerBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  headerBadge: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  headerBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },

  imageWrap: { backgroundColor: COLORS.bg, paddingVertical: 20 },
  image: { width: SCREEN_W, height: SCREEN_W * 0.75, backgroundColor: COLORS.bg },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },

  info: { paddingHorizontal: 24, paddingTop: 20 },
  brand: { fontSize: 14, fontWeight: '700', color: COLORS.brand, marginBottom: 6 },
  name: { fontSize: 20, fontWeight: '600', color: COLORS.text, lineHeight: 26, marginBottom: 4 },
  volume: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 8 },
  stockBadge: { alignSelf: 'flex-start', backgroundColor: COLORS.successBg, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6, marginBottom: 12 },
  stockBadgeText: { fontSize: 12, fontWeight: '600', color: COLORS.success },
  stockBadgeOut: { backgroundColor: COLORS.dangerBg },
  stockBadgeTextOut: { color: COLORS.danger },
  price: { fontSize: 26, fontWeight: '700', color: COLORS.text },

  divider: { height: 1, backgroundColor: COLORS.border, marginHorizontal: 24, marginTop: 24 },
  descSection: { paddingHorizontal: 24, paddingTop: 22 },
  descTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text, marginBottom: 12, letterSpacing: 0.2 },
  descHeader: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 5 },
  descText: { fontSize: 15, color: COLORS.textSecondary, lineHeight: 24 },

  specsSection: { paddingHorizontal: 24, paddingTop: 22 },
  specsTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text, marginBottom: 12, letterSpacing: 0.2 },
  specRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  specLabel: { fontSize: 14, color: COLORS.textSecondary },
  specValue: { fontSize: 14, fontWeight: '500', color: COLORS.text },

  bottomBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: '#fff' },
  bottomLeft: {},
  bottomPrice: { fontSize: 22, fontWeight: '700', color: COLORS.text },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.bg, borderRadius: 12, paddingHorizontal: 4, paddingVertical: 4 },
  qtyBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  qtyText: { fontSize: 16, fontWeight: '700', color: COLORS.text, minWidth: 24, textAlign: 'center' },

  addBarWrap: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 30, backgroundColor: '#fff' },
  addBar: { flexDirection: 'row', height: 54, borderRadius: 14, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center', gap: 8 },
  addBarDisabled: { backgroundColor: COLORS.textTertiary },
  addBarText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
