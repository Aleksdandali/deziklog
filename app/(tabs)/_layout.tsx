import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { Home, BookOpen, ShoppingBag, Droplet, User } from 'lucide-react-native';
import { COLORS, FONT } from '@/lib/constants';
import { useAuth } from '@/lib/auth-context';

type TabIconProps = { color: string; size: number };

export default function TabLayout() {
  const { session } = useAuth();
  // App Review 5.1.1(v): guests browse the shop without registration. The
  // account-based tabs (journal, solutions, home stats, profile) stay
  // sign-in-only — `href: null` removes them from the bar and from deep
  // links, and with a single remaining tab the bar itself is hidden.
  const isGuest = !session;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.brand,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarStyle: isGuest ? styles.tabBarHidden : styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIconStyle: { marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Головна',
          href: isGuest ? null : undefined,
          tabBarIcon: ({ color, size }: TabIconProps) => <Home size={size} color={color} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen
        name="journal"
        options={{
          title: 'Журнал',
          href: isGuest ? null : undefined,
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
          href: isGuest ? null : undefined,
          tabBarIcon: ({ color, size }: TabIconProps) => <Droplet size={size} color={color} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Кабінет',
          href: isGuest ? null : undefined,
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
  tabBarHidden: {
    display: 'none',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
    fontFamily: FONT.medium,
    marginTop: 2,
    letterSpacing: 0.1,
  },
});
