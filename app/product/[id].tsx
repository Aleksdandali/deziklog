import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Image, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { useCart } from '../../lib/cart-context';
import { COLORS } from '../../lib/constants';

interface ProductDetail {
  id: string;
  name: string;
  description: string | null;
  price: number;
  volume: string | null;
  image_path: string | null;
  in_stock: boolean;
  product_categories: { name: string } | null;
}

export default function ProductDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { addItem } = useCart();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*, product_categories(name)')
        .eq('id', id)
        .single();
      if (error) console.error('Product error:', error.message);
      setProduct(data);
      setLoading(false);
    })();
  }, [id]);

  const handleAddToCart = () => {
    if (!product) return;
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
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={COLORS.brand} />
        </View>
      </SafeAreaView>
    );
  }

  if (!product) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loader}>
          <Text style={styles.errorText}>Товар не знайдено</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{product.name}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {product.image_path ? (
          <Image source={{ uri: product.image_path }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.image, styles.placeholder]}>
            <Ionicons name="cube-outline" size={64} color={COLORS.textSecondary} />
          </View>
        )}

        <View style={styles.body}>
          {product.product_categories?.name && (
            <Text style={styles.category}>{product.product_categories.name}</Text>
          )}
          <Text style={styles.name}>{product.name}</Text>
          {product.volume && (
            <Text style={styles.volume}>{product.volume}</Text>
          )}
          <Text style={styles.price}>{Math.round(product.price)} ₴</Text>

          {product.description && (
            <View style={styles.descSection}>
              <Text style={styles.descLabel}>Опис</Text>
              <Text style={styles.descText}>{product.description}</Text>
            </View>
          )}

          {!product.in_stock && (
            <View style={styles.outOfStock}>
              <Feather name="alert-circle" size={16} color={COLORS.danger} />
              <Text style={styles.outOfStockText}>Немає в наявності</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.addBtn, !product.in_stock && { opacity: 0.4 }]}
          onPress={handleAddToCart}
          disabled={!product.in_stock}
          activeOpacity={0.85}
        >
          <Ionicons name="cart" size={20} color={COLORS.white} />
          <Text style={styles.addBtnText}>Додати в кошик</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 16, color: COLORS.textSecondary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text, flex: 1, textAlign: 'center', marginHorizontal: 12 },
  image: { width: '100%', height: 280, backgroundColor: COLORS.cardBg },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  body: { padding: 20 },
  category: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  name: { fontSize: 22, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  volume: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 12 },
  price: { fontSize: 24, fontWeight: '800', color: COLORS.brand, marginBottom: 20 },
  descSection: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 16 },
  descLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', marginBottom: 8 },
  descText: { fontSize: 14, color: COLORS.text, lineHeight: 22 },
  outOfStock: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, padding: 12, backgroundColor: '#FEF2F2', borderRadius: 12 },
  outOfStockText: { fontSize: 14, fontWeight: '600', color: COLORS.danger },
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20, borderTopWidth: 1, borderTopColor: COLORS.border },
  addBtn: { flexDirection: 'row', height: 52, borderRadius: 14, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center', gap: 8 },
  addBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.white },
});
