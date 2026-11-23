import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { formatDate, getKyivToday, formatDueDate } from '@/lib/format';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SheetModal } from '@/components/SheetModal';
import { LabeledInput } from '@/components/LabeledInput';
import { ActionButton } from '@/components/ActionButton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Bell, Trash2, LogOut, CalendarClock } from 'lucide-react-native';
import { useAuth } from '@/lib/auth';
import { confirmDialog, alertDialog } from '@/lib/confirm';

type Reminder = {
  id: string;
  title: string;
  due_date: string;
  created_at: string;
};

export default function RemindersScreen() {
  const { signOut } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(getKyivToday());
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setError(null);
    const { data, error: err } = await supabase
      .from('admin_reminders')
      .select('id, title, due_date, created_at')
      .order('due_date', { ascending: true });

    if (err) {
      setError(err.message);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setReminders((data || []) as Reminder[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAdd = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      alertDialog('Ошибка', 'Введите название задачи');
      return;
    }
    if (trimmed.length > 300) {
      alertDialog('Ошибка', 'Название задачи — не длиннее 300 символов');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      alertDialog('Ошибка', 'Выберите дату, когда нужно сделать задачу');
      return;
    }

    setSaving(true);
    const { error: err } = await supabase.from('admin_reminders').insert({
      title: trimmed,
      due_date: dueDate,
    });
    setSaving(false);

    if (err) {
      alertDialog('Ошибка', err.message);
      return;
    }
    setTitle('');
    setDueDate(getKyivToday());
    setModalVisible(false);
    fetchData();
  };

  const handleDelete = (r: Reminder) => {
    confirmDialog('Удалить задачу?', `${r.title} · ${formatDueDate(r.due_date)}`, async () => {
      const { error: err } = await supabase.from('admin_reminders').delete().eq('id', r.id);
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

  const renderItem = ({ item }: { item: Reminder }) => {
    const overdue = item.due_date < getKyivToday();
    const isToday = item.due_date === getKyivToday();
    return (
      <View style={[styles.card, overdue && styles.cardOverdue]}>
        <View style={[styles.dateBox, (overdue || isToday) && styles.dateBoxAlert]}>
          <CalendarClock size={20} color={overdue || isToday ? colors.warning[500] : colors.primary[400]} />
          <Text style={[styles.dateText, (overdue || isToday) && { color: colors.warning[500] }]}>
            {formatDueDate(item.due_date)}
          </Text>
          {overdue ? <Text style={styles.overdueTag}>Просрочено</Text> : null}
          {!overdue && isToday ? <Text style={styles.overdueTag}>Сегодня</Text> : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.createdText}>Добавлено: {formatDate(item.created_at)}</Text>
        </View>
        <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={10} style={styles.delBtn}>
          <Trash2 size={16} color={colors.error[400]} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Напоминания"
        subtitle="Ваши задачи с датами выполнения"
        loading={loading}
        right={
          <TouchableOpacity onPress={signOut} hitSlop={12} style={styles.logoutBtn}>
            <LogOut size={20} color={colors.neutral[400]} />
          </TouchableOpacity>
        }
      >
        {error ? <ErrorBanner message={error} /> : null}
      </ScreenHeader>

      <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)} activeOpacity={0.85}>
        <Bell size={18} color={colors.neutral[0]} />
        <Text style={styles.addBtnText}>Добавить задачу</Text>
      </TouchableOpacity>

      <FlatList
        data={reminders}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[400]} />}
        ListEmptyComponent={
          !loading ? <EmptyState message="Задач пока нет. Нажмите «Добавить задачу»." /> : null
        }
      />

      <SheetModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Новая задача"
      >
        <LabeledInput
          label="Название задачи"
          value={title}
          onChangeText={setTitle}
          placeholder="Например: оплатить услугу"
          multiline
        />
        <LabeledInput
          label="Дата, когда сделать"
          value={dueDate}
          onChangeText={setDueDate}
          datePicker
        />
        <View style={{ height: 8 }} />
        <ActionButton label="Добавить" onPress={handleAdd} loading={saving} />
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
    paddingBottom: 40,
    paddingTop: 4,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: colors.primary[600],
    borderRadius: 14,
    paddingVertical: 14,
  },
  addBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: colors.neutral[0],
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.neutral[900],
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.neutral[800],
  },
  cardOverdue: {
    borderColor: colors.warning[600],
  },
  dateBox: {
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.neutral[950],
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.neutral[800],
    minWidth: 92,
  },
  dateBoxAlert: {
    borderColor: colors.warning[600],
  },
  dateText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: colors.primary[400],
  },
  overdueTag: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    color: colors.warning[500],
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: colors.neutral[0],
    lineHeight: 21,
  },
  createdText: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: colors.neutral[500],
    marginTop: 3,
  },
  delBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.neutral[800],
  },
  logoutBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: colors.neutral[800],
  },
});
