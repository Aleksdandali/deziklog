import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ChevronRight, Package, Droplets, FlaskConical, Wrench, Thermometer, Hand } from 'lucide-react-native';
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

interface CatalogItemProps {
  product: CatalogProduct;
  onPress?: () => void;
}

export function CatalogItem({ product, onPress }: CatalogItemProps) {
  const IconComponent = ICON_MAP[product.icon] || Package;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className="bg-white rounded-2xl p-4 mb-3 shadow-sm flex-row items-center gap-3"
    >
      <View className="w-12 h-12 rounded-xl bg-primary-light items-center justify-center flex-shrink-0">
        <IconComponent size={22} color={COLORS.primary} />
      </View>
      <View className="flex-1">
        <Text className="text-xs font-medium text-primary mb-0.5">{product.category}</Text>
        <Text className="text-base font-semibold text-[#1B1B1B]">{product.title}</Text>
        {product.priceRange ? (
          <Text className="text-sm text-text-secondary mt-0.5">{product.priceRange}</Text>
        ) : null}
      </View>
      <ChevronRight size={18} color={COLORS.textSecondary} />
    </TouchableOpacity>
  );
}
