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

// ── Animated letter component ────────────────────────────
function AnimatedLetter({ char, delay }: { char: string; delay: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: interpolate(progress.value, [0, 1], [20, 0]) }],
  }));

  return (
    <Animated.Text style={[st.letter, style]}>
      {char}
    </Animated.Text>
  );
}

// ── Animated dot component ───────────────────────────────
function PulseDot({ delay }: { delay: number }) {
  const anim = useSharedValue(0);

  useEffect(() => {
    anim.value = withDelay(1400 + delay, withRepeat(
      withSequence(
        withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 500, easing: Easing.inOut(Easing.ease) }),
      ), -1, true
    ));
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(anim.value, [0, 1], [0.2, 1]),
    transform: [{ scale: interpolate(anim.value, [0, 1], [0.8, 1.2]) }],
  }));

  return <Animated.View style={[st.dot, style]} />;
}

// ── Main splash ──────────────────────────────────────────
export default function AnimatedSplash() {
  const starScale = useSharedValue(0);
  const starRotate = useSharedValue(0);
  const starGlow = useSharedValue(0);
  const subtitleOpacity = useSharedValue(0);
  const dotsOpacity = useSharedValue(0);

  useEffect(() => {
    // Star
    starScale.value = withDelay(200, withTiming(1, { duration: 700, easing: Easing.out(Easing.back(1.5)) }));
    starRotate.value = withDelay(200, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
    starGlow.value = withDelay(800, withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      ), -1, true
    ));

    // Subtitle + dots
    subtitleOpacity.value = withDelay(1100, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));
    dotsOpacity.value = withDelay(1400, withTiming(1, { duration: 400 }));
  }, []);

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

  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
    transform: [{ translateY: interpolate(subtitleOpacity.value, [0, 1], [8, 0]) }],
  }));

  const dotsContainerStyle = useAnimatedStyle(() => ({
    opacity: dotsOpacity.value,
  }));

  return (
    <View style={st.container}>
      {/* Star with glow */}
      <View style={st.starArea}>
        <Animated.View style={[st.starGlow, starGlowStyle]} />
        <Animated.View style={[st.starWrap, starStyle]}>
          <View style={[st.starBar, { transform: [{ rotate: '0deg' }] }]} />
          <View style={[st.starBar, { transform: [{ rotate: '60deg' }] }]} />
          <View style={[st.starBar, { transform: [{ rotate: '120deg' }] }]} />
        </Animated.View>
      </View>

      {/* DEZIK letters — each is its own component with proper hooks */}
      <View style={st.wordRow}>
        <AnimatedLetter char="D" delay={500} />
        <AnimatedLetter char="E" delay={580} />
        <AnimatedLetter char="Z" delay={660} />
        <AnimatedLetter char="I" delay={740} />
        <AnimatedLetter char="K" delay={820} />
      </View>

      {/* SteriLOG subtitle */}
      <Animated.Text style={[st.subtitle, subtitleStyle]}>
        SteriLOG
      </Animated.Text>

      {/* Loading dots — each is its own component */}
      <Animated.View style={[st.dotsRow, dotsContainerStyle]}>
        <PulseDot delay={0} />
        <PulseDot delay={150} />
        <PulseDot delay={300} />
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
  starWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starBar: {
    position: 'absolute',
    width: 48 * 0.22,
    height: 48,
    borderRadius: 48 * 0.11,
    backgroundColor: BRAND,
  },
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
  subtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND,
    letterSpacing: 6,
    textTransform: 'uppercase',
    marginTop: 4,
  },
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
