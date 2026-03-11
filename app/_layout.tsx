import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="cycle/index" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="solution/add" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="cabinet/sterilizers" options={{ presentation: 'modal' }} />
        <Stack.Screen name="cabinet/instruments" options={{ presentation: 'modal' }} />
        <Stack.Screen name="cabinet/packs" options={{ presentation: 'modal' }} />
        <Stack.Screen name="cabinet/preparations" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}
