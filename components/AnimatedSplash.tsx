import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
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
import Svg, { Path } from 'react-native-svg';

const BRAND_BLUE = '#4b569e';

const AnimatedSvg = Animated.createAnimatedComponent(View);

/**
 * Dezik asterisk (6-arm star) — matches the logo precisely.
 */
function DezikAsterisk({ size, color }: { size: number; color: string }) {
  const half = size / 2;
  const armW = size * 0.13;
  const armH = size * 0.44;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {[0, 60, 120].map((angle) => (
        <Path
          key={angle}
          d={`M${half - armW / 2},${half - armH} L${half + armW / 2},${half - armH} L${half + armW / 2},${half + armH} L${half - armW / 2},${half + armH} Z`}
          fill={color}
          transform={`rotate(${angle}, ${half}, ${half})`}
        />
      ))}
    </Svg>
  );
}

export default function AnimatedSplash() {
  // Asterisk rotation — slow, elegant
  const rotation = useSharedValue(0);
  // Fade + scale for the whole logo
  const appear = useSharedValue(0);
  // Subtle pulse for asterisk
  const pulse = useSharedValue(1);

  useEffect(() => {
    // Fade in
    appear.value = withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) });

    // Slow rotation
    rotation.value = withDelay(
      400,
      withRepeat(
        withTiming(360, { duration: 8000, easing: Easing.linear }),
        -1,
        false,
      ),
    );

    // Gentle pulse
    pulse.value = withDelay(
      800,
      withRepeat(
        withSequence(
          withTiming(1.08, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: appear.value,
    transform: [
      { scale: interpolate(appear.value, [0, 1], [0.9, 1]) },
    ],
  }));

  const asteriskStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${rotation.value}deg` },
      { scale: pulse.value },
    ],
  }));

  return (
    <View style={st.container}>
      <Animated.View style={[st.content, containerStyle]}>
        {/* Asterisk */}
        <Animated.View style={[st.asteriskWrap, asteriskStyle]}>
          <DezikAsterisk size={52} color={BRAND_BLUE} />
        </Animated.View>

        {/* Wordmark */}
        <Text style={st.wordmark}>DEZIK</Text>

        {/* Tagline */}
        <Text style={st.tagline}>стерилізація · дезінфекція</Text>
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
  },
  asteriskWrap: {
    marginBottom: 20,
  },
  wordmark: {
    fontSize: 38,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 6,
    fontStyle: 'italic',
  },
  tagline: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 3,
    marginTop: 10,
    textTransform: 'uppercase',
  },
});
