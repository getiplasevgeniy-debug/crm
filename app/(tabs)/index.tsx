import { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { supabase, Manager } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { formatMoney } from '@/lib/format';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SheetModal } from '@/components/SheetModal';
import { LabeledInput } from '@/components/LabeledInput';
import { ActionButton } from '@/components/ActionButton';
import { FAB } from '@/components/FAB';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Badge } from '@/components/Badge';
import { Plus, Phone, Trash2, Pencil, LogOut, Mail } from 'lucide-react-native';
import { useAuth } from '@/lib/auth';

type ManagerWithStats = Manager & {
  total_transactions: number;
  total_amount: number;
};

export default function ManagersScreen() {
  const { signOut, role } = useAuth();
  const isAdmin = role === 'admin';
  const [managers, setManagers] = useState<ManagerWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingManager, setEditingManager] = useState<Manager | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [percentage, setPercentage] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [externalAgentId, setExternalAgentId] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchManagers = useCallback(async () => {
    setError(null);
    const { data, error: err } = await supabase
      .from('managers')
      .select('id, name, phone, salary_percentage, created_at, email, auth_user_id, external_agent_id')
      .order('created_at', { ascending: false });

    if (err) {
      setError(err.message);
      setManagers([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const managers = (data || []) as Manager[];
    const enriched: ManagerWithStats[] = [];

    for (const m of managers) {
      const { data: txData } = await supabase
        .from('transactions')
        .select('amount')
        .eq('manager_id', m.id);

      const total = (txData || []).reduce((sum, t) => sum + Number(t.amount), 0);
      enriched.push({
        ...m,
        total_transactions: (txData || []).length,
        total_amount: total,
      });
    }

    setManagers(enriched);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchManagers();
    const interval = setInterval(() => {
      fetchManagers();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchManagers]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchManagers();
  };

  const openAdd = () => {
    setEditingManager(null);
    setName('');
    setPhone('');
    setPercentage('');
    setEmail('');
    setPassword('');
    setExternalAgentId('');
    setModalVisible(true);
  };

  const openEdit = (m: Manager) => {
    setEditingManager(m);
    setName(m.name);
    setPhone(m.phone || '');
    setPercentage(String(m.salary_percentage));
    setEmail(m.email || '');
    setPassword('');
    setExternalAgentId(m.external_agent_id || '');
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Ошибка', 'Введите имя менеджера');
      return;
    }
    const pct = parseFloat(percentage) || 0;
    if (pct < 0 || pct > 100) {
      Alert.alert('Ошибка', 'Процент должен быть от 0 до 100');
      return;
    }

    setSaving(true);

    if (editingManager) {
      const { error: err } = await supabase
        .from('managers')
        .update({
          name: name.trim(),
          phone: phone.trim() || null,
          salary_percentage: pct,
          external_agent_id: externalAgentId.trim() || null,
        })
        .eq('id', editingManager.id);
      if (err) {
        Alert.alert('Ошибка', err.message);
        setSaving(false);
        return;
      }
    } else {
      if (!email.trim() || !password.trim()) {
        Alert.alert('Ошибка', 'Введите email и пароль для входа менеджера');
        setSaving(false);
        return;
      }
      if (password.length < 6) {
        Alert.alert('Ошибка', 'Пароль должен быть не менее 6 символов');
        setSaving(false);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        Alert.alert('Ошибка', 'Нет авторизации');
        setSaving(false);
        return;
      }

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
      const response = await fetch(`${supabaseUrl}/functions/v1/create-manager`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || null,
          salary_percentage: pct,
          email: email.trim(),
          password,
          external_agent_id: externalAgentId.trim() || null,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        Alert.alert('Ошибка', result.error || 'Не удалось создать менеджера');
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    setModalVisible(false);
    fetchManagers();
  };

  const handleDelete = (m: Manager) => {
    Alert.alert(
      'Удалить менеджера?',
      `Менеджер "${m.name}" и все его транзакции, бонусы и выплаты будут удалены.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            const { error: err } = await supabase.from('managers').delete().eq('id', m.id);
            if (err) {
              Alert.alert('Ошибка', err.message);
              return;
            }
            fetchManagers();
          },
        },
      ],
    );
  };

  const renderItem = ({ item }: { item: ManagerWithStats }) => (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{item.name}</Text>
          {item.phone ? (
            <View style={styles.phoneRow}>
              <Phone size={13} color={colors.neutral[400]} />
              <Text style={styles.phone}>{item.phone}</Text>
            </View>
          ) : null}
          {item.email ? (
            <View style={styles.phoneRow}>
              <Mail size={13} color={colors.neutral[400]} />
              <Text style={styles.phone}>{item.email}</Text>
            </View>
          ) : null}
        </View>
        {isAdmin ? (
          <View style={styles.cardActions}>
            <TouchableOpacity onPress={() => openEdit(item)} hitSlop={12} style={styles.iconBtn}>
              <Pencil size={16} color={colors.neutral[400]} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={12} style={styles.iconBtn}>
              <Trash2 size={16} color={colors.error[400]} />
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Процент</Text>
          <Badge variant="info">{item.salary_percentage}%</Badge>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Транзакций</Text>
          <Text style={styles.statValue}>{item.total_transactions}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Сумма</Text>
          <Text style={styles.statValue}>{formatMoney(item.total_amount)}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Менеджеры"
        subtitle={`${managers.length} активных`}
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
        data={managers}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[400]} />}
        ListEmptyComponent={
          !loading ? <EmptyState message="Нет менеджеров. Добавьте первого, нажав кнопку ниже." /> : null
        }
      />

      {isAdmin ? <FAB label="+ Менеджер" onPress={openAdd} /> : null}

      <SheetModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={editingManager ? 'Редактировать' : 'Новый менеджер'}
      >
        <LabeledInput label="Имя" value={name} onChangeText={setName} placeholder="Иван Иванов" />
        <LabeledInput
          label="Телефон"
          value={phone}
          onChangeText={setPhone}
          placeholder="+7 999 123 45 67"
          keyboardType="phone-pad"
        />
        <LabeledInput
          label="Процент зарплаты (%)"
          value={percentage}
          onChangeText={setPercentage}
          placeholder="10"
          keyboardType="numeric"
        />
        <LabeledInput
          label="ID агента во второй CRM"
          value={externalAgentId}
          onChangeText={setExternalAgentId}
          placeholder="UUID агента из таблицы agents"
        />
        {!editingManager ? (
          <>
            <LabeledInput
              label="Email для входа"
              value={email}
              onChangeText={setEmail}
              placeholder="manager@example.com"
              keyboardType="default"
            />
            <LabeledInput
              label="Пароль для входа"
              value={password}
              onChangeText={setPassword}
              placeholder="минимум 6 символов"
              keyboardType="default"
            />
          </>
        ) : null}
        <View style={{ height: 8 }} />
        <ActionButton
          label={editingManager ? 'Сохранить' : 'Добавить'}
          onPress={handleSave}
          loading={saving}
        />
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
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.neutral[800],
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  name: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 18,
    color: colors.neutral[0],
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  phone: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: colors.neutral[400],
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.neutral[800],
  },
  logoutBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: colors.neutral[800],
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.neutral[800],
    paddingTop: 14,
  },
  stat: {
    flex: 1,
  },
  statLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: colors.neutral[500],
    marginBottom: 4,
  },
  statValue: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: colors.neutral[0],
  },
});
