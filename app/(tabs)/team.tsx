import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { formatMoney, currentMonthKey, getMonthRange } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { ScreenHeader } from '@/components/ScreenHeader';
import { MonthPicker } from '@/components/MonthPicker';
import { ErrorBanner } from '@/components/ErrorBanner';
import { EmptyState } from '@/components/EmptyState';
import { Badge } from '@/components/Badge';

type TeamTotal = {
  manager_id: string;
  manager_name: string;
  total_amount: number;
};

export default function TeamScreen() {
  const { managerId } = useAuth();
  const [rows, setRows] = useState<TeamTotal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey());

  const fetchTeam = useCallback(async () => {
    setError(null);
    const { start, end } = getMonthRange(selectedMonth);
    const { data, error: rpcError } = await supabase.rpc('team_monthly_totals', {
      p_start: start,
      p_end: end,
    });
    if (rpcError) {
      setError('Не удалось загрузить данные команды. Попробуйте позже.');
    } else if (!Array.isArray(data)) {
      setError('Сервер вернул некорректные данные.');
    } else {
      setRows(data as TeamTotal[]);
    }
    setLoading(false);
    setRefreshing(false);
  }, [selectedMonth]);

  useEffect(() => {
    setLoading(true);
    fetchTeam();
  }, [fetchTeam]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchTeam();
  };

  const renderItem = ({ item, index }: { item: TeamTotal; index: number }) => {
    const isMe = item.manager_id === managerId;
    return (
      <View style={[styles.card, isMe && styles.cardMe]}>
        <View style={styles.rank}>
          <Text style={styles.rankText}>{index + 1}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{item.manager_name}</Text>
            {isMe ? <Badge variant="success">Вы</Badge> : null}
          </View>
          <Text style={styles.caption}>Сумма за месяц</Text>
        </View>
        <Text style={[styles.total, item.total_amount <= 0 && styles.totalEmpty]}>
          {formatMoney(Number(item.total_amount))}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Команда"
        subtitle="Суммы коллег за месяц"
        loading={loading}
      >
        {error ? <ErrorBanner message={error} /> : null}
      </ScreenHeader>

      <MonthPicker value={selectedMonth} onChange={setSelectedMonth} />

      <FlatList
        data={rows}
        keyExtractor={(item) => item.manager_id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[400]} />
        }
        ListEmptyComponent={
          !loading && !error ? <EmptyState message="В команде пока нет менеджеров." /> : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[950] },
  list: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 4, gap: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.neutral[900],
    borderWidth: 1,
    borderColor: colors.neutral[800],
  },
  cardMe: { borderColor: colors.primary[700] },
  rank: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutral[800],
  },
  rankText: { fontFamily: 'Inter-SemiBold', fontSize: 13, color: colors.neutral[300] },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flexShrink: 1, fontFamily: 'Inter-SemiBold', fontSize: 16, color: colors.neutral[0] },
  caption: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.neutral[500], marginTop: 2 },
  total: { fontFamily: 'Inter-Bold', fontSize: 17, color: colors.accent[500] },
  totalEmpty: { color: colors.neutral[500] },
});
