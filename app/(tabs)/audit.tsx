import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ScrollView,
} from 'react-native';
import { supabase, LedgerEntry, Manager } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { formatMoney, formatDate, currentMonthKey, getMonthRange, defaultDateForMonth, toKyivISODate } from '@/lib/format';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SheetModal } from '@/components/SheetModal';
import { LabeledInput } from '@/components/LabeledInput';
import { ActionButton } from '@/components/ActionButton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Badge } from '@/components/Badge';
import { MonthPicker } from '@/components/MonthPicker';
import {
  TrendingUp,
  TrendingDown,
  Plus,
  LogOut,
  BarChart3,
  Users,
  Trash2,
  Pencil,
} from 'lucide-react-native';
import { useAuth } from '@/lib/auth';
import { confirmDialog, alertDialog } from '@/lib/confirm';

type LedgerRow = LedgerEntry & { managers: { name: string } | null };

// Unified entry shown in history — ledger_entries editable, others read-only
type UnifiedEntry = {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  comment: string;
  managerName: string | null;
  createdAt: string;
  source: 'ledger' | 'transaction' | 'salary';
  raw?: LedgerRow;
};

type ManagerSummary = {
  managerId: string;
  managerName: string;
  income: number;
  expense: number;
  net: number;
  txCount: number;
};

