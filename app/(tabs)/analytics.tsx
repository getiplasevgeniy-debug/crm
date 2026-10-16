import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BarChart3, LogOut, RefreshCw, TrendingDown, TrendingUp, Users } from 'lucide-react-native';
import { ErrorBanner } from '@/components/ErrorBanner';
import { ScreenHeader } from '@/components/ScreenHeader';
import { fetchExternalAnalytics, ExternalAnalyticsResponse } from '@/lib/externalCrm';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { currentMonthKey, getMonthRange, formatMoney } from '@/lib/format';

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function costLabel(budget: number, count: number): string {
  if (!budget || !count) return '—';
  const val = budget / count;
  return `$${val.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}`;
}

async function loadMonthlyExpenses(): Promise<number> {
  const key = currentMonthKey();
  const { start, end } = getMonthRange(key);
  const { data } = await supabase
    .from('ledger_entries')
    .select('amount')
    .eq('type', 'expense')
    .gte('created_at', start)
    .lt('created_at', end);
  if (!data) return 0;
  return data.reduce((sum, row) => sum + Number(row.amount), 0);
}

export default function AnalyticsScreen() {
  const { role, signOut } = useAuth();
  const [data, setData] = useState<ExternalAnalyticsResponse | null>(null);
  const [budget, setBudget] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [analytics, expenses] = await Promise.all([
        fetchExternalAnalytics(),
        loadMonthlyExpenses(),
      ]);
      setData(analytics);
      setBudget(expenses);
    } catch {
      setError('Не удалось загрузить аналитику. Проверьте подключение.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  if (role !== 'admin') return null;

  const totals = data?.totals;
  const rows = data?.by_agent ?? [];

  const costPerLead = costLabel(budget, totals?.total ?? 0);
  const costPerWork = costLabel(budget, totals?.in_work ?? 0);
  const costPerDeposit = costLabel(budget, totals?.deposits ?? 0);

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Аналитика лидов"
        subtitle="Стоимость клиента и статусы"
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

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={colors.primary[400]}
          />
        }
      >
        {error ? <ErrorBanner message={error} /> : null}

        {/* Expenses source card */}
        <View style={styles.expenseCard}>
          <View style={styles.expenseRow}>
            <TrendingDown size={18} color={colors.error[400]} />
            <Text style={styles.expenseLabel}>Расходы за месяц (из Аудита)</Text>
          </View>
          <Text style={styles.expenseValue}>
            {budget > 0 ? `$${formatMoney(budget)}` : 'Нет расходов в Аудите за этот месяц'}
          </Text>
          <Text style={styles.expenseHint}>
            Считается автоматически по статье «Расход» в меню Аудит. Зарплаты агентов не включены.
          </Text>
        </View>

        {/* Cost funnel */}
        {totals && !error ? (
          <View style={styles.costCard}>
            <View style={styles.costHeader}>
              <TrendingUp size={18} color={colors.accent[400]} />
              <Text style={styles.costTitle}>Стоимость клиента</Text>
            </View>
            <Text style={styles.costFormula}>
              ${formatMoney(budget)} расходов ÷ количество клиентов на каждом этапе
            </Text>
            <View style={styles.costSteps}>
              <CostStep
                label="1 лид"
                sublabel={`${totals.total} всего`}
                value={costPerLead}
                color={colors.neutral[200]}
                dim={!totals.total || !budget}
              />
              <View style={styles.arrow}><Text style={styles.arrowText}>→</Text></View>
              <CostStep
                label="1 в работе"
                sublabel={`${totals.in_work} чел.`}
                value={costPerWork}
                color={colors.primary[300]}
                dim={!totals.in_work || !budget}
              />
              <View style={styles.arrow}><Text style={styles.arrowText}>→</Text></View>
              <CostStep
                label="1 депозит"
                sublabel={`${totals.deposits} чел.`}
                value={costPerDeposit}
                color={colors.accent[400]}
                dim={!totals.deposits || !budget}
              />
            </View>
          </View>
        ) : null}

        {/* Overall totals */}
        {totals && !error ? (
          <View style={styles.totalsCard}>
            <View style={styles.totalsHeader}>
              <BarChart3 size={18} color={colors.primary[300]} />
              <Text style={styles.totalsTitle}>Общая сводка</Text>
            </View>
            <View style={styles.totalsMetrics}>
              <TotalMetric label="Всего" value={totals.total} color={colors.neutral[100]} />
              <TotalMetric label="В работе" value={totals.in_work} color={colors.primary[300]} />
              <TotalMetric label="Депозиты" value={totals.deposits} color={colors.accent[400]} />
              <TotalMetric label="Не валид" value={totals.invalid} color={colors.error[400]} />
            </View>
            <View style={styles.conversionRow}>
              <View style={styles.conversionItem}>
                <Text style={styles.conversionLabel}>В работу</Text>
                <Text style={styles.conversionValue}>{percent(totals.work_conversion)}</Text>
              </View>
              <View style={styles.conversionItem}>
                <Text style={styles.conversionLabel}>В депозит</Text>
                <Text style={styles.conversionValue}>{percent(totals.deposit_conversion)}</Text>
              </View>
              <View style={styles.conversionItem}>
                <Text style={styles.conversionLabel}>Невалид</Text>
                <Text style={styles.conversionValue}>{percent(totals.invalid_conversion)}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {!error && rows.length === 0 && !loading ? (
          <Text style={styles.empty}>Нет данных за сегодня.</Text>
        ) : null}

        {rows.map((row) => (
          <View style={styles.card} key={row.agent_id}>
            <View style={styles.cardHeader}>
              <View style={styles.agentIcon}>
                <Users size={17} color={colors.primary[300]} />
              </View>
              <View style={styles.agentTitle}>
                <Text style={styles.agentName}>{row.agent_name}</Text>
                <Text style={styles.agentTotal}>{row.total} лидов назначено</Text>
              </View>
            </View>
            <View style={styles.metrics}>
              <Metric label="В работе" value={row.in_work} conversion={percent(row.work_conversion)} color={colors.primary[300]} />
              <Metric label="Депозит" value={row.deposits} conversion={percent(row.deposit_conversion)} color={colors.accent[400]} />
              <Metric label="Не валид" value={row.invalid} conversion={percent(row.invalid_conversion)} color={colors.error[400]} />
            </View>
            {Object.entries(row.statuses)
              .filter(([s]) => !['В работе', 'Депозит', 'Не валид'].includes(s))
              .length > 0 ? (
              <View style={styles.statusList}>
                {Object.entries(row.statuses)
                  .filter(([s]) => !['В работе', 'Депозит', 'Не валид'].includes(s))
                  .map(([status, count]) => (
                    <View style={styles.statusLine} key={status}>
                      <Text style={styles.statusName}>{status}</Text>
                      <Text style={styles.statusCount}>
                        {count} ({percent(row.total ? count / row.total : 0)})
                      </Text>
                    </View>
                  ))}
              </View>
            ) : null}
          </View>
        ))}

        {loading ? <ActivityIndicator color={colors.primary[400]} style={styles.loader} /> : null}
      </ScrollView>
    </View>
  );
}

function CostStep({
  label, sublabel, value, color, dim,
}: {
  label: string; sublabel: string; value: string; color: string; dim: boolean;
}) {
  return (
    <View style={[styles.costStep, dim && styles.costStepDim]}>
      <Text style={styles.costStepLabel}>{label}</Text>
      <Text style={styles.costStepSub}>{sublabel}</Text>
      <Text style={[styles.costStepValue, { color: dim ? colors.neutral[600] : color }]}>{value}</Text>
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

function Metric({ label, value, conversion, color }: { label: string; value: number; conversion: string; color: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Text style={styles.metricConversion}>{conversion}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[950] },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconButton: { padding: 8, borderRadius: 10, backgroundColor: colors.neutral[800] },

  expenseCard: {
    padding: 18,
    borderRadius: 16,
    backgroundColor: colors.neutral[900],
    borderWidth: 1,
    borderColor: colors.error[600],
    gap: 6,
  },
  expenseRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  expenseLabel: { fontFamily: 'Inter-SemiBold', fontSize: 14, color: colors.neutral[200] },
  expenseValue: { fontFamily: 'Inter-Bold', fontSize: 26, color: colors.error[400] },
  expenseHint: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.neutral[500], lineHeight: 17 },

  costCard: {
    padding: 18,
    borderRadius: 16,
    backgroundColor: colors.neutral[900],
    borderWidth: 1,
    borderColor: colors.accent[700],
  },
  costHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  costTitle: { fontFamily: 'Inter-SemiBold', fontSize: 15, color: colors.neutral[0] },
  costFormula: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.neutral[500], marginBottom: 16, lineHeight: 17 },
  costSteps: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  costStep: { flex: 1, padding: 12, borderRadius: 12, backgroundColor: colors.neutral[800], alignItems: 'center', gap: 3 },
  costStepDim: { opacity: 0.4 },
  costStepLabel: { fontFamily: 'Inter-SemiBold', fontSize: 11, color: colors.neutral[300], textAlign: 'center' },
  costStepSub: { fontFamily: 'Inter-Regular', fontSize: 10, color: colors.neutral[500], textAlign: 'center' },
  costStepValue: { fontFamily: 'Inter-Bold', fontSize: 15, textAlign: 'center', marginTop: 2 },
  arrow: { paddingHorizontal: 2 },
  arrowText: { fontSize: 16, color: colors.neutral[600] },

  totalsCard: {
    padding: 18,
    borderRadius: 16,
    backgroundColor: colors.neutral[900],
    borderWidth: 1,
    borderColor: colors.primary[700],
  },
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

  card: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.neutral[900],
    borderWidth: 1,
    borderColor: colors.neutral[800],
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  agentIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary[900] },
  agentTitle: { flex: 1 },
  agentName: { fontFamily: 'Inter-SemiBold', fontSize: 16, color: colors.neutral[0] },
  agentTotal: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.neutral[500], marginTop: 3 },
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
