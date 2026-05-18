import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import LottieView from 'lottie-react-native';

/**
 * Full-screen one-shot intro splash. Played once per cold start (gated in
 * RootNavigator via a module-level flag). The Lottie file is a 390×844
 * vertical composition designed to fill the screen; we use resizeMode="cover"
 * so it scales naturally to any device.
 *
 * SOFTWARE renderMode on Android keeps it consistent with AnimatedSplash —
 * works around a HW-accel skia crash seen on some devices.
 */
export default function IntroSplash() {
  return (
    <View style={st.container}>
      <LottieView
        source={require('../assets/animations/dezik_intro.json')}
        autoPlay
        loop={false}
        renderMode={Platform.OS === 'android' ? 'SOFTWARE' : 'HARDWARE'}
        resizeMode="cover"
        style={st.lottie}
      />
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  lottie: { flex: 1, width: '100%' },
});