export default function AuditScreen() {
  const { signOut } = useAuth();
  const [ledgerEntries, setLedgerEntries] = useState<LedgerRow[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey());

  // Add/edit modal
  const [modalVisible, setModalVisible] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LedgerRow | null>(null);
  const [entryType, setEntryType] = useState<'income' | 'expense'>('income');
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [managerId, setManagerId] = useState('');
  const [saving, setSaving] = useState(false);
  const [entryDate, setEntryDate] = useState('');

  // Raw transactions + salary_payments for merged income/expense view
  const [rawTransactions, setRawTransactions] = useState<
    { id: string; manager_id: string; amount: number; description: string | null; created_at: string; managers: { name: string } | null }[]
  >([]);
  const [rawSalaries, setRawSalaries] = useState<
    { id: string; manager_id: string; amount: number; note: string | null; created_at: string; managers: { name: string } | null }[]
  >([]);

  const fetchData = useCallback(async () => {
    setError(null);
    const [ledgerRes, mgrRes, txRes, salRes] = await Promise.all([
      supabase
        .from('ledger_entries')
        .select('id, type, amount, comment, manager_id, created_at, managers:manager_id(name)')
        .order('created_at', { ascending: false })
        .limit(500),
      supabase.from('managers').select('id, name').order('name'),
      supabase
        .from('transactions')
        .select('id, manager_id, amount, description, created_at, managers:manager_id(name)')
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('salary_payments')
        .select('id, manager_id, amount, note, created_at, managers:manager_id(name)')
        .order('created_at', { ascending: false })
        .limit(500),
    ]);

    if (ledgerRes.error) {
      setError(ledgerRes.error.message);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setLedgerEntries((ledgerRes.data || []) as unknown as LedgerRow[]);
    setManagers((mgrRes.data || []) as Manager[]);
    setRawTransactions((txRes.data || []) as any);
    setRawSalaries((salRes.data || []) as any);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const { start, end } = getMonthRange(selectedMonth);

  // Merge all sources into unified entries filtered by month
  const monthEntries = useMemo<UnifiedEntry[]>(() => {
    const items: UnifiedEntry[] = [];

    for (const e of ledgerEntries) {
      if (!e.created_at || e.created_at < start || e.created_at >= end) continue;
      items.push({
        id: `l-${e.id}`,
        type: e.type,
        amount: Number(e.amount),
        comment: e.comment || '—',
        managerName: e.managers?.name || null,
        createdAt: e.created_at,
        source: 'ledger',
        raw: e,
      });
    }

    for (const t of rawTransactions) {
      if (!t.created_at || t.created_at < start || t.created_at >= end) continue;
      items.push({
        id: `t-${t.id}`,
        type: 'income',
        amount: Number(t.amount),
        comment: t.description || 'Пополнение',
        managerName: t.managers?.name || null,
        createdAt: t.created_at,
        source: 'transaction',
      });
    }

    for (const s of rawSalaries) {
      if (!s.created_at || s.created_at < start || s.created_at >= end) continue;
      items.push({
        id: `s-${s.id}`,
        type: 'expense',
        amount: Number(s.amount),
        comment: s.note ? `Выплата: ${s.note}` : 'Выплата зарплаты',
        managerName: s.managers?.name || null,
        createdAt: s.created_at,
        source: 'salary',
      });
    }

    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [ledgerEntries, rawTransactions, rawSalaries, start, end]);

  const totalIncome = monthEntries
    .filter((e) => e.type === 'income')
    .reduce((s, e) => s + e.amount, 0);
  const totalExpense = monthEntries
    .filter((e) => e.type === 'expense')
    .reduce((s, e) => s + e.amount, 0);
  const netProfit = totalIncome - totalExpense;

  const allTimeIncome = useMemo(() => {
    const ledgerInc = ledgerEntries.filter((e) => e.type === 'income').reduce((s, e) => s + Number(e.amount), 0);
    const txInc = rawTransactions.reduce((s, t) => s + Number(t.amount), 0);
    return ledgerInc + txInc;
  }, [ledgerEntries, rawTransactions]);

  const allTimeExpense = useMemo(() => {
    const ledgerExp = ledgerEntries.filter((e) => e.type === 'expense').reduce((s, e) => s + Number(e.amount), 0);
    const salaryExp = rawSalaries.reduce((s, p) => s + Number(p.amount), 0);
    return ledgerExp + salaryExp;
  }, [ledgerEntries, rawSalaries]);

  const allTimeNet = allTimeIncome - allTimeExpense;

  const managerSummaries = useMemo<ManagerSummary[]>(() => {
    const map = new Map<string, ManagerSummary>();
    for (const e of monthEntries) {
      const key = e.managerName || 'unassigned';
      const name = e.managerName || 'Без менеджера';
      if (!map.has(key)) {
        map.set(key, { managerId: key, managerName: name, income: 0, expense: 0, net: 0, txCount: 0 });
      }
      const s = map.get(key)!;
      s.txCount++;
      if (e.type === 'income') s.income += e.amount;
      else s.expense += e.amount;
      s.net = s.income - s.expense;
    }
    return Array.from(map.values()).sort((a, b) => b.net - a.net);
  }, [monthEntries]);

  const openAdd = (type: 'income' | 'expense') => {
    setEditingEntry(null);
    setEntryType(type);
    setAmount('');
    setComment('');
    setManagerId('');
    setEntryDate(defaultDateForMonth(selectedMonth));
    setModalVisible(true);
  };

  const openEdit = (entry: UnifiedEntry) => {
    if (entry.source !== 'ledger' || !entry.raw) return;
    setEditingEntry(entry.raw);
    setEntryType(entry.raw.type);
    setAmount(String(Number(entry.raw.amount)));
    setComment(entry.raw.comment || '');
    setManagerId(entry.raw.manager_id || '');
    setEntryDate(entry.raw.created_at.slice(0, 10));
    setModalVisible(true);
  };

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      alertDialog('Ошибка', 'Введите сумму больше 0');
      return;
    }
    if (!comment.trim()) {
      alertDialog('Ошибка', 'Введите комментарий');
      return;
    }

    setSaving(true);

    if (editingEntry) {
      const { error: err } = await supabase
        .from('ledger_entries')
        .update({
          type: entryType,
          amount: amt,
          comment: comment.trim(),
          manager_id: managerId || null,
          created_at: toKyivISODate(entryDate),
        })
        .eq('id', editingEntry.id);

      if (err) {
        alertDialog('Ошибка', err.message);
        setSaving(false);
        return;
      }
    } else {
      const { error: err } = await supabase.from('ledger_entries').insert({
        type: entryType,
        amount: amt,
        comment: comment.trim(),
        manager_id: managerId || null,
        created_at: toKyivISODate(entryDate),
      });

      if (err) {
        alertDialog('Ошибка', err.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setModalVisible(false);
    fetchData();
  };

  const handleDelete = (entry: UnifiedEntry) => {
    const label = entry.type === 'income' ? 'Доход' : 'Расход';
    const extra =
      entry.source === 'transaction'
        ? '\n\nЭто пополнение менеджера. Удаление произойдёт во вкладке «Транзакции».'
        : entry.source === 'salary'
        ? '\n\nЭто выплата зарплаты. Удаление произойдёт во вкладке «Зарплаты».'
        : '';

    confirmDialog('Удалить запись?', `${label}: ${formatMoney(entry.amount)}${extra}`, async () => {
      let err: any = null;
      if (entry.source === 'ledger' && entry.raw) {
        ({ error: err } = await supabase.from('ledger_entries').delete().eq('id', entry.raw.id));
      } else if (entry.source === 'transaction') {
        const rawId = entry.id.replace('t-', '');
        ({ error: err } = await supabase.from('transactions').delete().eq('id', rawId));
      } else if (entry.source === 'salary') {
        const rawId = entry.id.replace('s-', '');
        ({ error: err } = await supabase.from('salary_payments').delete().eq('id', rawId));
      }
      if (err) {
        alertDialog('Ошибка', err.message);
        return;
      }
      fetchData();
    });
  };

  const sourceLabel = (source: UnifiedEntry['source']) => {
    if (source === 'transaction') return 'Пополнение';
    if (source === 'salary') return 'Выплата ЗП';
    return null;
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Аудит"
        loading={loading}
        right={
          <TouchableOpacity onPress={signOut} hitSlop={12} style={styles.logoutBtn}>
            <LogOut size={20} color={colors.neutral[400]} />
          </TouchableOpacity>
        }
      >
        {error ? <ErrorBanner message={error} /> : null}
      </ScreenHeader>

      <FlatList
        data={monthEntries}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isIncome = item.type === 'income';
          const tag = sourceLabel(item.source);
          const canEdit = item.source === 'ledger';
          return (
            <View style={styles.historyItem}>
              <View style={styles.historyLeft}>
                <View
                  style={[
                    styles.iconWrap,
                    { backgroundColor: isIncome ? colors.accent[100] : colors.error[100] },
                  ]}
                >
                  {isIncome ? (
                    <TrendingUp size={18} color={colors.accent[600]} />
                  ) : (
                    <TrendingDown size={18} color={colors.error[600]} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.commentRow}>
                    <Text style={styles.historyComment} numberOfLines={2}>
                      {item.comment}
                    </Text>
                    {tag ? (
                      <View
                        style={[
                          styles.sourceTag,
                          {
                            backgroundColor:
                              item.source === 'transaction'
                                ? colors.accent[100]
                                : colors.warning[100],
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.sourceTagText,
                            {
                              color:
                                item.source === 'transaction'
                                  ? colors.accent[700]
                                  : colors.warning[600],
                            },
                          ]}
                        >
                          {tag}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {item.managerName ? (
                    <Text style={styles.historyManager}>{item.managerName}</Text>
                  ) : null}
                  <Text style={styles.historyDate}>{formatDate(item.createdAt)}</Text>
                </View>
              </View>
              <View style={styles.historyRight}>
                <Badge variant={isIncome ? 'success' : 'error'}>
                  {isIncome ? '+ ' : '- '}
                  {formatMoney(item.amount)}
                </Badge>
                <View style={styles.actionIcons}>
                  {canEdit ? (
                    <TouchableOpacity
                      onPress={() => openEdit(item)}
                      hitSlop={10}
                      style={styles.iconBtn}
                    >
                      <Pencil size={14} color={colors.primary[400]} />
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    onPress={() => handleDelete(item)}
                    hitSlop={10}
                    style={styles.iconBtn}
                  >
                    <Trash2 size={14} color={colors.error[400]} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        }}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary[400]}
          />
        }
        ListEmptyComponent={!loading ? <EmptyState message="Нет записей за этот месяц." /> : null}
        ListHeaderComponent={
          <View>
            <MonthPicker value={selectedMonth} onChange={setSelectedMonth} />

            <View style={styles.allTimeCard}>
              <View style={styles.allTimeHeader}>
                <Text style={styles.allTimeTitle}>За всё время</Text>
              </View>
              <View style={styles.allTimeRow}>
                <View style={styles.allTimeItem}>
                  <Text style={styles.allTimeLabel}>Доход</Text>
                  <Text style={[styles.allTimeValue, { color: colors.accent[400] }]}>
                    {formatMoney(allTimeIncome)}
                  </Text>
                </View>
                <View style={styles.allTimeDivider} />
                <View style={styles.allTimeItem}>
                  <Text style={styles.allTimeLabel}>Расход</Text>
                  <Text style={[styles.allTimeValue, { color: colors.error[400] }]}>
                    {formatMoney(allTimeExpense)}
                  </Text>
                </View>
                <View style={styles.allTimeDivider} />
                <View style={styles.allTimeItem}>
                  <Text style={styles.allTimeLabel}>Чистая прибыль</Text>
                  <Text
                    style={[
                      styles.allTimeValue,
                      { color: allTimeNet >= 0 ? colors.primary[400] : colors.warning[500] },
                    ]}
                  >
                    {formatMoney(allTimeNet)}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.summaryRow}>
              <View style={[styles.summaryCard, { backgroundColor: colors.accent[700] }]}>
                <TrendingUp size={16} color={colors.neutral[0]} />
                <Text style={styles.summaryCardLabel}>Доход</Text>
                <Text style={styles.summaryCardValue}>{formatMoney(totalIncome)}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: colors.error[600] }]}>
                <TrendingDown size={16} color={colors.neutral[0]} />
                <Text style={styles.summaryCardLabel}>Расход</Text>
                <Text style={styles.summaryCardValue}>{formatMoney(totalExpense)}</Text>
              </View>
              <View
                style={[
                  styles.summaryCard,
                  { backgroundColor: netProfit >= 0 ? colors.primary[700] : colors.warning[600] },
                ]}
              >
                <BarChart3 size={16} color={colors.neutral[0]} />
                <Text style={styles.summaryCardLabel}>Прибыль</Text>
                <Text style={styles.summaryCardValue}>{formatMoney(netProfit)}</Text>
              </View>
            </View>

            {managerSummaries.length > 0 ? (
              <View style={styles.managerSection}>
                <View style={styles.sectionTitleRow}>
                  <Users size={16} color={colors.neutral[300]} />
                  <Text style={styles.sectionTitle}>Сводка по менеджерам</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {managerSummaries.map((m) => (
                    <View key={m.managerId} style={styles.mgrCard}>
                      <Text style={styles.mgrName}>{m.managerName}</Text>
                      <View style={styles.mgrRow}>
                        <Text style={styles.mgrLabel}>Доход:</Text>
                        <Text style={[styles.mgrValue, { color: colors.accent[400] }]}>
                          {formatMoney(m.income)}
                        </Text>
                      </View>
                      <View style={styles.mgrRow}>
                        <Text style={styles.mgrLabel}>Расход:</Text>
                        <Text style={[styles.mgrValue, { color: colors.error[400] }]}>
                          {formatMoney(m.expense)}
                        </Text>
                      </View>
                      <View style={styles.mgrRow}>
                        <Text style={styles.mgrLabel}>Чистая:</Text>
                        <Text
                          style={[
                            styles.mgrValue,
                            { color: m.net >= 0 ? colors.primary[400] : colors.warning[500] },
                          ]}
                        >
                          {formatMoney(m.net)}
                        </Text>
                      </View>
                      <Text style={styles.mgrTxCount}>{m.txCount} операций</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.accent[600] }]}
                onPress={() => openAdd('income')}
                activeOpacity={0.85}
              >
                <Plus size={18} color={colors.neutral[0]} />
                <Text style={styles.actionBtnText}>Добавить доход</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.error[500] }]}
                onPress={() => openAdd('expense')}
                activeOpacity={0.85}
              >
                <Plus size={18} color={colors.neutral[0]} />
                <Text style={styles.actionBtnText}>Добавить расход</Text>
              </TouchableOpacity>
            </View>

            {monthEntries.length > 0 ? (
              <Text style={styles.listTitle}>История операций</Text>
            ) : null}
          </View>
        }
      />

      <SheetModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={editingEntry ? 'Редактировать запись' : entryType === 'income' ? 'Новый доход' : 'Новый расход'}
      >
        {!editingEntry ? (
          <View style={styles.typeToggleRow}>
            <TouchableOpacity
              style={[styles.typeToggleBtn, entryType === 'income' && { backgroundColor: colors.accent[600] }]}
              onPress={() => setEntryType('income')}
            >
              <TrendingUp size={16} color={entryType === 'income' ? colors.neutral[0] : colors.neutral[400]} />
              <Text style={[styles.typeToggleText, entryType === 'income' && { color: colors.neutral[0] }]}>
                Доход
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeToggleBtn, entryType === 'expense' && { backgroundColor: colors.error[500] }]}
              onPress={() => setEntryType('expense')}
            >
              <TrendingDown size={16} color={entryType === 'expense' ? colors.neutral[0] : colors.neutral[400]} />
              <Text style={[styles.typeToggleText, entryType === 'expense' && { color: colors.neutral[0] }]}>
                Расход
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <LabeledInput
          label="Сумма"
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          keyboardType="numeric"
        />
        <LabeledInput
          label="Дата"
          value={entryDate}
          onChangeText={setEntryDate}
          datePicker
        />
        <LabeledInput
          label="Комментарий"
          value={comment}
          onChangeText={setComment}
          placeholder={entryType === 'income' ? 'Пополнение от клиента' : 'Аренда, реклама и т.д.'}
          multiline
        />

        {managers.length > 0 ? (
          <View style={styles.managerSectionModal}>
            <Text style={styles.managerLabel}>Привязать к менеджеру (необязательно)</Text>
            <View style={styles.managerChips}>
              <TouchableOpacity
                style={[styles.chip, !managerId && styles.chipActive]}
                onPress={() => setManagerId('')}
              >
                <Text style={[styles.chipText, !managerId && styles.chipTextActive]}>
                  Без менеджера
                </Text>
              </TouchableOpacity>
              {managers.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.chip, managerId === m.id && styles.chipActive]}
                  onPress={() => setManagerId(m.id)}
                >
                  <Text style={[styles.chipText, managerId === m.id && styles.chipTextActive]}>
                    {m.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}

        <View style={{ height: 8 }} />
        <ActionButton
          label={editingEntry ? 'Сохранить изменения' : entryType === 'income' ? 'Добавить доход' : 'Добавить расход'}
          onPress={handleSave}
          loading={saving}
        />
      </SheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[950] },
  summaryRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginBottom: 12 },
  allTimeCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: colors.neutral[900],
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.neutral[700],
  },
  allTimeHeader: { marginBottom: 12 },
  allTimeTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: colors.neutral[300],
  },
  allTimeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  allTimeItem: { width: '50%', alignItems: 'center', marginBottom: 12 },
  allTimeDivider: { width: 0, height: 0 },
  allTimeLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: colors.neutral[400],
    marginBottom: 4,
  },
  allTimeValue: {
    fontFamily: 'Inter-Bold',
    fontSize: 18,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 4,
  },
  summaryCardLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: colors.neutral[100],
    marginTop: 4,
  },
  summaryCardValue: {
    fontFamily: 'Inter-Bold',
    fontSize: 15,
    color: colors.neutral[0],
  },
  managerSection: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  sectionTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: colors.neutral[300],
  },
  mgrCard: {
    backgroundColor: colors.neutral[900],
    borderRadius: 14,
    padding: 14,
    marginRight: 10,
    minWidth: 160,
    borderWidth: 1,
    borderColor: colors.neutral[800],
  },
  mgrName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: colors.neutral[0],
    marginBottom: 8,
  },
  mgrRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  mgrLabel: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.neutral[400] },
  mgrValue: { fontFamily: 'Inter-SemiBold', fontSize: 12 },
  mgrTxCount: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: colors.neutral[500],
    marginTop: 6,
  },
  actionRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginBottom: 8 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
  },
  actionBtnText: { fontFamily: 'Inter-SemiBold', fontSize: 14, color: colors.neutral[0] },
  list: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 4 },
  listTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: colors.neutral[200],
    marginBottom: 12,
    marginTop: 8,
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: colors.neutral[900],
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.neutral[800],
  },
  historyLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, flex: 1 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  commentRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  historyComment: {
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    color: colors.neutral[0],
    flexShrink: 1,
  },
  sourceTag: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sourceTagText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 10,
  },
  historyManager: {
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
  historyRight: {
    alignItems: 'flex-end',
    gap: 6,
    flexShrink: 0,
    marginLeft: 8,
  },
  actionIcons: {
    flexDirection: 'row',
    gap: 6,
  },
  iconBtn: {
    padding: 7,
    borderRadius: 8,
    backgroundColor: colors.neutral[800],
  },
  logoutBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: colors.neutral[800],
  },
  typeToggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  typeToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
    backgroundColor: colors.neutral[800],
    borderWidth: 1,
    borderColor: colors.neutral[700],
  },
  typeToggleText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: colors.neutral[400],
  },
  managerSectionModal: { marginBottom: 16 },
  managerLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: colors.neutral[400],
    marginBottom: 8,
  },
  managerChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: colors.neutral[800],
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.neutral[700],
  },
  chipActive: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[500],
  },
  chipText: { fontFamily: 'Inter-Regular', fontSize: 13, color: colors.neutral[300] },
  chipTextActive: { color: colors.neutral[0], fontFamily: 'Inter-SemiBold' },
});
