import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BarChart3, Check, DollarSign, LogOut, Pencil, RefreshCw, TrendingUp, Users } from 'lucide-react-native';
import { ErrorBanner } from '@/components/ErrorBanner';
import { ScreenHeader } from '@/components/ScreenHeader';
import { fetchExternalAnalytics, ExternalAnalyticsResponse } from '@/lib/externalCrm';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function currency(value: number) {
  if (!isFinite(value) || value <= 0) return '—';
  return `$${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}`;
}

async function loadBudget(): Promise<number> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'monthly_budget').maybeSingle();
  return data ? parseFloat(data.value) || 0 : 0;
}

async function saveBudget(amount: number) {
  await supabase.from('app_settings').upsert({ key: 'monthly_budget', value: String(amount) });
}

export default function AnalyticsScreen() {
  const { role, signOut } = useAuth();
  const [data, setData] = useState<ExternalAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [budget, setBudget] = useState(0);
  const [budgetInput, setBudgetInput] = useState('');
  const [editingBudget, setEditingBudget] = useState(false);
  const budgetRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [analytics, savedBudget] = await Promise.all([fetchExternalAnalytics(), loadBudget()]);
      setData(analytics);
      setBudget(savedBudget);
      setBudgetInput(savedBudget > 0 ? String(savedBudget) : '');
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

  const confirmBudget = async () => {
    const val = parseFloat(budgetInput.replace(',', '.')) || 0;
    setBudget(val);
    setEditingBudget(false);
    await saveBudget(val);
  };

  if (role !== 'admin') return null;

  const totals = data?.totals;
  const rows = data?.by_agent ?? [];

  const costPerLead = budget > 0 && totals && totals.total > 0 ? budget / totals.total : 0;
  const costPerWork = budget > 0 && totals && totals.in_work > 0 ? budget / totals.in_work : 0;
  const costPerDeposit = budget > 0 && totals && totals.deposits > 0 ? budget / totals.deposits : 0;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary[400]} />}
      >
        {error ? <ErrorBanner message={error} /> : null}

        {/* Budget input */}
        <View style={styles.budgetCard}>
          <View style={styles.budgetHeader}>
            <DollarSign size={18} color={colors.warning[400]} />
            <Text style={styles.budgetTitle}>Расходы за период</Text>
          </View>
          <Text style={styles.budgetHint}>Укажите общие затраты (трафик, сервисы и т.д.) — без зарплат агентов</Text>
          <View style={styles.budgetRow}>
            {editingBudget ? (
              <>
                <TextInput
                  ref={budgetRef}
                  style={styles.budgetInput}
                  value={budgetInput}
                  onChangeText={setBudgetInput}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.neutral[600]}
                  autoFocus
                  onSubmitEditing={confirmBudget}
                />
                <TouchableOpacity style={styles.budgetConfirm} onPress={confirmBudget}>
                  <Check size={18} color={colors.neutral[0]} />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.budgetValue}>
                  {budget > 0 ? `$${budget.toLocaleString('ru-RU')}` : 'Не задано'}
                </Text>
                <TouchableOpacity style={styles.budgetEdit} onPress={() => setEditingBudget(true)}>
                  <Pencil size={15} color={colors.neutral[300]} />
                  <Text style={styles.budgetEditLabel}>Изменить</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Cost breakdown */}
        {totals && !error && budget > 0 ? (
          <View style={styles.costCard}>
            <View style={styles.costHeader}>
              <TrendingUp size={18} color={colors.accent[400]} />
              <Text style={styles.costTitle}>Стоимость клиента</Text>
            </View>
            <Text style={styles.costFormula}>
              Расходы ${budget.toLocaleString('ru-RU')} ÷ количество на каждом этапе воронки
            </Text>
            <View style={styles.costSteps}>
              <CostStep
                label="1 лид"
                sublabel={`всего ${totals.total}`}
                value={currency(costPerLead)}
                color={colors.neutral[200]}
                dim={totals.total === 0}
              />
              <View style={styles.costArrow}><Text style={styles.costArrowText}>→</Text></View>
              <CostStep
                label="1 в работе"
                sublabel={`${totals.in_work} чел.`}
                value={currency(costPerWork)}
                color={colors.primary[300]}
                dim={totals.in_work === 0}
              />
              <View style={styles.costArrow}><Text style={styles.costArrowText}>→</Text></View>
              <CostStep
                label="1 депозит"
                sublabel={`${totals.deposits} чел.`}
                value={currency(costPerDeposit)}
                color={colors.accent[400]}
                dim={totals.deposits === 0}
              />
            </View>
          </View>
        ) : null}

        {/* Totals summary */}
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
              <View style={styles.agentIcon}><Users size={17} color={colors.primary[300]} /></View>
              <View style={styles.agentTitle}>
                <Text style={styles.agentName}>{row.agent_name}</Text>
                <Text style={styles.total}>{row.total} лидов назначено</Text>
              </View>
            </View>
            <View style={styles.metrics}>
              <Metric label="В работе" value={row.in_work} conversion={percent(row.work_conversion)} color={colors.primary[300]} />
              <Metric label="Депозит" value={row.deposits} conversion={percent(row.deposit_conversion)} color={colors.accent[400]} />
              <Metric label="Не валид" value={row.invalid} conversion={percent(row.invalid_conversion)} color={colors.error[400]} />
            </View>
            {Object.entries(row.statuses).filter(([s]) => !['В работе', 'Депозит', 'Не валид'].includes(s)).length > 0 ? (
              <View style={styles.statusList}>
                {Object.entries(row.statuses)
                  .filter(([s]) => !['В работе', 'Депозит', 'Не валид'].includes(s))
                  .map(([status, count]) => (
                    <View style={styles.statusLine} key={status}>
                      <Text style={styles.statusName}>{status}</Text>
                      <Text style={styles.statusCount}>{count} ({percent(row.total ? count / row.total : 0)})</Text>
                    </View>
                  ))}
              </View>
            ) : null}
          </View>
        ))}

        {loading ? <ActivityIndicator color={colors.primary[400]} style={styles.loader} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function CostStep({ label, sublabel, value, color, dim }: { label: string; sublabel: string; value: string; color: string; dim: boolean }) {
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

  // Budget
  budgetCard: { padding: 18, borderRadius: 16, backgroundColor: colors.neutral[900], borderWidth: 1, borderColor: colors.warning[600] },
  budgetHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  budgetTitle: { fontFamily: 'Inter-SemiBold', fontSize: 15, color: colors.neutral[0] },
  budgetHint: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.neutral[500], marginBottom: 14, lineHeight: 17 },
  budgetRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  budgetValue: { fontFamily: 'Inter-Bold', fontSize: 28, color: colors.warning[400], flex: 1 },
  budgetEdit: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.neutral[800] },
  budgetEditLabel: { fontFamily: 'Inter-Regular', fontSize: 13, color: colors.neutral[300] },
  budgetInput: { flex: 1, fontFamily: 'Inter-Bold', fontSize: 28, color: colors.warning[400], borderBottomWidth: 2, borderBottomColor: colors.warning[500], paddingBottom: 4 },
  budgetConfirm: { padding: 10, borderRadius: 10, backgroundColor: colors.accent[600] },

  // Cost breakdown
  costCard: { padding: 18, borderRadius: 16, backgroundColor: colors.neutral[900], borderWidth: 1, borderColor: colors.accent[700] },
  costHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  costTitle: { fontFamily: 'Inter-SemiBold', fontSize: 15, color: colors.neutral[0] },
  costFormula: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.neutral[500], marginBottom: 16, lineHeight: 17 },
  costSteps: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  costStep: { flex: 1, padding: 12, borderRadius: 12, backgroundColor: colors.neutral[800], alignItems: 'center', gap: 3 },
  costStepDim: { opacity: 0.45 },
  costStepLabel: { fontFamily: 'Inter-SemiBold', fontSize: 11, color: colors.neutral[300], textAlign: 'center' },
  costStepSub: { fontFamily: 'Inter-Regular', fontSize: 10, color: colors.neutral[500], textAlign: 'center' },
  costStepValue: { fontFamily: 'Inter-Bold', fontSize: 15, textAlign: 'center', marginTop: 2 },
  costArrow: { paddingHorizontal: 2 },
  costArrowText: { fontFamily: 'Inter-Regular', fontSize: 16, color: colors.neutral[600] },

  // Totals
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

  // Agent cards
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
