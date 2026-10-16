import { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { supabase, Manager, Bonus } from '@/lib/supabase';
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
import { Trash2, Gift, LogOut } from 'lucide-react-native';
import { useAuth } from '@/lib/auth';
import { confirmDialog, alertDialog } from '@/lib/confirm';

type BonusWithManager = Bonus & { managers: { name: string } | null };

export default function BonusesScreen() {
  const { role, signOut } = useAuth();
  const isAdmin = role === 'admin';
  const [bonuses, setBonuses] = useState<BonusWithManager[]>([]);
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
  const [entryDate, setEntryDate] = useState('');

  const fetchData = useCallback(async () => {
    setError(null);
    const [bnRes, mgrRes] = await Promise.all([
      supabase
        .from('bonuses')
        .select('id, manager_id, amount, description, created_at, managers:manager_id(name)')
        .order('created_at', { ascending: false }),
      supabase.from('managers').select('id, name, phone, salary_percentage, created_at').order('name'),
    ]);

    if (bnRes.error) {
      setError(bnRes.error.message);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setBonuses((bnRes.data || []) as unknown as BonusWithManager[]);
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
    setSelectedManager(managers[0]?.id || '');
    setAmount('');
    setDescription('');
    setEntryDate(defaultDateForMonth(selectedMonth));
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
    const { error: err } = await supabase.from('bonuses').insert({
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
    setSaving(false);
    setModalVisible(false);
    fetchData();
  };

  const handleDelete = (bn: Bonus) => {
    confirmDialog('Удалить бонус?', `Сумма: ${formatMoney(bn.amount)}`, async () => {
      const { error: err } = await supabase.from('bonuses').delete().eq('id', bn.id);
      if (err) {
        alertDialog('Ошибка', err.message);
        return;
      }
      fetchData();
    });
  };

  const { start, end } = getMonthRange(selectedMonth);
  const monthBonuses = useMemo(
    () => bonuses.filter((b) => b.created_at >= start && b.created_at < end),
    [bonuses, start, end],
  );
  const totalSum = monthBonuses.reduce((s, b) => s + Number(b.amount), 0);

  const renderItem = ({ item }: { item: BonusWithManager }) => (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Gift size={20} color={colors.warning[500]} />
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.managerName}>{item.managers?.name || '—'}</Text>
        <Text style={styles.amount}>+{formatMoney(Number(item.amount))}</Text>
        {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}
        <Text style={styles.date}>{formatDate(item.created_at)}</Text>
      </View>
      {isAdmin ? (
        <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={12} style={styles.delBtn}>
          <Trash2 size={16} color={colors.error[400]} />
        </TouchableOpacity>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Бонусы"
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
        data={monthBonuses}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[400]} />}
        ListEmptyComponent={
          !loading ? <EmptyState message="Нет бонусов за этот месяц." /> : null
        }
      />

      {isAdmin ? <FAB label="+ Бонус" onPress={openAdd} /> : null}

      <SheetModal visible={modalVisible} onClose={() => setModalVisible(false)} title="Новый бонус">
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
              placeholder="За что бонус (необязательно)"
              multiline
            />
            <View style={{ height: 8 }} />
            <ActionButton label="Добавить" onPress={handleSave} loading={saving} />
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.neutral[900],
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.neutral[800],
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.warning[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  cardBody: {
    flex: 1,
  },
  managerName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: colors.neutral[0],
  },
  amount: {
    fontFamily: 'Inter-Bold',
    fontSize: 17,
    color: colors.warning[600],
    marginTop: 2,
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
  delBtn: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: colors.neutral[800],
    marginLeft: 8,
    alignSelf: 'flex-start',
    marginTop: 4,
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
  logoutBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: colors.neutral[800],
  },
});
