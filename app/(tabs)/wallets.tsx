import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Copy, LogOut, RefreshCw, Wallet } from 'lucide-react-native';
import { ScreenHeader } from '@/components/ScreenHeader';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { colors } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

type ManagerWallet = {
  id: string;
  name: string;
  crypto_wallet: string;
};

export default function WalletsScreen() {
  const { role, signOut } = useAuth();
  const [wallets, setWallets] = useState<ManagerWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadWallets = useCallback(async () => {
    setError(null);
    const { data, error: walletsError } = await supabase
      .from('managers')
      .select('id, name, crypto_wallet')
      .not('crypto_wallet', 'is', null)
      .order('name');

    if (walletsError) {
      setError('Не удалось загрузить кошельки менеджеров.');
      setWallets([]);
    } else {
      setWallets((data || []).filter((item): item is ManagerWallet => (
        typeof item.id === 'string' && typeof item.name === 'string' && typeof item.crypto_wallet === 'string' && item.crypto_wallet.trim().length > 0
      )));
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    if (role === 'admin') loadWallets();
  }, [role, loadWallets]);

  const copyWallet = async (wallet: ManagerWallet) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      setError('Копирование недоступно в этом браузере.');
      return;
    }

    try {
      await navigator.clipboard.writeText(wallet.crypto_wallet);
      setCopiedId(wallet.id);
    } catch {
      setError('Не удалось скопировать кошелёк.');
    }
  };

  if (role !== 'admin') return null;

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Кошельки"
        subtitle="Адреса кошельков менеджеров"
        loading={loading}
        right={
          <TouchableOpacity onPress={signOut} hitSlop={12} style={styles.logoutBtn}>
            <LogOut size={20} color={colors.neutral[400]} />
          </TouchableOpacity>
        }
      >
        {error ? <ErrorBanner message={error} /> : null}
      </ScreenHeader>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadWallets(); }} tintColor={colors.primary[400]} />}
      >
        {wallets.length === 0 && !loading ? (
          <EmptyState message="Менеджеры ещё не добавили кошельки." />
        ) : (
          wallets.map((wallet) => (
            <View key={wallet.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.iconBox}>
                  <Wallet size={20} color={colors.primary[300]} />
                </View>
                <Text style={styles.managerName}>{wallet.name}</Text>
              </View>
              <Text style={styles.walletLabel}>Криптокошелёк</Text>
              <Text selectable style={styles.walletAddress}>{wallet.crypto_wallet}</Text>
              <TouchableOpacity style={styles.copyButton} onPress={() => copyWallet(wallet)} activeOpacity={0.8}>
                <Copy size={17} color={colors.neutral[0]} />
                <Text style={styles.copyButtonText}>{copiedId === wallet.id ? 'Скопировано' : 'Скопировать кошелёк'}</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[950] },
  content: { paddingHorizontal: 20, paddingBottom: 32, paddingTop: 4 },
  card: { padding: 16, marginBottom: 12, borderRadius: 16, backgroundColor: colors.neutral[900], borderWidth: 1, borderColor: colors.neutral[800] },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  iconBox: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.primary[900] },
  managerName: { fontFamily: 'Inter-SemiBold', fontSize: 17, color: colors.neutral[0] },
  walletLabel: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.neutral[500], marginBottom: 5 },
  walletAddress: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 19, color: colors.neutral[200], marginBottom: 14 },
  copyButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.primary[600] },
  copyButtonText: { fontFamily: 'Inter-SemiBold', fontSize: 14, color: colors.neutral[0] },
  logoutBtn: { padding: 8, borderRadius: 10, backgroundColor: colors.neutral[800] },
});
