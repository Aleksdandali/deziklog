import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
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

const { width: SW, height: SH } = Dimensions.get('window');
const BRAND = '#4b569e';

function PulseDot({ delay }: { delay: number }) {
  const anim = useSharedValue(0);

  useEffect(() => {
    anim.value = withDelay(2000 + delay, withRepeat(
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
  const lottieRef = useRef<LottieView>(null);
  const dotsOpacity = useSharedValue(0);

  useEffect(() => {
    // Force play in case autoPlay doesn't trigger on some devices
    lottieRef.current?.play();
    dotsOpacity.value = withDelay(2000, withTiming(1, { duration: 400 }));
  }, []);

  const dotsStyle = useAnimatedStyle(() => ({
    opacity: dotsOpacity.value,
  }));

  return (
    <View style={st.container}>
      <LottieView
        ref={lottieRef}
        source={require('../assets/animations/dezik_star_loader.json')}
        autoPlay
        loop
        style={st.lottie}
      />

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
    width: SW * 0.8,
    height: SW * 0.8,
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
