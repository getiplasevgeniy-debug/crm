import { ReactNode, useState } from 'react';
import { Modal, Pressable, ScrollView, View, StyleSheet, SafeAreaView, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { BarChart3, Bell, Gift, LineChart, Menu, PlugZap, Users, UsersRound, Wallet, ArrowDownCircle, UserPlus, X } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { checkExternalConnection } from '@/lib/externalCrm';

type Props = {
  children: ReactNode;
  title: string;
  subtitle?: string;
  loading?: boolean;
  right?: ReactNode;
};

type MenuItem = {
  label: string;
  path: string;
  icon: typeof Users;
};

const adminMenu: MenuItem[] = [
  { label: 'Менеджеры', path: '/', icon: Users },
  { label: 'Клиенты', path: '/leads', icon: UserPlus },
  { label: 'Аналитика', path: '/analytics', icon: LineChart },
  { label: 'Транзакции', path: '/transactions', icon: ArrowDownCircle },
  { label: 'Бонусы', path: '/bonuses', icon: Gift },
  { label: 'Зарплаты', path: '/salaries', icon: Wallet },
  { label: 'Кошельки', path: '/wallets', icon: Wallet },
  { label: 'Напоминания', path: '/reminders', icon: Bell },
  { label: 'Аудит', path: '/audit', icon: BarChart3 },
];

const managerMenu: MenuItem[] = [
  { label: 'Профиль', path: '/', icon: Users },
  { label: 'Аналитика', path: '/analytics', icon: LineChart },
  { label: 'Команда', path: '/team', icon: UsersRound },
  { label: 'Транзакции', path: '/transactions', icon: ArrowDownCircle },
  { label: 'Бонусы', path: '/bonuses', icon: Gift },
  { label: 'Зарплаты', path: '/salaries', icon: Wallet },
];

export function ScreenHeader({ children, title, subtitle, loading, right }: Props) {
  const { role } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [connResult, setConnResult] = useState<{ ok: boolean; text: string } | null>(null);
  const menuItems = role === 'admin' ? adminMenu : managerMenu;

  const openRoute = (path: string) => {
    setMenuOpen(false);
    router.replace(path as never);
  };

  const handleCheckConnection = async () => {
    setChecking(true);
    setConnResult(null);
    try {
      const check = await checkExternalConnection();
      if (check.ok) {
        setConnResult({ ok: true, text: `Подключение работает (код ${check.status}, агентов: ${check.agents_found ?? 0})` });
      } else {
        setConnResult({ ok: false, text: `Не удалось (код ${check.status}): ${check.error ?? 'неизвестная ошибка'}` });
      }
    } catch (e) {
      setConnResult({ ok: false, text: `Не удалось: ${e instanceof Error ? e.message : 'Неизвестная ошибка'}` });
    } finally {
      setChecking(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => setMenuOpen(true)}
            accessibilityLabel="Открыть меню"
            activeOpacity={0.8}
          >
            <Menu size={23} color={colors.neutral[0]} />
          </TouchableOpacity>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
        {loading ? (
          <ActivityIndicator color={colors.primary[400]} style={{ marginTop: 12 }} />
        ) : (
          children
        )}
      </View>
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setMenuOpen(false)} />
          <View style={styles.drawer}>
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerTitle}>Разделы</Text>
              <TouchableOpacity onPress={() => setMenuOpen(false)} style={styles.closeButton} accessibilityLabel="Закрыть меню">
                <X size={21} color={colors.neutral[300]} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.menuList}>
              {menuItems.map((item) => {
                const Icon = item.icon;
                const active = item.path === '/' ? pathname === '/' : pathname.endsWith(item.path);
                return (
                  <TouchableOpacity
                    key={item.path}
                    style={[styles.menuItem, active && styles.menuItemActive]}
                    onPress={() => openRoute(item.path)}
                    activeOpacity={0.8}
                  >
                    <Icon size={20} color={active ? colors.primary[300] : colors.neutral[300]} />
                    <Text style={[styles.menuLabel, active && styles.menuLabelActive]}>{item.label}</Text>
                  </TouchableOpacity>
                );
              })}
              {role === 'admin' ? (
                <View style={styles.connSection}>
                  <View style={styles.connDivider} />
                  <TouchableOpacity
                    style={styles.connButton}
                    onPress={handleCheckConnection}
                    disabled={checking}
                    activeOpacity={0.8}
                  >
                    <PlugZap size={20} color={colors.neutral[300]} />
                    <Text style={styles.connButtonLabel}>{checking ? 'Проверяем…' : 'Проверить подключение к CRM'}</Text>
                  </TouchableOpacity>
                  {connResult ? (
                    <Text style={connResult.ok ? styles.connOk : styles.connFail}>{connResult.text}</Text>
                  ) : null}
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: colors.neutral[950],
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.neutral[800],
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    fontFamily: 'Inter-Bold',
    fontSize: 28,
    color: colors.neutral[0],
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: colors.neutral[400],
    marginTop: 2,
  },
  modalRoot: {
    flex: 1,
    flexDirection: 'row',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.7)',
  },
  drawer: {
    width: 292,
    maxWidth: '82%',
    height: '100%',
    backgroundColor: colors.neutral[950],
    borderRightWidth: 1,
    borderRightColor: colors.neutral[700],
    paddingTop: 56,
    paddingHorizontal: 16,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[800],
  },
  drawerTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 22,
    color: colors.neutral[0],
  },
  closeButton: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: colors.neutral[800],
  },
  menuList: {
    paddingTop: 16,
    gap: 8,
    paddingBottom: 24,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
  },
  menuItemActive: {
    backgroundColor: colors.primary[900],
  },
  menuLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    color: colors.neutral[300],
  },
  menuLabelActive: {
    color: colors.primary[200],
  },
  connSection: {
    marginTop: 8,
  },
  connDivider: {
    height: 1,
    backgroundColor: colors.neutral[800],
    marginBottom: 12,
  },
  connButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
  },
  connButtonLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    color: colors.neutral[300],
  },
  connOk: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    lineHeight: 18,
    color: colors.accent[400],
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  connFail: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    lineHeight: 18,
    color: colors.error[400],
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
});
