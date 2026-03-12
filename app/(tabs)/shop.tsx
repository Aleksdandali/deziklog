import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, StyleSheet, SafeAreaView,
  TouchableOpacity, Image, Dimensions, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useCart } from '../../lib/cart-context';
import * as Haptics from 'expo-haptics';

const BRAND = '#4b569e';
const COLORS = {
  bg: '#f5f6fa', white: '#FFFFFF', text: '#1B1B1B',
  textSecondary: '#6B7280', border: '#e2e4ed', cardBg: '#eceef5', brand: BRAND,
};

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_GAP = 10;
const CARD_WIDTH = (SCREEN_WIDTH - 32 - CARD_GAP) / 2;

interface ProductCategory { id: string; name: string; sort_order: number; }
interface Product {
  id: string;
  category_id: string;
  name: string;
  price: number;
  image_path: string | null;
  in_stock: boolean;
  sort_order: number;
  product_categories: { name: string } | null;
}

function formatPrice(price: number): string {
  return `${Math.round(price)} ₴`;
}

export default function ShopScreen() {
  const router = useRouter();
  const { addItem, itemCount } = useCart();

  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [catRes, prodRes] = await Promise.all([
          supabase.from('product_categories').select('*').order('sort_order'),
          supabase.from('products').select('*, product_categories(name)').eq('in_stock', true).order('sort_order'),
        ]);
        if (catRes.error) console.error('Categories error:', catRes.error.message);
        if (prodRes.error) console.error('Products error:', prodRes.error.message);
        if (catRes.data) setCategories(catRes.data);
        if (prodRes.data) setProducts(prodRes.data);
      } catch (err) {
        console.error('Shop load error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = selectedCat ? products.filter((p) => p.category_id === selectedCat) : products;
  const allCats: { id: string | null; name: string }[] = [{ id: null, name: 'Всі' }, ...categories];

  const handleAddToCart = (product: Product) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      image_path: product.image_path,
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Товари</Text>
        </View>
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={COLORS.brand} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Товари</Text>
          <Text style={styles.subtitle}>Продукція Dezik</Text>
        </View>
        <TouchableOpacity style={styles.cartHeaderBtn} onPress={() => router.push('/cart' as any)} activeOpacity={0.7}>
          <Ionicons name="cart-outline" size={24} color={COLORS.brand} />
          {itemCount > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{itemCount > 99 ? '99+' : itemCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        data={allCats}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id ?? 'all'}
        contentContainerStyle={styles.catList}
        renderItem={({ item }) => {
          const active = selectedCat === item.id;
          const count = item.id ? products.filter((p) => p.category_id === item.id).length : products.length;
          return (
            <TouchableOpacity style={[styles.catPill, active && styles.catPillActive]} onPress={() => setSelectedCat(item.id)} activeOpacity={0.8}>
              <Text style={[styles.catPillText, active && styles.catPillTextActive]}>{item.name} ({count})</Text>
            </TouchableOpacity>
          );
        }}
      />

      <FlatList
        data={filtered}
        numColumns={2}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        columnWrapperStyle={{ gap: CARD_GAP }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: CARD_GAP }}
        renderItem={({ item }) => (
          <View style={styles.productCard}>
            {item.image_path ? (
              <Image source={{ uri: item.image_path }} style={styles.productImage} resizeMode="cover" />
            ) : (
              <View style={[styles.productImage, styles.placeholder]}>
                <Ionicons name="cube-outline" size={32} color={COLORS.textSecondary} />
              </View>
            )}
            <View style={styles.productInfo}>
              <Text style={styles.productCategory}>{item.product_categories?.name ?? ''}</Text>
              <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
              <View style={styles.productBottom}>
                <Text style={styles.productPrice}>{formatPrice(item.price)}</Text>
                <TouchableOpacity style={styles.cartBtn} onPress={() => handleAddToCart(item)} activeOpacity={0.8}>
                  <Ionicons name="cart" size={16} color={COLORS.white} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Товарів не знайдено</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.text },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 2 },
  cartHeaderBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  cartBadge: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#E53935', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  cartBadgeText: { fontSize: 10, fontWeight: '700', color: COLORS.white },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  catList: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  catPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 40, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border },
  catPillActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  catPillText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  catPillTextActive: { color: COLORS.white },
  productCard: { width: CARD_WIDTH, backgroundColor: COLORS.white, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  productImage: { width: '100%', height: CARD_WIDTH * 0.85, backgroundColor: COLORS.cardBg },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  productInfo: { padding: 10, flex: 1, justifyContent: 'space-between' },
  productCategory: { fontSize: 10, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4 },
  productName: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginTop: 4, lineHeight: 17 },
  productBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  productPrice: { fontSize: 14, fontWeight: '700', color: COLORS.brand },
  cartBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyText: { fontSize: 15, color: COLORS.textSecondary },
});
