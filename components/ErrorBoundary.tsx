import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../lib/constants';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (__DEV__) console.error('[ErrorBoundary]', error.message, info.componentStack);
  }

  handleRestart = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={s.container}>
          <View style={s.content}>
            <View style={s.icon}>
              <Feather name="alert-triangle" size={48} color={COLORS.danger} />
            </View>
            <Text style={s.title}>Щось пішло не так</Text>
            <Text style={s.text}>Спробуйте перезапустити додаток</Text>
            {__DEV__ && this.state.error && (
              <Text style={s.debug}>{this.state.error.message}</Text>
            )}
            <TouchableOpacity style={s.btn} onPress={this.handleRestart} activeOpacity={0.85}>
              <Feather name="refresh-cw" size={18} color={COLORS.white} />
              <Text style={s.btnText}>Перезапустити</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  icon: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#FFF5F5', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  text: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 24 },
  debug: { fontSize: 11, color: COLORS.danger, textAlign: 'center', marginBottom: 16, fontFamily: 'monospace' },
  btn: { flexDirection: 'row', height: 52, borderRadius: 14, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 32 },
  btnText: { fontSize: 16, fontWeight: '700', color: COLORS.white },
});
