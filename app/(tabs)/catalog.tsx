import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';

import { getSmartSuggestion } from '@/lib/db';
import catalogData from '@/data/catalog.json';
import type { CatalogProduct } from '@/lib/types';

import { CatalogItem } from '@/components/CatalogItem';
import { SmartSuggestion } from '@/components/SmartSuggestion';

export default function CatalogScreen() {
  const router = useRouter();
  const products = catalogData as CatalogProduct[];
  const [suggestion, setSuggestion] = useState<{ type: string; message: string; buyUrl: string } | null>(null);

  useEffect(() => {
    setSuggestion(getSmartSuggestion());
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <CatalogItem
            product={item}
            onPress={() => router.push(`/catalog/${item.id}`)}
          />
        )}
        ListHeaderComponent={
          <View className="pt-4 pb-2">
            <Text className="text-2xl font-bold text-[#1B1B1B]">Матеріали</Text>
            <Text className="text-sm text-text-secondary mt-1">
              Засоби та обладнання DEZIK
            </Text>
          </View>
        }
        ListFooterComponent={
          suggestion ? (
            <View className="mt-2 mb-4">
              <SmartSuggestion message={suggestion.message} buyUrl={suggestion.buyUrl} />
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}
