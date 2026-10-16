import { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
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
import { Plus, Phone, Trash2, Pencil, LogOut, Mail, Link2, ChevronDown, Check } from 'lucide-react-native';
import { useAuth } from '@/lib/auth';
import { fetchExternalAgents, ExternalAgent } from '@/lib/externalCrm';
import { alertDialog, confirmDialog } from '@/lib/confirm';

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
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // External agent binding
  const [externalAgents, setExternalAgents] = useState<ExternalAgent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);

  // Map for displaying agent names on cards
  const [agentMap, setAgentMap] = useState<Map<string, string>>(new Map());

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

  const fetchAgents = useCallback(async () => {
    if (!isAdmin) return;
    setAgentsLoading(true);
    try {
      const agents = await fetchExternalAgents();
      setExternalAgents(agents);
      const map = new Map<string, string>();
      for (const a of agents) map.set(a.id, a.name);
      setAgentMap(map);
    } catch {
      // silently ignore — agents list is optional
    } finally {
      setAgentsLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchManagers();
    fetchAgents();
    const interval = setInterval(() => {
      fetchManagers();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchManagers, fetchAgents]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchManagers();
    fetchAgents();
  };

  const openAdd = () => {
    setSaveError(null);
    setEditingManager(null);
    setName('');
    setPhone('');
    setPercentage('');
    setEmail('');
    setPassword('');
    setSelectedAgentId(null);
    setAgentPickerOpen(false);
    setModalVisible(true);
  };

  const openEdit = (m: Manager) => {
    setSaveError(null);
    setEditingManager(m);
    setName(m.name);
    setPhone(m.phone || '');
    setPercentage(String(m.salary_percentage));
    setEmail(m.email || '');
    setPassword('');
    setSelectedAgentId(m.external_agent_id || null);
    setAgentPickerOpen(false);
    setModalVisible(true);
  };

  const handleSave = async () => {
    setSaveError(null);
    if (!name.trim()) {
      setSaveError('Введите имя менеджера.');
      return;
    }
    const pct = parseFloat(percentage) || 0;
    if (pct < 0 || pct > 100) {
      setSaveError('Процент должен быть от 0 до 100.');
      return;
    }

    setSaving(true);
    try {
      if (editingManager) {
        const { error: err } = await supabase
          .from('managers')
          .update({
            name: name.trim(),
            phone: phone.trim() || null,
            salary_percentage: pct,
            external_agent_id: selectedAgentId,
          })
          .eq('id', editingManager.id);
        if (err) throw new Error(err.message);
      } else {
        if (!email.trim() || !password.trim()) {
          throw new Error('Введите email и пароль для входа менеджера.');
        }
        if (password.length < 6) {
          throw new Error('Пароль должен быть не менее 6 символов.');
        }

        const request = supabase.functions.invoke('create-manager', {
          body: {
            name: name.trim(),
            phone: phone.trim() || null,
            salary_percentage: pct,
            email: email.trim(),
            password,
            external_agent_id: selectedAgentId,
          },
        });
        const timeout = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Сервер не ответил. Проверьте подключение и попробуйте снова.')), 15000);
        });
        const { data, error: functionError } = await Promise.race([request, timeout]);
        if (functionError) {
          let message = functionError.message;
          const context = functionError.context;
          if (context instanceof Response) {
            const payload = await context.json().catch(() => null) as { error?: string } | null;
            if (payload?.error) message = payload.error;
          }
          throw new Error(message);
        }
        if (!data?.manager) throw new Error('Сервер не подтвердил создание менеджера.');
      }
      setModalVisible(false);
      fetchManagers();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Произошла ошибка при создании менеджера.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (m: Manager) => {
    confirmDialog(
      'Удалить менеджера?',
      `Менеджер "${m.name}" и все его транзакции, бонусы и выплаты будут удалены.`,
      async () => {
        const { error: err } = await supabase.from('managers').delete().eq('id', m.id);
        if (err) {
          alertDialog('Ошибка', err.message);
          return;
        }
        await fetchManagers();
      },
    );
  };

  const selectedAgentName = selectedAgentId
    ? externalAgents.find((a) => a.id === selectedAgentId)?.name || 'Привязан'
    : null;

  const renderItem = ({ item }: { item: ManagerWithStats }) => {
    const agentName = item.external_agent_id ? agentMap.get(item.external_agent_id) : null;
    return (
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
            {agentName ? (
              <View style={styles.phoneRow}>
                <Link2 size={13} color={colors.accent[400]} />
                <Text style={styles.agentLink}>{agentName}</Text>
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
  };

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

        {/* External agent binding */}
        <Text style={styles.fieldLabel}>Привязка к внешней CRM</Text>
        <TouchableOpacity
          style={styles.agentPicker}
          onPress={() => setAgentPickerOpen((v) => !v)}
          activeOpacity={0.7}
        >
          <View style={styles.agentPickerLeft}>
            <Link2 size={16} color={selectedAgentName ? colors.accent[400] : colors.neutral[500]} />
            <Text
              style={[styles.agentPickerText, !selectedAgentName && styles.agentPickerPlaceholder]}
              numberOfLines={1}
            >
              {selectedAgentName || 'Не привязан — выбрать агента'}
            </Text>
          </View>
          {agentsLoading ? (
            <ActivityIndicator size="small" color={colors.neutral[400]} />
          ) : (
            <ChevronDown size={18} color={colors.neutral[500]} />
          )}
        </TouchableOpacity>

        {agentPickerOpen && !agentsLoading ? (
          <View style={styles.agentDropdown}>
            <TouchableOpacity
              style={[styles.agentDropdownItem, !selectedAgentId && styles.agentDropdownItemActive]}
              onPress={() => {
                setSelectedAgentId(null);
                setAgentPickerOpen(false);
              }}
            >
              <Text style={[styles.agentDropdownText, !selectedAgentId && styles.agentDropdownTextActive]}>
                Не привязан
              </Text>
              {!selectedAgentId ? <Check size={16} color={colors.neutral[0]} /> : null}
            </TouchableOpacity>
            {externalAgents.map((agent) => (
              <TouchableOpacity
                key={agent.id}
                style={[styles.agentDropdownItem, selectedAgentId === agent.id && styles.agentDropdownItemActive]}
                onPress={() => {
                  setSelectedAgentId(agent.id);
                  setAgentPickerOpen(false);
                }}
              >
                <Text style={[styles.agentDropdownText, selectedAgentId === agent.id && styles.agentDropdownTextActive]}>
                  {agent.name}
                </Text>
                {selectedAgentId === agent.id ? <Check size={16} color={colors.neutral[0]} /> : null}
              </TouchableOpacity>
            ))}
            {externalAgents.length === 0 ? (
              <Text style={styles.agentDropdownEmpty}>Нет доступных агентов во внешней CRM</Text>
            ) : null}
          </View>
        ) : null}

        {saveError ? <ErrorBanner message={saveError} /> : null}
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
  agentLink: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: colors.accent[400],
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
  fieldLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: colors.neutral[400],
    marginBottom: 6,
    marginTop: 4,
  },
  agentPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.neutral[800],
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.neutral[700],
  },
  agentPickerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  agentPickerText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: colors.accent[400],
  },
  agentPickerPlaceholder: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: colors.neutral[500],
  },
  agentDropdown: {
    marginTop: 4,
    backgroundColor: colors.neutral[800],
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.neutral[700],
    maxHeight: 220,
  },
  agentDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[700],
  },
  agentDropdownItemActive: {
    backgroundColor: colors.accent[600],
  },
  agentDropdownText: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: colors.neutral[300],
  },
  agentDropdownTextActive: {
    fontFamily: 'Inter-SemiBold',
    color: colors.neutral[0],
  },
  agentDropdownEmpty: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: colors.neutral[500],
    padding: 14,
    textAlign: 'center',
  },
});
