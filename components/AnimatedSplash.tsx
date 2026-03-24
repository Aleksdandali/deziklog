import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, Image } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_W } = Dimensions.get('window');
const BRAND = '#5561AA';

function Particle({ left, top, size, duration, delay }: { left: string; top: string; size: number; duration: number; delay: number }) {
  const anim = useSharedValue(0);

  useEffect(() => {
    anim.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration, easing: Easing.linear }),
        -1,
        false,
      ),
    );
  }, []);

  const style = useAnimatedStyle(() => {
    const progress = anim.value;
    return {
      opacity: interpolate(progress, [0, 0.15, 0.85, 1], [0, 1, 1, 0]),
      transform: [
        { translateY: interpolate(progress, [0, 0.5, 1], [0, -50, 0]) },
        { scale: interpolate(progress, [0, 0.15, 0.85, 1], [0, 1, 1, 0]) },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: left as any,
          top: top as any,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: `rgba(85,97,170,0.1)`,
        },
        style,
      ]}
    />
  );
}

function ProgressBar() {
  const slide = useSharedValue(-1);

  useEffect(() => {
    slide.value = withRepeat(
      withTiming(2, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
  }, []);

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slide.value * 80 }],
  }));

  return (
    <View style={st.progressTrack}>
      <Animated.View style={[st.progressFill, barStyle]}>
        <LinearGradient
          colors={['transparent', BRAND, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

function PulseDot({ delay }: { delay: number }) {
  const anim = useSharedValue(0);

  useEffect(() => {
    anim.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 480, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 720, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(anim.value, [0, 1], [0.2, 1]),
    transform: [{ scale: interpolate(anim.value, [0, 1], [1, 1.5]) }],
  }));

  return <Animated.View style={[st.dot, style]} />;
}

export default function AnimatedSplash() {
  const logoAppear = useSharedValue(0);
  const loaderAppear = useSharedValue(0);
  const welcomeAppear = useSharedValue(0);

  useEffect(() => {
    logoAppear.value = withDelay(300, withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) }));
    loaderAppear.value = withDelay(1200, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));
    welcomeAppear.value = withDelay(1600, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoAppear.value,
    transform: [{ translateY: interpolate(logoAppear.value, [0, 1], [10, 0]) }],
  }));

  const loaderStyle = useAnimatedStyle(() => ({
    opacity: loaderAppear.value,
    transform: [{ translateY: interpolate(loaderAppear.value, [0, 1], [10, 0]) }],
  }));

  const welcomeStyle = useAnimatedStyle(() => ({
    opacity: welcomeAppear.value,
    transform: [{ translateY: interpolate(welcomeAppear.value, [0, 1], [10, 0]) }],
  }));

  return (
    <View style={st.container}>
      {/* Particles */}
      <Particle left="10%" top="18%" size={4} duration={8000} delay={0} />
      <Particle left="88%" top="30%" size={3} duration={10000} delay={1000} />
      <Particle left="35%" top="80%" size={5} duration={7000} delay={2000} />
      <Particle left="75%" top="12%" size={3} duration={9000} delay={500} />
      <Particle left="20%" top="65%" size={4} duration={11000} delay={1500} />

      <View style={st.scene}>
        {/* Logo */}
        <Animated.View style={[st.logoWrap, logoStyle]}>
          <Image
            source={require('../assets/images/splash-icon.png')}
            style={st.logoImg}
            resizeMode="contain"
          />
        </Animated.View>

        {/* Loader */}
        <Animated.View style={[st.loaderBottom, loaderStyle]}>
          <ProgressBar />
          <View style={st.dots}>
            <PulseDot delay={0} />
            <PulseDot delay={200} />
            <PulseDot delay={400} />
          </View>
          <Text style={st.subtitle}>SteriLog</Text>
        </Animated.View>

        {/* Welcome */}
        <Animated.View style={welcomeStyle}>
          <Text style={st.welcomeText}>Вітаємо — ви відповідальний майстер</Text>
        </Animated.View>
      </View>
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
  scene: {
    alignItems: 'center',
  },
  logoWrap: {
    alignItems: 'center',
  },
  logoImg: {
    width: Math.min(SCREEN_W * 0.6, 260),
    height: Math.min(SCREEN_W * 0.25, 100),
  },
  loaderBottom: {
    marginTop: -20,
    alignItems: 'center',
    gap: 14,
  },
  progressTrack: {
    width: 160,
    height: 2,
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    width: 80,
    height: '100%',
    borderRadius: 2,
  },
  dots: {
    flexDirection: 'row',
    gap: 7,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: BRAND,
  },
  subtitle: {
    fontSize: 10,
    letterSpacing: 5,
    textTransform: 'uppercase',
    color: `rgba(85,97,170,0.4)`,
    fontWeight: '600',
  },
  welcomeText: {
    marginTop: 4,
    fontSize: 14,
    color: 'rgba(0,0,0,0.45)',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
});
