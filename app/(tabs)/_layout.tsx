import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { Home, BookOpen, ShoppingBag, Droplet, User } from 'lucide-react-native';
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
          tabBarIcon: ({ color, size }: TabIconProps) => <BookOpen size={size} color={color} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen
        name="catalog"
        options={{
          title: 'Магазин',
          tabBarIcon: ({ color, size }: TabIconProps) => <ShoppingBag size={size} color={color} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen
        name="solutions"
        options={{
          title: 'Розчини',
          tabBarIcon: ({ color, size }: TabIconProps) => <Droplet size={size} color={color} strokeWidth={1.8} />,
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
    backgroundColor: COLORS.surface,
    borderTopColor: COLORS.borderLight,
    borderTopWidth: 1,
    height: Platform.OS === 'ios' ? 88 : 64,
    paddingBottom: Platform.OS === 'ios' ? 28 : 8,
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
    letterSpacing: 0.1,
  },
});
