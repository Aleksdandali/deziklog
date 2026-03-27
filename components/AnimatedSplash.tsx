import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import LottieView from 'lottie-react-native';
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

function PulseDot({ delay }: { delay: number }) {
  const anim = useSharedValue(0);

  useEffect(() => {
    anim.value = withDelay(1200 + delay, withRepeat(
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

export default function AnimatedSplash() {
  const textOpacity = useSharedValue(0);
  const dotsOpacity = useSharedValue(0);

  useEffect(() => {
    textOpacity.value = withDelay(600, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
    dotsOpacity.value = withDelay(1200, withTiming(1, { duration: 400 }));
  }, []);

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ translateY: interpolate(textOpacity.value, [0, 1], [10, 0]) }],
  }));

  const dotsStyle = useAnimatedStyle(() => ({
    opacity: dotsOpacity.value,
  }));

  return (
    <View style={st.container}>
      <LottieView
        source={require('../assets/animations/dezik_star_loader.json')}
        autoPlay
        loop
        style={st.lottie}
      />

      <Animated.View style={[st.textWrap, textStyle]}>
        <Text style={st.title}>DEZIK</Text>
        <Text style={st.subtitle}>SteriLOG</Text>
      </Animated.View>

      <Animated.View style={[st.dotsRow, dotsStyle]}>
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
  lottie: {
    width: 120,
    height: 120,
  },
  textWrap: {
    alignItems: 'center',
    marginTop: 12,
  },
  title: {
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
