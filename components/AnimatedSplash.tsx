import React from 'react';
import { View, StyleSheet } from 'react-native';
import LottieView from 'lottie-react-native';

export default function AnimatedSplash() {
  return (
    <View style={st.container}>
      <LottieView
        source={require('../assets/animations/dezik_star_loader.json')}
        autoPlay
        loop
        style={st.animation}
      />
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
  animation: {
    width: 390,
    height: 844,
  },
});
