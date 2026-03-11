import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet, SafeAreaView, TouchableOpacity, Image, Linking, Dimensions } from 'react-native';
import { ShoppingCart } from 'lucide-react-native';
import { COLORS } from '@/lib/constants';
import { PRODUCTS, CATEGORIES, formatPrice } from '@/data/products';
import type { Product } from '@/lib/types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_GAP = 10;
const CARD_WIDTH = (SCREEN_WIDTH - 32 - CARD_GAP) / 2;

function getCategoryCount(cat: string): number {
  if (cat === 'Всі') return PRODUCTS.length;
  return PRODUCTS.filter((p) => p.category === cat).length;
}

export default function ShopScreen() {
  const [category, setCategory] = useState<string>('Всі');

  const filtered = category === 'Всі' ? PRODUCTS : PRODUCTS.filter((p) => p.category === category);

  const handleBuy = (product: Product) => {
    const url = product.siteUrl || 'https://dezik.com.ua';
    Linking.openURL(url);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Товари</Text>
        <Text style={styles.subtitle}>Продукція Dezik</Text>
      </View>

      {/* Categories */}
      <FlatList
        data={CATEGORIES as unknown as string[]}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.catList}
        renderItem={({ item }) => {
          const active = category === item;
          return (
            <TouchableOpacity
              style={[styles.catPill, active && styles.catPillActive]}
              onPress={() => setCategory(item)}
              activeOpacity={0.8}
            >
              <Text style={[styles.catPillText, active && styles.catPillTextActive]}>
                {item} ({getCategoryCount(item)})
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      {/* Products grid */}
      <FlatList
        data={filtered}
        numColumns={2}
        keyExtractor={(item) => String(item.id)}
        showsVerticalScrollIndicator={false}
        columnWrapperStyle={{ gap: CARD_GAP }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: CARD_GAP }}
        renderItem={({ item }) => (
          <View style={styles.productCard}>
            <Image source={{ uri: item.imageUrl }} style={styles.productImage} resizeMode="cover" />
            <View style={styles.productInfo}>
              <Text style={styles.productCategory}>{item.category}</Text>
              <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
              <View style={styles.productBottom}>
                <Text style={styles.productPrice}>{formatPrice(item.price)}</Text>
                <TouchableOpacity style={styles.cartBtn} onPress={() => handleBuy(item)} activeOpacity={0.8}>
                  <ShoppingCart size={16} color={COLORS.white} strokeWidth={2} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.text },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 2 },
  catList: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  catPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 40,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  catPillActive: {
    backgroundColor: COLORS.brand,
    borderColor: COLORS.brand,
  },
  catPillText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  catPillTextActive: { color: COLORS.white },
  productCard: {
    width: CARD_WIDTH,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  productImage: {
    width: '100%',
    height: CARD_WIDTH * 0.85,
    backgroundColor: COLORS.cardBg,
  },
  productInfo: { padding: 10, flex: 1, justifyContent: 'space-between' },
  productCategory: { fontSize: 10, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4 },
  productName: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginTop: 4, lineHeight: 17 },
  productBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  productPrice: { fontSize: 14, fontWeight: '700', color: COLORS.brand },
  cartBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
