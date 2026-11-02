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
import { MonthPicker } from '@/components/MonthPicker';
import { DonutChart, DonutLegend, colorForStatus } from '@/components/DonutChart';
import {
  fetchExternalAnalytics,
  fetchMyAnalytics,
  ExternalAnalyticsResponse,
  ExternalAnalyticsRow,
} from '@/lib/externalCrm';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { currentMonthKey, getMonthRange, formatMoney } from '@/lib/format';
import { NotificationToggle } from '@/components/NotificationToggle';

const ALL_TIME = 'all-time';

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function costLabel(budget: number, count: number): string {
  if (!budget || !count) return '—';
  const val = budget / count;
  return `$${val.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}`;
}

function buildDonutData(row: { statuses: Record<string, number> }) {
  return Object.entries(row.statuses)
    .filter(([status]) => status !== 'Нет ответа')
    .map(([status, value]) => ({
      label: status,
      value,
      color: colorForStatus(status),
    }))
    .sort((a, b) => b.value - a.value);
}

function getPeriodRange(monthKey: string): { from?: string; to?: string } {
  if (monthKey === ALL_TIME) return {};
  const { start, end } = getMonthRange(monthKey);
  return { from: start, to: end };
}

async function loadExpensesForPeriod(from?: string, to?: string): Promise<number> {
  let query = supabase.from('ledger_entries').select('amount').eq('type', 'expense');
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lt('created_at', to);
  const { data } = await query;
  if (!data) return 0;
  return data.reduce((sum, row) => sum + Number(row.amount), 0);
}

