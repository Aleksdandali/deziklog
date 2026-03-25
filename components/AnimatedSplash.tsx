import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import LottieView from 'lottie-react-native';

export default function AnimatedSplash() {
  const onRef = useCallback((ref: LottieView | null) => {
    ref?.play();
  }, []);

  return (
    <View style={st.container}>
      <LottieView
        ref={onRef}
        source={require('../assets/animations/dezik_star_loader.json')}
        autoPlay
        loop
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
