import { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { supabase, Manager, Transaction } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { formatMoney, formatDate, currentMonthKey, getMonthRange, defaultDateForMonth, toKyivISODate } from '@/lib/format';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SheetModal } from '@/components/SheetModal';
import { LabeledInput } from '@/components/LabeledInput';
import { ActionButton } from '@/components/ActionButton';
import { FAB } from '@/components/FAB';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { MonthPicker } from '@/components/MonthPicker';
import { Trash2, LogOut, Pencil } from 'lucide-react-native';
import { useAuth } from '@/lib/auth';
import { confirmDialog, alertDialog } from '@/lib/confirm';

type TxWithManager = Transaction & {
  managers: { name: string; salary_percentage: number } | null;
};

export default function TransactionsScreen() {
  const { role, signOut } = useAuth();
  const isAdmin = role === 'admin';
  const [transactions, setTransactions] = useState<TxWithManager[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey());

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedManager, setSelectedManager] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [entryDate, setEntryDate] = useState('');

  const fetchData = useCallback(async () => {
    setError(null);
    const [txRes, mgrRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('id, manager_id, amount, description, created_at, managers:manager_id(name, salary_percentage)')
        .order('created_at', { ascending: false }),
      supabase.from('managers').select('id, name, phone, salary_percentage, created_at').order('name'),
    ]);

    if (txRes.error) {
      setError(txRes.error.message);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setTransactions((txRes.data || []) as unknown as TxWithManager[]);
    setManagers((mgrRes.data || []) as Manager[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchData();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const openAdd = () => {
    setEditingTx(null);
    setSelectedManager(managers[0]?.id || '');
    setAmount('');
    setDescription('');
    setEntryDate(defaultDateForMonth(selectedMonth));
    setModalVisible(true);
  };

  const openEdit = (tx: TxWithManager) => {
    setEditingTx(tx);
    setSelectedManager(tx.manager_id);
    setAmount(String(Number(tx.amount)));
    setDescription(tx.description || '');
    setEntryDate(tx.created_at.slice(0, 10));
    setModalVisible(true);
  };

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (!selectedManager) {
      alertDialog('Ошибка', 'Выберите менеджера');
      return;
    }
    if (!amt || amt <= 0) {
      alertDialog('Ошибка', 'Введите сумму больше 0');
      return;
    }

    setSaving(true);
    if (editingTx) {
      const { error: err } = await supabase
        .from('transactions')
        .update({
          manager_id: selectedManager,
          amount: amt,
          description: description.trim() || null,
          created_at: toKyivISODate(entryDate),
        })
        .eq('id', editingTx.id);
      if (err) {
        alertDialog('Ошибка', err.message);
        setSaving(false);
        return;
      }
    } else {
      const { error: err } = await supabase.from('transactions').insert({
        manager_id: selectedManager,
        amount: amt,
        description: description.trim() || null,
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

  const handleDelete = (tx: Transaction) => {
    confirmDialog('Удалить транзакцию?', `Сумма: ${formatMoney(tx.amount)}`, async () => {
      const { error: err } = await supabase.from('transactions').delete().eq('id', tx.id);
      if (err) {
        alertDialog('Ошибка', err.message);
        return;
      }
      fetchData();
    });
  };

  const { start, end } = getMonthRange(selectedMonth);
  const monthTransactions = useMemo(
    () => transactions.filter((t) => t.created_at >= start && t.created_at < end),
    [transactions, start, end],
  );
  const totalSum = monthTransactions.reduce((s, t) => s + Number(t.amount), 0);

  const renderItem = ({ item }: { item: TxWithManager }) => {
    const totalAmount = Number(item.amount);
    const managerPercentage = Number(item.managers?.salary_percentage || 0);
    const managerShare = totalAmount * (managerPercentage / 100);
    const companyShare = totalAmount - managerShare;

    return (
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <View style={styles.cardLeft}>
            <View style={styles.amountCircle}>
              <Text style={styles.amountText}>{formatMoney(totalAmount)}</Text>
            </View>
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.managerName}>{item.managers?.name || '—'}</Text>
            {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}
            <Text style={styles.date}>{formatDate(item.created_at)}</Text>
          </View>
          {isAdmin ? (
            <View style={styles.cardActions}>
              <TouchableOpacity onPress={() => openEdit(item)} hitSlop={10} style={styles.editBtn}>
                <Pencil size={14} color={colors.primary[400]} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={10} style={styles.delBtn}>
                <Trash2 size={16} color={colors.error[400]} />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
        {isAdmin ? (
          <View style={styles.breakdown}>
            <Text style={styles.breakdownTitle}>Распределение суммы</Text>
            <View style={styles.breakdownRows}>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Менеджеру ({managerPercentage}%)</Text>
                <Text style={styles.managerShare}>{formatMoney(managerShare)}</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Администратору ({100 - managerPercentage}%)</Text>
                <Text style={styles.companyShare}>{formatMoney(companyShare)}</Text>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Транзакции"
        subtitle={`Всего: ${formatMoney(totalSum)}`}
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
        data={monthTransactions}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[400]} />}
        ListEmptyComponent={
          !loading ? <EmptyState message="Нет транзакций за этот месяц." /> : null
        }
      />

      {isAdmin ? <FAB label="+ Пополнение" onPress={openAdd} /> : null}

      <SheetModal visible={modalVisible} onClose={() => setModalVisible(false)} title={editingTx ? 'Редактировать пополнение' : 'Новое пополнение'}>
        {managers.length === 0 ? (
          <Text style={styles.warnText}>Сначала добавьте менеджера на вкладке «Менеджеры».</Text>
        ) : (
          <>
            <Text style={styles.label}>Менеджер</Text>
            <View style={styles.pickerWrap}>
              {managers.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={[
                    styles.pickerItem,
                    selectedManager === m.id && styles.pickerItemActive,
                  ]}
                  onPress={() => setSelectedManager(m.id)}
                >
                  <Text
                    style={[
                      styles.pickerText,
                      selectedManager === m.id && styles.pickerTextActive,
                    ]}
                  >
                    {m.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
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
              label="Описание"
              value={description}
              onChangeText={setDescription}
              placeholder="Комментарий (необязательно)"
              multiline
            />
            <View style={{ height: 8 }} />
            <ActionButton label={editingTx ? 'Сохранить' : 'Добавить'} onPress={handleSave} loading={saving} />
          </>
        )}
      </SheetModal>
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
    paddingBottom: 100,
    paddingTop: 4,
  },
  card: {
    backgroundColor: colors.neutral[900],
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.neutral[800],
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardLeft: {
    marginRight: 14,
  },
  amountCircle: {
    backgroundColor: colors.accent[100],
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  amountText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: colors.accent[700],
  },
  cardBody: {
    flex: 1,
  },
  managerName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: colors.neutral[0],
  },
  desc: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: colors.neutral[400],
    marginTop: 2,
  },
  date: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: colors.neutral[500],
    marginTop: 4,
  },
  breakdown: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.neutral[800],
  },
  breakdownTitle: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: colors.neutral[300],
    marginBottom: 10,
  },
  breakdownRows: {
    gap: 8,
    marginTop: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: colors.neutral[400],
  },
  managerShare: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: colors.accent[400],
  },
  companyShare: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: colors.primary[400],
  },
  cardActions: {
    flexDirection: 'row',
    gap: 6,
    marginLeft: 8,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  editBtn: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: colors.neutral[800],
  },
  delBtn: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: colors.neutral[800],
  },
  logoutBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: colors.neutral[800],
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: colors.neutral[400],
    marginBottom: 8,
  },
  pickerWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  pickerItem: {
    backgroundColor: colors.neutral[800],
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.neutral[700],
  },
  pickerItemActive: {
    backgroundColor: colors.primary[500],
    borderColor: colors.primary[500],
  },
  pickerText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: colors.neutral[300],
  },
  pickerTextActive: {
    color: colors.neutral[0],
  },
  warnText: {
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    color: colors.warning[600],
    textAlign: 'center',
    paddingVertical: 20,
  },
});
