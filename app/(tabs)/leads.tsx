import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CheckCircle2, LogOut, Send, UserPlus } from 'lucide-react-native';
import { ActionButton } from '@/components/ActionButton';
import { ErrorBanner } from '@/components/ErrorBanner';
import { LabeledInput } from '@/components/LabeledInput';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAuth } from '@/lib/auth';
import { syncLead } from '@/lib/externalCrm';
import { colors } from '@/lib/theme';
import { supabase, Manager } from '@/lib/supabase';

export default function LeadsScreen() {
  const { role, signOut } = useAuth();
  const [managers, setManagers] = useState<Manager[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [lostWith, setLostWith] = useState('');
  const [applicationDate, setApplicationDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedManagerId, setSelectedManagerId] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchManagers = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('managers')
      .select('id, name, phone, salary_percentage, created_at, email, auth_user_id, external_agent_id')
      .order('name');
    if (fetchError) {
      setError('Не удалось загрузить список агентов.');
    } else {
      setManagers((data || []) as Manager[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchManagers();
  }, [fetchManagers]);

  const resetForm = () => {
    setName('');
    setPhone('');
    setEmail('');
    setLostWith('');
    setApplicationDate(new Date().toISOString().slice(0, 10));
    setSelectedManagerId('');
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);
    const manager = managers.find((item) => item.id === selectedManagerId);
    if (!name.trim()) {
      setError('Введите имя и фамилию клиента.');
      return;
    }
    if (!manager?.external_agent_id) {
      setError('Выберите агента с заполненным ID во второй CRM.');
      return;
    }
    if (!applicationDate || Number.isNaN(Date.parse(applicationDate))) {
      setError('Укажите корректную дату заявки.');
      return;
    }

    setSaving(true);
    const applicationDateIso = new Date(`${applicationDate}T12:00:00`).toISOString();
    const { data: lead, error: insertError } = await supabase
      .from('lead_submissions')
      .insert({
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        lost_with: lostWith.trim() || null,
        application_date: applicationDateIso,
        assigned_manager_id: manager.id,
        external_agent_id: manager.external_agent_id,
      })
      .select('id')
      .maybeSingle();

    if (insertError || !lead) {
      setError('Не удалось сохранить заявку.');
      setSaving(false);
      return;
    }

    try {
      await syncLead({
        local_lead_id: lead.id,
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        lost_with: lostWith.trim() || null,
        application_date: applicationDateIso,
        external_agent_id: manager.external_agent_id,
      });
      setSuccess(`Клиент отправлен в CRM и назначен агенту ${manager.name}.`);
      resetForm();
    } catch (syncError) {
      await supabase
        .from('lead_submissions')
        .update({ sync_status: 'failed', sync_error: syncError instanceof Error ? syncError.message : 'sync failed' })
        .eq('id', lead.id);
      setError('Заявка сохранена, но не отправлена во вторую CRM. Проверьте подключение и повторите позже.');
    } finally {
      setSaving(false);
    }
  };

  if (role !== 'admin') return null;

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Новый клиент"
        subtitle="Заявка сразу попадёт во вторую CRM со статусом «Новый»"
        loading={loading}
        right={
          <TouchableOpacity onPress={signOut} hitSlop={12} style={styles.logoutBtn}>
            <LogOut size={20} color={colors.neutral[400]} />
          </TouchableOpacity>
        }
      >
        <View />
      </ScreenHeader>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? <ErrorBanner message={error} /> : null}
        {success ? (
          <View style={styles.successBanner}>
            <CheckCircle2 size={18} color={colors.accent[400]} />
            <Text style={styles.successText}>{success}</Text>
          </View>
        ) : null}
        <View style={styles.introCard}>
          <UserPlus size={22} color={colors.primary[300]} />
          <View style={styles.introCopy}>
            <Text style={styles.introTitle}>Передать нового клиента</Text>
            <Text style={styles.introText}>Заполните данные и назначьте агента из подключённой CRM.</Text>
          </View>
        </View>
        <LabeledInput label="Имя и фамилия *" value={name} onChangeText={setName} placeholder="Иван Иванов" />
        <LabeledInput label="Номер телефона" value={phone} onChangeText={setPhone} placeholder="+373 000 00 000" keyboardType="phone-pad" />
        <LabeledInput label="Почта" value={email} onChangeText={setEmail} placeholder="client@example.com" keyboardType="default" />
        <LabeledInput label="С кем потерял" value={lostWith} onChangeText={setLostWith} placeholder="Необязательно" />
        <LabeledInput label="Дата заявки *" value={applicationDate} onChangeText={setApplicationDate} datePicker />

        <Text style={styles.label}>Назначить агента *</Text>
        <View style={styles.agentList}>
          {managers.map((manager) => {
            const selected = selectedManagerId === manager.id;
            const unavailable = !manager.external_agent_id;
            return (
              <TouchableOpacity
                key={manager.id}
                style={[styles.agentOption, selected && styles.agentOptionSelected, unavailable && styles.agentOptionDisabled]}
                onPress={() => !unavailable && setSelectedManagerId(manager.id)}
                activeOpacity={0.8}
              >
                <View style={styles.agentText}>
                  <Text style={styles.agentName}>{manager.name}</Text>
                  <Text style={styles.agentMeta}>{unavailable ? 'Не подключён к внешней CRM' : 'Готов принимать клиентов'}</Text>
                </View>
                {selected ? <CheckCircle2 size={20} color={colors.primary[300]} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
        <ActionButton label="Отправить клиента" onPress={handleSubmit} loading={saving} />
        <View style={styles.bottomSpace} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[950] },
  content: { paddingHorizontal: 20, paddingBottom: 32 },
  logoutBtn: { padding: 8, borderRadius: 10, backgroundColor: colors.neutral[800] },
  introCard: { flexDirection: 'row', gap: 12, padding: 16, marginBottom: 20, borderRadius: 16, backgroundColor: colors.primary[900], borderWidth: 1, borderColor: colors.primary[700] },
  introCopy: { flex: 1 },
  introTitle: { fontFamily: 'Inter-SemiBold', fontSize: 15, color: colors.neutral[0], marginBottom: 4 },
  introText: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 20, color: colors.neutral[200] },
  label: { fontFamily: 'Inter-Medium', fontSize: 13, color: colors.neutral[400], marginBottom: 8 },
  agentList: { gap: 8, marginBottom: 20 },
  agentOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 12, backgroundColor: colors.neutral[900], borderWidth: 1, borderColor: colors.neutral[700] },
  agentOptionSelected: { borderColor: colors.primary[400], backgroundColor: colors.primary[900] },
  agentOptionDisabled: { opacity: 0.5 },
  agentText: { flex: 1 },
  agentName: { fontFamily: 'Inter-SemiBold', fontSize: 15, color: colors.neutral[0] },
  agentMeta: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.neutral[400], marginTop: 3 },
  successBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, marginBottom: 12, borderRadius: 12, backgroundColor: colors.accent[700] },
  successText: { flex: 1, fontFamily: 'Inter-Medium', fontSize: 13, color: colors.neutral[0] },
  bottomSpace: { height: 24 },
});
