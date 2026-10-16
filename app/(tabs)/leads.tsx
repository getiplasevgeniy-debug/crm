import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CheckCircle2, LogOut, UserPlus } from 'lucide-react-native';
import { ActionButton } from '@/components/ActionButton';
import { ErrorBanner } from '@/components/ErrorBanner';
import { LabeledInput } from '@/components/LabeledInput';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAuth } from '@/lib/auth';
import { fetchExternalAgents, syncLead, ExternalAgent } from '@/lib/externalCrm';
import { colors } from '@/lib/theme';
import { supabase } from '@/lib/supabase';

export default function LeadsScreen() {
  const { role, signOut } = useAuth();
  const [agents, setAgents] = useState<ExternalAgent[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [lostWith, setLostWith] = useState('');
  const [applicationDate, setApplicationDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    setError(null);
    try {
      setAgents(await fetchExternalAgents());
    } catch {
      setError('Не удалось загрузить агентов из второй CRM. Проверьте подключение.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const resetForm = () => {
    setName('');
    setPhone('');
    setEmail('');
    setLostWith('');
    setApplicationDate(new Date().toISOString().slice(0, 10));
    setSelectedAgentId('');
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);
    const agent = agents.find((item) => item.id === selectedAgentId);
    if (!name.trim()) {
      setError('Введите имя и фамилию клиента.');
      return;
    }
    if (!agent) {
      setError('Выберите агента из списка.');
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
        external_agent_id: agent.id,
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
        external_agent_id: agent.id,
      });
      setSuccess(`Клиент отправлен в CRM и назначен агенту ${agent.name}.`);
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
            <Text style={styles.introText}>Заполните данные и выберите агента из второй CRM. Клиент сразу появится в его списке.</Text>
          </View>
        </View>
        <LabeledInput label="Имя и фамилия *" value={name} onChangeText={setName} placeholder="Иван Иванов" />
        <LabeledInput label="Номер телефона" value={phone} onChangeText={setPhone} placeholder="+373 000 00 000" keyboardType="phone-pad" />
        <LabeledInput label="Почта" value={email} onChangeText={setEmail} placeholder="client@example.com" keyboardType="default" />
        <LabeledInput label="С кем потерял" value={lostWith} onChangeText={setLostWith} placeholder="Необязательно" />
        <LabeledInput label="Дата заявки *" value={applicationDate} onChangeText={setApplicationDate} datePicker />

        <Text style={styles.label}>Назначить агента *</Text>
        {agents.length === 0 && !loading ? (
          <Text style={styles.empty}>Нет активных агентов во второй CRM.</Text>
        ) : (
          <View style={styles.agentList}>
            {agents.map((agent) => {
              const selected = selectedAgentId === agent.id;
              return (
                <TouchableOpacity
                  key={agent.id}
                  style={[styles.agentOption, selected && styles.agentOptionSelected]}
                  onPress={() => setSelectedAgentId(agent.id)}
                  activeOpacity={0.8}
                >
                  <View style={styles.agentText}>
                    <Text style={styles.agentName}>{agent.name}</Text>
                    {agent.email ? <Text style={styles.agentMeta}>{agent.email}</Text> : null}
                  </View>
                  {selected ? <CheckCircle2 size={20} color={colors.primary[300]} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
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
  agentText: { flex: 1 },
  agentName: { fontFamily: 'Inter-SemiBold', fontSize: 15, color: colors.neutral[0] },
  agentMeta: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.neutral[400], marginTop: 3 },
  empty: { fontFamily: 'Inter-Regular', fontSize: 14, color: colors.neutral[400], marginBottom: 20 },
  successBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, marginBottom: 12, borderRadius: 12, backgroundColor: colors.accent[700] },
  successText: { flex: 1, fontFamily: 'Inter-Medium', fontSize: 13, color: colors.neutral[0] },
  bottomSpace: { height: 24 },
});
