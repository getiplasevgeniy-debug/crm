import { Tabs } from 'expo-router';
import { Users, ArrowDownCircle, Gift, Wallet, BarChart3 } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import { useAuth } from '@/lib/auth';

export default function TabLayout() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary[500],
        tabBarInactiveTintColor: colors.neutral[400],
        tabBarStyle: {
          backgroundColor: colors.neutral[900],
          borderTopColor: colors.neutral[800],
          borderTopWidth: 1,
          paddingBottom: 4,
          paddingTop: 4,
          height: 60,
        },
        tabBarLabelStyle: {
          fontFamily: 'Inter-Medium',
          fontSize: 11,
          marginTop: 2,
        },
      }}
    >
      {isAdmin ? (
        <Tabs.Screen
          name="index"
          options={{
            title: 'Менеджеры',
            tabBarIcon: ({ size, color }) => <Users size={size} color={color} />,
          }}
        />
      ) : (
        <Tabs.Screen
          name="index"
          options={{
            title: 'Профиль',
            tabBarIcon: ({ size, color }) => <Users size={size} color={color} />,
          }}
        />
      )}
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Транзакции',
          tabBarIcon: ({ size, color }) => <ArrowDownCircle size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="bonuses"
        options={{
          title: 'Бонусы',
          tabBarIcon: ({ size, color }) => <Gift size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="salaries"
        options={{
          title: 'Зарплаты',
          tabBarIcon: ({ size, color }) => <Wallet size={size} color={color} />,
        }}
      />
      {isAdmin ? (
        <Tabs.Screen
          name="audit"
          options={{
            title: 'Аудит',
            tabBarIcon: ({ size, color }) => <BarChart3 size={size} color={color} />,
          }}
        />
      ) : (
        <Tabs.Screen
          name="audit"
          options={{ href: null }}
        />
      )}
    </Tabs>
  );
}