export default function AnalyticsScreen() {
  const { role, signOut } = useAuth();
  const isAdmin = role === 'admin';
  const [data, setData] = useState<ExternalAnalyticsResponse | null>(null);
  const [budget, setBudget] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey());

  const load = useCallback(async () => {
    setError(null);
    const { from, to } = getPeriodRange(selectedMonth);
    try {
      if (isAdmin) {
        const [analytics, expenses] = await Promise.all([
          fetchExternalAnalytics(from, to),
          loadExpensesForPeriod(from, to),
        ]);
        setData(analytics);
        setBudget(expenses);
      } else {
        const analytics = await fetchMyAnalytics(from, to);
        setData(analytics);
      }
    } catch {
      setError('Не удалось загрузить аналитику. Проверьте подключение.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin, selectedMonth]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  if (!isAdmin && role !== 'manager') return null;

  const totals = data?.totals;
  const rows = data?.by_agent ?? [];
  const isAllTime = selectedMonth === ALL_TIME;

  const costPerLead = costLabel(budget, totals?.total ?? 0);
  const costPerWork = costLabel(budget, totals?.in_work ?? 0);
  const costPerDeposit = costLabel(budget, totals?.deposits ?? 0);

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Аналитика"
        subtitle={isAdmin ? 'Стоимость клиента и конверсия' : 'Моя статистика'}
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
        <MonthPicker
          value={selectedMonth}
          onChange={setSelectedMonth}
          allowAllTime
          monthsCount={24}
        />

        <NotificationToggle />

        {error ? <ErrorBanner message={error} /> : null}

        {/* Admin: expenses + cost funnel */}
        {isAdmin && totals && !error ? (
          <>
            <View style={styles.expenseCard}>
              <View style={styles.expenseRow}>
                <TrendingDown size={18} color={colors.error[400]} />
                <Text style={styles.expenseLabel}>
                  Расходы {isAllTime ? 'за всё время' : 'за месяц'} (из Аудита)
                </Text>
              </View>
              <Text style={styles.expenseValue}>
                {budget > 0 ? `$${formatMoney(budget)}` : 'Нет расходов за этот период'}
              </Text>
              <Text style={styles.expenseHint}>
                Считается автоматически по статье «Расход» в меню Аудит. Зарплаты не включены.
              </Text>
            </View>

            <View style={styles.costCard}>
              <View style={styles.costHeader}>
                <TrendingUp size={18} color={colors.accent[400]} />
                <Text style={styles.costTitle}>Стоимость клиента</Text>
              </View>
              <Text style={styles.costFormula}>
                ${formatMoney(budget)} расходов ÷ количество клиентов на каждом этапе
              </Text>
              <View style={styles.costSteps}>
                <CostStep label="1 лид" sublabel={`${totals.total} всего`} value={costPerLead} color={colors.neutral[200]} dim={!totals.total || !budget} />
                <View style={styles.arrow}><Text style={styles.arrowText}>→</Text></View>
                <CostStep label="1 в работе" sublabel={`${totals.in_work} чел.`} value={costPerWork} color={colors.primary[300]} dim={!totals.in_work || !budget} />
                <View style={styles.arrow}><Text style={styles.arrowText}>→</Text></View>
                <CostStep label="1 депозит" sublabel={`${totals.deposits} чел.`} value={costPerDeposit} color={colors.accent[400]} dim={!totals.deposits || !budget} />
              </View>
            </View>
          </>
        ) : null}

        {/* Overall donut chart */}
        {totals && !error ? (
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <BarChart3 size={18} color={colors.primary[300]} />
              <Text style={styles.chartTitle}>{isAdmin ? 'Общая сводка' : 'Мои клиенты'}</Text>
            </View>
            <View style={styles.chartBody}>
              <DonutChart
                data={buildDonutData(totals)}
                total={totals.total}
                centerValue={String(totals.total)}
                centerLabel="клиентов"
              />
              <View style={styles.chartLegend}>
                <DonutLegend items={buildDonutData(totals)} />
              </View>
            </View>
            <View style={styles.metricsRow}>
              <MiniMetric label="В работе" value={totals.in_work} color={colors.primary[300]} />
              <MiniMetric label="Депозит" value={totals.deposits} color={colors.accent[400]} />
              <MiniMetric label="Не валид" value={totals.invalid} color={colors.error[400]} />
            </View>
            <View style={styles.convRow}>
              <ConvBadge label="В работу" value={percent(totals.work_conversion)} />
              <ConvBadge label="В депозит" value={percent(totals.deposit_conversion)} />
              <ConvBadge label="Невалид" value={percent(totals.invalid_conversion)} />
            </View>
          </View>
        ) : null}

        {/* Per-agent donut charts */}
        {!error && rows.length > 0 ? (
          <Text style={styles.sectionTitle}>
            {isAdmin ? 'Статистика по агентам' : 'Детализация'}
          </Text>
        ) : null}

        {rows.map((row) => (
          <AgentChartCard key={row.agent_id} row={row} />
        ))}

        {!error && rows.length === 0 && !loading ? (
          <Text style={styles.empty}>Нет данных за выбранный период.</Text>
        ) : null}

        {loading ? <ActivityIndicator color={colors.primary[400]} style={styles.loader} /> : null}
      </ScrollView>
    </View>
  );
}

function AgentChartCard({ row }: { row: ExternalAnalyticsRow }) {
  const donutData = buildDonutData(row);
  return (
    <View style={styles.chartCard}>
      <View style={styles.chartHeader}>
        <View style={styles.agentIcon}>
          <Users size={16} color={colors.primary[300]} />
        </View>
        <View style={styles.agentTitle}>
          <Text style={styles.agentName}>{row.agent_name}</Text>
          <Text style={styles.agentSub}>{row.total} лидов</Text>
        </View>
      </View>
      <View style={styles.chartBody}>
        <DonutChart
          data={donutData}
          total={row.total}
          centerValue={String(row.total)}
          centerLabel="лидов"
        />
        <View style={styles.chartLegend}>
          <DonutLegend items={donutData} />
        </View>
      </View>
      <View style={styles.metricsRow}>
        <MiniMetric label="В работе" value={row.in_work} color={colors.primary[300]} />
        <MiniMetric label="Депозит" value={row.deposits} color={colors.accent[400]} />
        <MiniMetric label="Не валид" value={row.invalid} color={colors.error[400]} />
      </View>
      <View style={styles.convRow}>
        <ConvBadge label="В работу" value={percent(row.work_conversion)} />
        <ConvBadge label="В депозит" value={percent(row.deposit_conversion)} />
        <ConvBadge label="Невалид" value={percent(row.invalid_conversion)} />
      </View>
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

function MiniMetric({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.miniMetric}>
      <Text style={styles.miniMetricLabel}>{label}</Text>
      <Text style={[styles.miniMetricValue, { color }]}>{value}</Text>
    </View>
  );
}

function ConvBadge({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.convBadge}>
      <Text style={styles.convBadgeLabel}>{label}</Text>
      <Text style={styles.convBadgeValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[950] },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconButton: { padding: 8, borderRadius: 10, backgroundColor: colors.neutral[800] },

  // Expense card (admin only)
  expenseCard: {
    padding: 18, borderRadius: 16, backgroundColor: colors.neutral[900],
    borderWidth: 1, borderColor: colors.error[600], gap: 6,
  },
  expenseRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  expenseLabel: { fontFamily: 'Inter-SemiBold', fontSize: 14, color: colors.neutral[200] },
  expenseValue: { fontFamily: 'Inter-Bold', fontSize: 26, color: colors.error[400] },
  expenseHint: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.neutral[500], lineHeight: 17 },

  // Cost funnel (admin only)
  costCard: {
    padding: 18, borderRadius: 16, backgroundColor: colors.neutral[900],
    borderWidth: 1, borderColor: colors.accent[700],
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

  // Chart card
  chartCard: {
    padding: 18, borderRadius: 16, backgroundColor: colors.neutral[900],
    borderWidth: 1, borderColor: colors.neutral[800],
  },
  chartHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  chartTitle: { fontFamily: 'Inter-SemiBold', fontSize: 15, color: colors.neutral[0] },
  chartBody: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  chartLegend: { flex: 1 },

  // Agent card header
  agentIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary[900] },
  agentTitle: { flex: 1 },
  agentName: { fontFamily: 'Inter-SemiBold', fontSize: 15, color: colors.neutral[0] },
  agentSub: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.neutral[500], marginTop: 2 },

  // Metrics
  metricsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  miniMetric: { flex: 1, padding: 10, borderRadius: 12, backgroundColor: colors.neutral[800], alignItems: 'center' },
  miniMetricLabel: { fontFamily: 'Inter-Regular', fontSize: 11, color: colors.neutral[400] },
  miniMetricValue: { fontFamily: 'Inter-Bold', fontSize: 20, marginTop: 4 },

  // Conversions
  convRow: { flexDirection: 'row', gap: 8 },
  convBadge: { flex: 1, padding: 8, borderRadius: 10, backgroundColor: colors.neutral[800], alignItems: 'center' },
  convBadgeLabel: { fontFamily: 'Inter-Regular', fontSize: 10, color: colors.neutral[400] },
  convBadgeValue: { fontFamily: 'Inter-SemiBold', fontSize: 14, color: colors.neutral[100], marginTop: 2 },

  sectionTitle: {
    fontFamily: 'Inter-SemiBold', fontSize: 16, color: colors.neutral[200],
    marginTop: 4, marginBottom: 2,
  },
  empty: { fontFamily: 'Inter-Regular', fontSize: 14, color: colors.neutral[400], textAlign: 'center', marginTop: 24 },
  loader: { marginTop: 20 },
});
