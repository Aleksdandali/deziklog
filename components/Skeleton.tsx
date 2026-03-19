import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle } from 'react-native';
import { COLORS } from '../lib/constants';

interface SkeletonProps {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export default function Skeleton({ width, height, borderRadius = 8, style }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius, backgroundColor: COLORS.border, opacity },
        style,
      ]}
    />
  );
}

/** Common skeleton layouts */
export function SkeletonCard({ style }: { style?: ViewStyle }) {
  return (
    <View style={[sk.card, style]}>
      <Skeleton width="100%" height={12} borderRadius={6} />
      <Skeleton width="60%" height={12} borderRadius={6} style={{ marginTop: 10 }} />
      <Skeleton width="40%" height={10} borderRadius={5} style={{ marginTop: 10 }} />
    </View>
  );
}

export function SkeletonProductCard({ width }: { width: number }) {
  return (
    <View style={[sk.productCard, { width }]}>
      <Skeleton width={width} height={width} borderRadius={0} />
      <View style={{ padding: 12 }}>
        <Skeleton width={50} height={10} borderRadius={5} />
        <Skeleton width="90%" height={12} borderRadius={6} style={{ marginTop: 8 }} />
        <Skeleton width="50%" height={12} borderRadius={6} style={{ marginTop: 6 }} />
        <Skeleton width="40%" height={16} borderRadius={6} style={{ marginTop: 12 }} />
        <Skeleton width="100%" height={40} borderRadius={12} style={{ marginTop: 12 }} />
      </View>
    </View>
  );
}

export function SkeletonEntryCard() {
  return (
    <View style={sk.entryCard}>
      <Skeleton width={36} height={36} borderRadius={18} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Skeleton width="70%" height={12} borderRadius={6} />
        <Skeleton width="50%" height={10} borderRadius={5} style={{ marginTop: 6 }} />
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Skeleton width={40} height={14} borderRadius={6} />
        <Skeleton width={30} height={10} borderRadius={5} style={{ marginTop: 4 }} />
      </View>
    </View>
  );
}

const sk = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  productCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
});
