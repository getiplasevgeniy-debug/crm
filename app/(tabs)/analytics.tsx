import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BarChart3, LogOut, RefreshCw, Users } from 'lucide-react-native';
import { ErrorBanner } from '@/components/ErrorBanner';
import { ScreenHeader } from '@/components/ScreenHeader';
import { fetchExternalAnalytics, ExternalAnalyticsRow } from '@/lib/externalCrm';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export default function AnalyticsScreen() {
  const { role, signOut } = useAuth();
  const [rows, setRows] = useState<ExternalAnalyticsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await fetchExternalAnalytics());
    } catch {
      setError('Не удалось загрузить аналитику второй CRM. Проверьте подключение.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (role !== 'admin') return null;

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Аналитика лидов"
        subtitle="Данные по статусам второй CRM"
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary[400]} />}
      >
        {error ? <ErrorBanner message={error} /> : null}
        <View style={styles.definitionCard}>
          <BarChart3 size={20} color={colors.primary[300]} />
          <Text style={styles.definitionText}>Взятие в работу = статус «В работе». Конверсия депозитов считается от взятых в работу.</Text>
        </View>
        {rows.length === 0 && !loading && !error ? <Text style={styles.empty}>Внешняя CRM пока не вернула лидов.</Text> : null}
        {rows.map((row) => (
          <View style={styles.card} key={row.agent_id}>
            <View style={styles.cardHeader}>
              <View style={styles.agentIcon}><Users size={17} color={colors.primary[300]} /></View>
              <View style={styles.agentTitle}><Text style={styles.agentName}>{row.agent_name}</Text><Text style={styles.total}>{row.total} лидов назначено</Text></View>
            </View>
            <View style={styles.metrics}>
              <Metric label="В работе" value={row.in_work} conversion={percent(row.work_conversion)} color={colors.primary[300]} />
              <Metric label="Депозит" value={row.deposits} conversion={percent(row.deposit_conversion)} color={colors.accent[400]} />
              <Metric label="Не валид" value={row.invalid} conversion={percent(row.invalid_conversion)} color={colors.error[400]} />
            </View>
          </View>
        ))}
        {loading ? <ActivityIndicator color={colors.primary[400]} style={styles.loader} /> : null}
      </ScrollView>
    </View>
  );
}

function Metric({ label, value, conversion, color }: { label: string; value: number; conversion: string; color: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Text style={styles.metricConversion}>{conversion} конверсия</Text>
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
  empty: { fontFamily: 'Inter-Regular', fontSize: 14, color: colors.neutral[400], textAlign: 'center', marginTop: 24 },
  loader: { marginTop: 20 },
});
