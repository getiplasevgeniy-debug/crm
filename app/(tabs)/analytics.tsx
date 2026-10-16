import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BarChart3, LogOut, RefreshCw, TrendingUp, Users } from 'lucide-react-native';
import { ErrorBanner } from '@/components/ErrorBanner';
import { MonthPicker } from '@/components/MonthPicker';
import { ScreenHeader } from '@/components/ScreenHeader';
import { fetchExternalAnalytics, ExternalAnalyticsResponse } from '@/lib/externalCrm';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';
import { currentMonthKey, getMonthRange } from '@/lib/format';

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export default function AnalyticsScreen() {
  const { role, signOut } = useAuth();
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [data, setData] = useState<ExternalAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const range = getMonthRange(monthKey);
      setData(await fetchExternalAnalytics(range.start, range.end));
    } catch {
      setError('Не удалось загрузить аналитику второй CRM. Проверьте подключение.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [monthKey]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  if (role !== 'admin') return null;

  const totals = data?.totals;
  const rows = data?.by_agent ?? [];

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Аналитика лидов"
        subtitle="Статусы клиентов по месяцам"
        loading={loading}
        right={
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={load} hitSlop={12} style={styles.iconButton}>
              <RefreshCw size={19} color={colors.neutral[300]} />
            </TouchableOpacity>
            <TouchableOpacity onPress={signOut} hitSlop={12} style={styles.iconButton}>
              <LogOut size={19} color={colors.neutral[400]} />
            </TouchableOpacity>
          </View>
        }
      >
        <View />
      </ScreenHeader>

      <MonthPicker value={monthKey} onChange={setMonthKey} monthsCount={12} />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary[400]} />}
      >
        {error ? <ErrorBanner message={error} /> : null}

        <View style={styles.definitionCard}>
          <BarChart3 size={20} color={colors.primary[300]} />
          <Text style={styles.definitionText}>В статистику попадают все клиенты, добавленные к агентам с 1 октября 2026 года. Клиенты со статусом «Нет ответа» не учитываются в общем количестве. Статусы считаются по истории изменений, проценты — от всех клиентов агента.</Text>
        </View>

        {totals && !error ? (
          <View style={styles.totalsCard}>
            <View style={styles.totalsHeader}>
              <TrendingUp size={18} color={colors.accent[400]} />
              <Text style={styles.totalsTitle}>Общая сводка</Text>
            </View>
            <View style={styles.totalsMetrics}>
              <TotalMetric label="Всего клиентов" value={totals.total} color={colors.neutral[100]} />
              <TotalMetric label="В работе" value={totals.in_work} color={colors.primary[300]} />
              <TotalMetric label="Депозиты" value={totals.deposits} color={colors.accent[400]} />
              <TotalMetric label="Не валид" value={totals.invalid} color={colors.error[400]} />
            </View>
            <View style={styles.conversionRow}>
              <View style={styles.conversionItem}>
                <Text style={styles.conversionLabel}>Конверсия в работу</Text>
                <Text style={styles.conversionValue}>{percent(totals.work_conversion)}</Text>
              </View>
              <View style={styles.conversionItem}>
                <Text style={styles.conversionLabel}>Конверсия в депозит</Text>
                <Text style={styles.conversionValue}>{percent(totals.deposit_conversion)}</Text>
              </View>
              <View style={styles.conversionItem}>
                <Text style={styles.conversionLabel}>Доля невалидных</Text>
                <Text style={styles.conversionValue}>{percent(totals.invalid_conversion)}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {!error && rows.length === 0 && !loading ? <Text style={styles.empty}>Нет данных за выбранный месяц.</Text> : null}

        {rows.map((row) => (
          <View style={styles.card} key={row.agent_id}>
            <View style={styles.cardHeader}>
              <View style={styles.agentIcon}><Users size={17} color={colors.primary[300]} /></View>
              <View style={styles.agentTitle}>
                <Text style={styles.agentName}>{row.agent_name}</Text>
                <Text style={styles.total}>{row.total} лидов назначено</Text>
              </View>
            </View>
            <View style={styles.metrics}>
              <Metric label="В работе" value={row.in_work} conversion={percent(row.work_conversion)} convLabel="от всех" color={colors.primary[300]} />
              <Metric label="Депозит" value={row.deposits} conversion={percent(row.deposit_conversion)} convLabel="от всех" color={colors.accent[400]} />
              <Metric label="Не валид" value={row.invalid} conversion={percent(row.invalid_conversion)} convLabel="от всех" color={colors.error[400]} />
            </View>
            <View style={styles.statusList}>
              {Object.entries(row.statuses).filter(([status]) => !['В работе', 'Депозит', 'Не валид'].includes(status)).map(([status, count]) => (
                <View style={styles.statusLine} key={status}>
                  <Text style={styles.statusName}>{status}</Text>
                  <Text style={styles.statusCount}>{count} ({percent(row.total ? count / row.total : 0)})</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        {loading ? <ActivityIndicator color={colors.primary[400]} style={styles.loader} /> : null}
      </ScrollView>
    </View>
  );
}

function TotalMetric({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.totalMetric}>
      <Text style={styles.totalMetricLabel}>{label}</Text>
      <Text style={[styles.totalMetricValue, { color }]}>{value}</Text>
    </View>
  );
}

function Metric({ label, value, conversion, convLabel, color }: { label: string; value: number; conversion: string; convLabel: string; color: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Text style={styles.metricConversion}>{conversion} {convLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[950] },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 12 },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconButton: { padding: 8, borderRadius: 10, backgroundColor: colors.neutral[800] },
  definitionCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, backgroundColor: colors.neutral[900], borderWidth: 1, borderColor: colors.neutral[700] },
  definitionText: { flex: 1, fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 19, color: colors.neutral[300] },
  totalsCard: { padding: 18, borderRadius: 16, backgroundColor: colors.neutral[900], borderWidth: 1, borderColor: colors.primary[700] },
  totalsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  totalsTitle: { fontFamily: 'Inter-SemiBold', fontSize: 15, color: colors.neutral[0] },
  totalsMetrics: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  totalMetric: { flex: 1, padding: 12, borderRadius: 12, backgroundColor: colors.neutral[800], alignItems: 'center' },
  totalMetricLabel: { fontFamily: 'Inter-Regular', fontSize: 11, color: colors.neutral[400], textAlign: 'center' },
  totalMetricValue: { fontFamily: 'Inter-Bold', fontSize: 26, marginTop: 6 },
  conversionRow: { flexDirection: 'row', gap: 8 },
  conversionItem: { flex: 1, padding: 10, borderRadius: 10, backgroundColor: colors.neutral[800] },
  conversionLabel: { fontFamily: 'Inter-Regular', fontSize: 10, color: colors.neutral[400], textAlign: 'center' },
  conversionValue: { fontFamily: 'Inter-SemiBold', fontSize: 16, color: colors.neutral[100], textAlign: 'center', marginTop: 4 },
  card: { padding: 16, borderRadius: 16, backgroundColor: colors.neutral[900], borderWidth: 1, borderColor: colors.neutral[800] },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  agentIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary[900] },
  agentTitle: { flex: 1 },
  agentName: { fontFamily: 'Inter-SemiBold', fontSize: 16, color: colors.neutral[0] },
  total: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.neutral[500], marginTop: 3 },
  metrics: { flexDirection: 'row', gap: 8 },
  metric: { flex: 1, padding: 10, borderRadius: 12, backgroundColor: colors.neutral[800] },
  metricLabel: { fontFamily: 'Inter-Regular', fontSize: 11, color: colors.neutral[400] },
  metricValue: { fontFamily: 'Inter-Bold', fontSize: 22, marginTop: 5 },
  metricConversion: { fontFamily: 'Inter-Regular', fontSize: 10, color: colors.neutral[400], marginTop: 3 },
  statusList: { marginTop: 12, gap: 6 },
  statusLine: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.neutral[700] },
  statusName: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.neutral[300] },
  statusCount: { fontFamily: 'Inter-SemiBold', fontSize: 12, color: colors.neutral[100] },
  empty: { fontFamily: 'Inter-Regular', fontSize: 14, color: colors.neutral[400], textAlign: 'center', marginTop: 24 },
  loader: { marginTop: 20 },
});
