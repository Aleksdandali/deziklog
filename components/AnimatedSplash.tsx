import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  withRepeat,
  Easing,
  interpolate,
} from 'react-native-reanimated';

const { width: SW } = Dimensions.get('window');
const BRAND = '#4b569e';
const BRAND_LIGHT = '#6b78c4';

// ── Star shape (6-pointed asterisk) ──────────────────────
function Star({ size, color, style }: { size: number; color: string; style?: any }) {
  const bar = { position: 'absolute' as const, width: size * 0.22, height: size, borderRadius: size * 0.11, backgroundColor: color };
  return (
    <Animated.View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <View style={[bar, { transform: [{ rotate: '0deg' }] }]} />
      <View style={[bar, { transform: [{ rotate: '60deg' }] }]} />
      <View style={[bar, { transform: [{ rotate: '120deg' }] }]} />
    </Animated.View>
  );
}

// ── Letters ──────────────────────────────────────────────
const DEZIK = ['D', 'E', 'Z', 'I', 'K'];
const STERILOG = 'SteriLOG';

export default function AnimatedSplash() {
  // Star
  const starScale = useSharedValue(0);
  const starRotate = useSharedValue(0);
  const starGlow = useSharedValue(0);

  // Letters
  const letterValues = DEZIK.map(() => useSharedValue(0));
  const subtitleOpacity = useSharedValue(0);

  // Loading dots
  const dotsOpacity = useSharedValue(0);
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);
  const dot3 = useSharedValue(0);

  useEffect(() => {
    // Star appears with spring-like feel
    starScale.value = withDelay(200, withTiming(1, { duration: 700, easing: Easing.out(Easing.back(1.5)) }));
    starRotate.value = withDelay(200, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
    starGlow.value = withDelay(800, withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      ), -1, true
    ));

    // Letters stagger in
    DEZIK.forEach((_, i) => {
      letterValues[i].value = withDelay(500 + i * 80, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
    });

    // Subtitle
    subtitleOpacity.value = withDelay(1100, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));

    // Loading dots
    dotsOpacity.value = withDelay(1400, withTiming(1, { duration: 400 }));
    const dotAnim = (delay: number) => withDelay(1400 + delay, withRepeat(
      withSequence(
        withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 500, easing: Easing.inOut(Easing.ease) }),
      ), -1, true
    ));
    dot1.value = dotAnim(0);
    dot2.value = dotAnim(150);
    dot3.value = dotAnim(300);
  }, []);

  // ── Animated styles ───────────────────────────────────
  const starStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: starScale.value },
      { rotate: `${interpolate(starRotate.value, [0, 1], [-90, 0])}deg` },
    ],
    opacity: starScale.value,
  }));

  const starGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(starGlow.value, [0, 1], [0, 0.3]),
    transform: [{ scale: interpolate(starGlow.value, [0, 1], [1, 1.6]) }],
  }));

  const letterStyles = letterValues.map((v) =>
    useAnimatedStyle(() => ({
      opacity: v.value,
      transform: [
        { translateY: interpolate(v.value, [0, 1], [20, 0]) },
      ],
    }))
  );

  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
    transform: [{ translateY: interpolate(subtitleOpacity.value, [0, 1], [8, 0]) }],
  }));

  const dotsContainerStyle = useAnimatedStyle(() => ({
    opacity: dotsOpacity.value,
  }));

  const dotStyle = (v: Animated.SharedValue<number>) =>
    useAnimatedStyle(() => ({
      opacity: interpolate(v.value, [0, 1], [0.2, 1]),
      transform: [{ scale: interpolate(v.value, [0, 1], [0.8, 1.2]) }],
    }));

  const dot1Style = dotStyle(dot1);
  const dot2Style = dotStyle(dot2);
  const dot3Style = dotStyle(dot3);

  return (
    <View style={st.container}>
      {/* Star with glow */}
      <View style={st.starArea}>
        <Animated.View style={[st.starGlow, starGlowStyle]} />
        <Star size={48} color={BRAND} style={starStyle} />
      </View>

      {/* DEZIK letters */}
      <View style={st.wordRow}>
        {DEZIK.map((letter, i) => (
          <Animated.Text key={i} style={[st.letter, letterStyles[i]]}>
            {letter}
          </Animated.Text>
        ))}
      </View>

      {/* SteriLOG subtitle */}
      <Animated.Text style={[st.subtitle, subtitleStyle]}>
        {STERILOG}
      </Animated.Text>

      {/* Loading dots */}
      <Animated.View style={[st.dotsRow, dotsContainerStyle]}>
        <Animated.View style={[st.dot, dot1Style]} />
        <Animated.View style={[st.dot, dot2Style]} />
        <Animated.View style={[st.dot, dot3Style]} />
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Star
  starArea: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  starGlow: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: BRAND_LIGHT,
  },

  // DEZIK
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  letter: {
    fontSize: Math.min(SW * 0.13, 56),
    fontWeight: '900',
    color: '#1a1a1a',
    letterSpacing: 2,
    fontStyle: 'italic',
  },

  // SteriLOG
  subtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND,
    letterSpacing: 6,
    textTransform: 'uppercase',
    marginTop: 4,
  },

  // Dots
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 40,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: BRAND,
  },
});
