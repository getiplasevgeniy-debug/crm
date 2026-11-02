import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { getMonthRange } from '@/lib/format';

type Props = { monthKey: string };

function previousMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const prev = new Date(y, m - 2, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
}

async function countLeadsInMonth(monthKey: string): Promise<number> {
  const { start, end } = getMonthRange(monthKey);
  const { count, error } = await supabase
    .from('lead_submissions')
    .select('id', { count: 'exact', head: true })
    .gte('application_date', start)
    .lt('application_date', end);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export function LeadPullComparison({ monthKey }: Props) {
  const [current, setCurrent] = useState<number | null>(null);
  const [previous, setPrevious] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCurrent(null);
    setPrevious(null);
    setError(null);
    Promise.all([countLeadsInMonth(monthKey), countLeadsInMonth(previousMonthKey(monthKey))])
      .then(([cur, prev]) => {
        if (cancelled) return;
        setCurrent(cur);
        setPrevious(prev);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [monthKey]);

  const diff = current !== null && previous !== null ? current - previous : null;
  const percentChange =
    diff !== null && previous ? Math.round((diff / previous) * 100) : null;

  const TrendIcon = diff === null || diff === 0 ? Minus : diff > 0 ? TrendingUp : TrendingDown;
  const trendColor =
    diff === null || diff === 0
      ? colors.neutral[400]
      : diff > 0
        ? colors.accent[400]
        : colors.error[400];

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Поступило клиентов</Text>
      {error ? (
        <Text style={styles.error}>Не удалось загрузить статистику: {error}</Text>
      ) : current === null || previous === null ? (
        <ActivityIndicator color={colors.primary[400]} />
      ) : (
        <View style={styles.row}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>В этом месяце</Text>
            <Text style={styles.metricValue}>{current}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>В прошлом месяце</Text>
            <Text style={styles.metricValue}>{previous}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Разница</Text>
            <View style={styles.trendRow}>
              <TrendIcon size={16} color={trendColor} />
              <Text style={[styles.metricValue, { color: trendColor }]}>
                {diff === null ? '—' : `${diff > 0 ? '+' : ''}${diff}`}
              </Text>
            </View>
            {percentChange !== null ? (
              <Text style={[styles.percent, { color: trendColor }]}>
                {percentChange > 0 ? '+' : ''}
                {percentChange}%
              </Text>
            ) : null}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 18,
    borderRadius: 16,
    backgroundColor: colors.neutral[900],
    borderWidth: 1,
    borderColor: colors.neutral[800],
    gap: 14,
  },
  title: { fontFamily: 'Inter-SemiBold', fontSize: 15, color: colors.neutral[0] },
  row: { flexDirection: 'row', gap: 8 },
  metric: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.neutral[800],
    alignItems: 'center',
    gap: 4,
  },
  metricLabel: { fontFamily: 'Inter-Regular', fontSize: 11, color: colors.neutral[400], textAlign: 'center' },
  metricValue: { fontFamily: 'Inter-Bold', fontSize: 20, color: colors.neutral[0] },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  percent: { fontFamily: 'Inter-Medium', fontSize: 12 },
  error: { fontFamily: 'Inter-Regular', fontSize: 13, color: colors.error[400] },
});
