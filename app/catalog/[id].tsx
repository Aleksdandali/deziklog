import React from 'react';
import {
  View,
  Text,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, ShoppingCart, Plus, Package, Droplets, FlaskConical, Wrench, Thermometer, Hand } from 'lucide-react-native';

import catalogData from '@/data/catalog.json';
import { COLORS } from '@/lib/constants';
import type { CatalogProduct } from '@/lib/types';

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Package,
  Droplets,
  FlaskConical,
  Wrench,
  Thermometer,
  Hand,
};

export default function CatalogDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const product = (catalogData as CatalogProduct[]).find((p) => p.id === id);

  if (!product) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center">
        <Text className="text-text-secondary">Товар не знайдено</Text>
      </SafeAreaView>
    );
  }

  const IconComponent = ICON_MAP[product.icon] || Package;

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {/* Header */}
      <View className="flex-row items-center gap-3 px-4 pt-4 pb-2">
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-9 h-9 rounded-full bg-white items-center justify-center shadow-sm"
          activeOpacity={0.8}
        >
          <ChevronLeft size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-[#1B1B1B] flex-1" numberOfLines={1}>
          {product.title}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Product header */}
        <View className="bg-white rounded-2xl p-5 mb-4 items-center">
          <View className="w-20 h-20 rounded-2xl bg-primary-light items-center justify-center mb-4">
            <IconComponent size={36} color={COLORS.primary} />
          </View>
          <Text className="text-xs font-semibold text-primary mb-1">{product.category}</Text>
          <Text className="text-xl font-bold text-[#1B1B1B] text-center mb-2">{product.title}</Text>
          {product.priceRange ? (
            <View className="bg-primary-light rounded-full px-4 py-1.5">
              <Text className="text-sm font-semibold text-primary">{product.priceRange}</Text>
            </View>
          ) : null}
        </View>

        {/* Description */}
        <View className="bg-white rounded-2xl p-4 mb-4">
          <Text className="text-base font-semibold text-[#1B1B1B] mb-3">Опис</Text>
          <Text className="text-sm text-text-secondary leading-6">{product.description}</Text>
        </View>

        {/* CTA: Buy */}
        <TouchableOpacity
          onPress={() => Linking.openURL(product.buyUrl)}
          className="bg-primary rounded-2xl h-14 flex-row items-center justify-center gap-2 mb-3 shadow-sm"
          activeOpacity={0.85}
          style={{
            shadowColor: COLORS.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 8,
            elevation: 4,
          }}
        >
          <ShoppingCart size={20} color={COLORS.white} />
          <Text className="text-base font-bold text-white">Купити на dezik.com.ua</Text>
        </TouchableOpacity>

        {/* CTA: Record sterilization (замикання каталог → стерилізація) */}
        <TouchableOpacity
          onPress={() => router.push('/new-cycle')}
          className="border border-primary bg-transparent rounded-2xl h-14 flex-row items-center justify-center gap-2"
          activeOpacity={0.85}
        >
          <Plus size={18} color={COLORS.primary} />
          <Text className="text-base font-semibold text-primary">Записати стерилізацію</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
