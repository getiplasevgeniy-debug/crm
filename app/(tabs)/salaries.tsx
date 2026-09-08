import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { supabase, Manager, SalaryPayment } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { formatMoney, formatDate, currentMonthKey, getMonthRange, defaultDateForMonth } from '@/lib/format';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SheetModal } from '@/components/SheetModal';
import { LabeledInput } from '@/components/LabeledInput';
import { ActionButton } from '@/components/ActionButton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { MonthPicker } from '@/components/MonthPicker';
import { Badge } from '@/components/Badge';
import { Wallet, ChevronDown, ChevronUp, Check, LogOut, Trash2, Pencil } from 'lucide-react-native';
import { useAuth } from '@/lib/auth';
import { confirmDialog, alertDialog } from '@/lib/confirm';

type SalaryCalc = {
  manager: Manager;
  totalTransactions: number;
  totalAmount: number;
  salaryFromPct: number;
  totalBonuses: number;
  totalPaid: number;
  owed: number;
};

export default function SalariesScreen() {
  const { role, signOut } = useAuth();
  const isAdmin = role === 'admin';
  const [calcData, setCalcData] = useState<SalaryCalc[]>([]);
  const [payments, setPayments] = useState<(SalaryPayment & { managers: { name: string } | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey());

  const [payModalVisible, setPayModalVisible] = useState(false);
  const [payManager, setPayManager] = useState<SalaryCalc | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [payDate, setPayDate] = useState('');

  const fetchData = useCallback(async () => {
    setError(null);
    const { data: mgrData, error: mgrErr } = await supabase
      .from('managers')
      .select('id, name, phone, salary_percentage, created_at')
      .order('name');

    if (mgrErr) {
      setError(mgrErr.message);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const managers = (mgrData || []) as Manager[];
    const result: SalaryCalc[] = [];

    for (const m of managers) {
      const [txRes, bnRes, payRes] = await Promise.all([
        supabase.from('transactions').select('amount, created_at').eq('manager_id', m.id),
        supabase.from('bonuses').select('amount, created_at').eq('manager_id', m.id),
        supabase.from('salary_payments').select('amount, created_at').eq('manager_id', m.id),
      ]);

      const { start, end } = getMonthRange(selectedMonth);
      const totalAmount = (txRes.data || [])
        .filter((t) => t.created_at >= start && t.created_at < end)
        .reduce((s, t) => s + Number(t.amount), 0);
      const totalBonuses = (bnRes.data || [])
        .filter((b) => b.created_at >= start && b.created_at < end)
        .reduce((s, b) => s + Number(b.amount), 0);
      const totalPaid = (payRes.data || [])
        .filter((p) => p.created_at >= start && p.created_at < end)
        .reduce((s, p) => s + Number(p.amount), 0);
      const salaryFromPct = (totalAmount * m.salary_percentage) / 100;
      const owed = salaryFromPct + totalBonuses - totalPaid;

      result.push({
        manager: m,
        totalTransactions: (txRes.data || []).filter(
          (t) => t.created_at >= start && t.created_at < end,
        ).length,
        totalAmount,
        salaryFromPct,
        totalBonuses,
        totalPaid,
        owed,
      });
    }

    setCalcData(result);

    const { start: pStart, end: pEnd } = getMonthRange(selectedMonth);
    const { data: payData } = await supabase
      .from('salary_payments')
      .select('id, manager_id, amount, period_start, period_end, note, created_at, managers:manager_id(name)')
      .gte('created_at', pStart)
      .lt('created_at', pEnd)
      .order('created_at', { ascending: false })
      .limit(50);

    setPayments((payData || []) as unknown as (SalaryPayment & { managers: { name: string } | null })[]);
    setLoading(false);
    setRefreshing(false);
  }, [selectedMonth]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchData();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleDeletePayment = (p: any) => {
    confirmDialog('Удалить выплату?', `${p.managers?.name || '—'}: ${formatMoney(Number(p.amount))}`, async () => {
      const { error: err } = await supabase.from('salary_payments').delete().eq('id', p.id);
      if (err) {
        alertDialog('Ошибка', err.message);
        return;
      }
      fetchData();
    });
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const openPay = (item: SalaryCalc) => {
    setPayManager(item);
    setPayAmount(String(item.owed > 0 ? item.owed.toFixed(2) : ''));
    setPayNote('');
    setPayDate(defaultDateForMonth(selectedMonth));
    setPayModalVisible(true);
  };

  const handlePay = async () => {
    if (!payManager) return;
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) {
      alertDialog('Ошибка', 'Введите сумму больше 0');
      return;
    }

    setSaving(true);
    const { error: err } = await supabase.from('salary_payments').insert({
      manager_id: payManager.manager.id,
      amount: amt,
      note: payNote.trim() || null,
      created_at: new Date(payDate).toISOString(),
    });

    if (err) {
      alertDialog('Ошибка', err.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    setPayModalVisible(false);
    fetchData();
  };

  const totalOwed = calcData.reduce((s, c) => s + (c.owed > 0 ? c.owed : 0), 0);
  const totalPaid = calcData.reduce((s, c) => s + c.totalPaid, 0);

  const renderItem = ({ item }: { item: SalaryCalc }) => {
    const expanded = expandedId === item.manager.id;
    const hasDebt = item.owed > 0.01;
    return (
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.cardHeader}
          onPress={() => setExpandedId(expanded ? null : item.manager.id)}
          activeOpacity={0.7}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{item.manager.name}</Text>
            <Text style={styles.pctText}>Процент: {item.manager.salary_percentage}%</Text>
          </View>
          <View style={styles.owedWrap}>
            <Text style={styles.owedLabel}>Выплачено</Text>
            <Text style={styles.paidValue}>{formatMoney(item.totalPaid)}</Text>
            <Text style={[styles.owedLabel, { marginTop: 6 }]}>К выплате</Text>
            <Text style={[styles.owedValue, !hasDebt && { color: colors.accent[500] }]}>
              {formatMoney(item.owed)}
            </Text>
          </View>
          {expanded ? (
            <ChevronUp size={20} color={colors.neutral[400]} />
          ) : (
            <ChevronDown size={20} color={colors.neutral[400]} />
          )}
        </TouchableOpacity>

        {expanded ? (
          <View style={styles.detailBody}>
            <DetailRow label="Транзакций" value={`${item.totalTransactions} шт`} />
            <DetailRow label="Сумма транзакций" value={formatMoney(item.totalAmount)} />
            <DetailRow
              label={`Зарплата (${item.manager.salary_percentage}%)`}
              value={formatMoney(item.salaryFromPct)}
            />
            <DetailRow label="Бонусы" value={`+ ${formatMoney(item.totalBonuses)}`} />
            <DetailRow label="Выплачено" value={`- ${formatMoney(item.totalPaid)}`} />
            <View style={styles.divider} />
            <DetailRow label="Итого к выплате" value={formatMoney(item.owed)} bold />

            {hasDebt && isAdmin ? (
              <View>
                <TouchableOpacity
                  style={styles.payBtn}
                  onPress={() => openPay(item)}
                  activeOpacity={0.85}
                >
                  <Wallet size={18} color={colors.neutral[0]} />
                  <Text style={styles.payBtnText}>Выплатить {formatMoney(item.owed)}</Text>
                </TouchableOpacity>
                <Text style={styles.remainingText}>
                  Остаток к выплате: {formatMoney(item.owed)}
                </Text>
              </View>
            ) : hasDebt && !isAdmin ? (
              <View style={styles.paidBadge}>
                <Wallet size={16} color={colors.warning[500]} />
                <Text style={[styles.paidText, { color: colors.warning[600] }]}>К выплате: {formatMoney(item.owed)}</Text>
              </View>
            ) : (
              <View style={styles.paidBadge}>
                <Check size={16} color={colors.accent[600]} />
                <Text style={styles.paidText}>Зарплата выплачена полностью</Text>
              </View>
            )}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Зарплаты"
        subtitle={`Долг: ${formatMoney(totalOwed)} · Выплачено: ${formatMoney(totalPaid)}`}
        loading={loading}
        right={
          <TouchableOpacity onPress={signOut} hitSlop={12} style={styles.logoutBtn}>
            <LogOut size={20} color={colors.neutral[400]} />
          </TouchableOpacity>
        }
      >
        {error ? <ErrorBanner message={error} /> : null}
      </ScreenHeader>

      <MonthPicker value={selectedMonth} onChange={setSelectedMonth} />

      <FlatList
        data={calcData}
        keyExtractor={(item) => item.manager.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[400]} />}
        ListEmptyComponent={
          !loading ? <EmptyState message="Нет менеджеров. Добавьте их на вкладке «Менеджеры»." /> : null
        }
        ListFooterComponent={
          payments.length > 0 ? (
            <View style={styles.historySection}>
              <Text style={styles.historyTitle}>История выплат за месяц</Text>
              {payments.map((p) => (
                <View key={p.id} style={styles.historyItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyName}>{p.managers?.name || '—'}</Text>
                    {p.note ? <Text style={styles.historyNote}>{p.note}</Text> : null}
                    <Text style={styles.historyDate}>{formatDate(p.created_at)}</Text>
                  </View>
                  <View style={styles.historyRight}>
                    <Badge variant="success">- {formatMoney(Number(p.amount))}</Badge>
                    <TouchableOpacity onPress={() => handleDeletePayment(p)} hitSlop={10} style={styles.historyDelBtn}>
                      <Trash2 size={14} color={colors.error[400]} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : null
        }
      />

      <SheetModal
        visible={payModalVisible}
        onClose={() => setPayModalVisible(false)}
        title={`Выплата: ${payManager?.manager.name || ''}`}
      >
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>К выплате</Text>
          <Text style={styles.summaryValue}>
            {payManager ? formatMoney(payManager.owed) : ''}
          </Text>
        </View>
        <LabeledInput
          label="Сумма выплаты"
          value={payAmount}
          onChangeText={setPayAmount}
          placeholder="0.00"
          keyboardType="numeric"
        />
        <LabeledInput
          label="Дата"
          value={payDate}
          onChangeText={setPayDate}
          datePicker
        />
        <LabeledInput
          label="Комментарий"
          value={payNote}
          onChangeText={setPayNote}
          placeholder="За период / аванс (необязательно)"
          multiline
        />
        <View style={{ height: 8 }} />
        <ActionButton label="Подтвердить выплату" onPress={handlePay} loading={saving} />
      </SheetModal>
    </View>
  );
}

function DetailRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, bold && styles.detailLabelBold]}>{label}</Text>
      <Text style={[styles.detailValue, bold && styles.detailValueBold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral[950],
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 4,
  },
  card: {
    backgroundColor: colors.neutral[900],
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.neutral[800],
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  name: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 17,
    color: colors.neutral[0],
  },
  pctText: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: colors.neutral[400],
    marginTop: 2,
  },
  owedWrap: {
    alignItems: 'flex-end',
    marginRight: 12,
  },
  owedLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: colors.neutral[500],
    marginBottom: 2,
  },
  owedValue: {
    fontFamily: 'Inter-Bold',
    fontSize: 17,
    color: colors.warning[500],
  },
  paidValue: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: colors.accent[500],
  },
  remainingText: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: colors.neutral[400],
    textAlign: 'center',
    marginTop: 8,
  },
  detailBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.neutral[800],
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  detailLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: colors.neutral[400],
  },
  detailLabelBold: {
    color: colors.neutral[200],
    fontFamily: 'Inter-SemiBold',
  },
  detailValue: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: colors.neutral[200],
  },
  detailValueBold: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    color: colors.neutral[0],
  },
  divider: {
    height: 1,
    backgroundColor: colors.neutral[800],
    marginVertical: 8,
  },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent[500],
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 12,
  },
  payBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: colors.neutral[0],
  },
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
  paidText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: colors.accent[600],
  },
  logoutBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: colors.neutral[800],
  },
  historySection: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.neutral[800],
  },
  historyTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: colors.neutral[200],
    marginBottom: 12,
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.neutral[900],
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.neutral[800],
  },
  historyRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  historyDelBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.neutral[800],
  },
  historyName: {
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    color: colors.neutral[0],
  },
  historyNote: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: colors.neutral[400],
    marginTop: 2,
  },
  historyDate: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: colors.neutral[500],
    marginTop: 2,
  },
  summaryBox: {
    backgroundColor: colors.neutral[800],
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  summaryLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: colors.neutral[400],
  },
  summaryValue: {
    fontFamily: 'Inter-Bold',
    fontSize: 20,
    color: colors.warning[500],
  },
});
