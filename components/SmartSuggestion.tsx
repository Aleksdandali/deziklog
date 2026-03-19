import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../lib/constants';

interface SmartSuggestionProps {
  monthSessionCount: number;
}

export default function SmartSuggestion({ monthSessionCount }: SmartSuggestionProps) {
  if (monthSessionCount < 20) return null;

  const estimatedPacks = monthSessionCount;

  return (
    <TouchableOpacity
      style={styles.banner}
      activeOpacity={0.85}
      onPress={() => Linking.openURL('https://dezik.com.ua')}
    >
      <View style={styles.iconWrap}>
        <Feather name="shopping-bag" size={20} color={COLORS.brand} />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>Час поповнити запаси</Text>
        <Text style={styles.text}>
          Ви використали ~{estimatedPacks} пакетів цього місяця. Замовте на dezik.com.ua
        </Text>
      </View>
      <Feather name="external-link" size={16} color={COLORS.textSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.white, borderRadius: 14, borderWidth: 1,
    borderColor: COLORS.border, padding: 14, marginBottom: 12,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS.cardBg,
    alignItems: 'center', justifyContent: 'center',
  },
  content: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  text: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2, lineHeight: 17 },
});
