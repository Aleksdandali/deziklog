import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import LottieView from 'lottie-react-native';

export default function AnimatedSplash() {
  const ref = useRef<LottieView>(null);

  useEffect(() => {
    // Delay play to ensure the native view is mounted
    const t = setTimeout(() => {
      ref.current?.play(0, 148);
    }, 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={st.container}>
      <LottieView
        ref={ref}
        source={require('../assets/animations/dezik_star_loader.json')}
        loop
        speed={1}
        renderMode={Platform.OS === 'ios' ? 'SOFTWARE' : 'AUTOMATIC'}
        style={st.animation}
        resizeMode="cover"
      />
    </View>
  );
}

const st = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  animation: {
    flex: 1,
    width: '100%',
  },
});
