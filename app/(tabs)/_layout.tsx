import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { Home, ClipboardList, ShoppingBag, Droplets, User } from 'lucide-react-native';
import { COLORS } from '@/lib/constants';

type TabIconProps = { color: string; size: number };

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.brand,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIconStyle: { marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Головна',
          tabBarIcon: ({ color, size }: TabIconProps) => <Home size={size} color={color} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen
        name="journal"
        options={{
          title: 'Журнал',
          tabBarIcon: ({ color, size }: TabIconProps) => <ClipboardList size={size} color={color} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen
        name="shop"
        options={{
          title: 'Товари',
          tabBarIcon: ({ color, size }: TabIconProps) => <ShoppingBag size={size} color={color} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen
        name="solutions"
        options={{
          title: 'Розчини',
          tabBarIcon: ({ color, size }: TabIconProps) => <Droplets size={size} color={color} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Кабінет',
          tabBarIcon: ({ color, size }: TabIconProps) => <User size={size} color={color} strokeWidth={1.8} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: COLORS.white,
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    height: Platform.OS === 'ios' ? 88 : 64,
    paddingBottom: Platform.OS === 'ios' ? 28 : 8,
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
});
