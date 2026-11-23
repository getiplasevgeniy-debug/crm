import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CheckCircle2, LogOut, PlugZap, Trash2, UserPlus } from 'lucide-react-native';
import { ActionButton } from '@/components/ActionButton';
import { ErrorBanner } from '@/components/ErrorBanner';
import { LabeledInput } from '@/components/LabeledInput';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAuth } from '@/lib/auth';
import { syncLead, checkExternalConnection, ExternalAgent } from '@/lib/externalCrm';
import { colors } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/format';
import { confirmDialog } from '@/lib/confirm';

type FailedLead = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  lost_with: string | null;
  application_date: string;
  external_agent_id: string;
};

export default function LeadsScreen() {
  const { role, signOut } = useAuth();
  const [agents, setAgents] = useState<ExternalAgent[]>([]);
  const [failedLeads, setFailedLeads] = useState<FailedLead[]>([]);
  const [retryingLeadId, setRetryingLeadId] = useState<string | null>(null);
  const [deletingLeadId, setDeletingLeadId] = useState<string | null>(null);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{ ok: boolean; text: string } | null>(null);
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
    const { data, error: managersError } = await supabase
      .from('managers')
      .select('name, email, external_agent_id')
      .not('external_agent_id', 'is', null)
      .order('name');

    if (managersError) {
      setError(`Ошибка загрузки агентов: ${managersError.message}`);
    } else {
      setAgents((data || []).map((manager) => ({
        id: manager.external_agent_id as string,
        name: manager.name,
        email: manager.email,
        role: 'agent',
      })));
    }
    setLoading(false);
  }, []);

  const loadFailedLeads = useCallback(async () => {
    const { data, error: failedLeadsError } = await supabase
      .from('lead_submissions')
      .select('id, name, email, phone, lost_with, application_date, external_agent_id')
      .eq('sync_status', 'failed')
      .not('external_agent_id', 'is', null)
      .order('application_date', { ascending: false });

    if (failedLeadsError) {
      setError(`Ошибка загрузки неотправленных заявок: ${failedLeadsError.message}`);
      return;
    }

    setFailedLeads((data || []) as FailedLead[]);
  }, []);

  useEffect(() => {
    loadAgents();
    loadFailedLeads();
  }, [loadAgents, loadFailedLeads]);

  const resetForm = () => {
    setName('');
    setPhone('');
    setEmail('');
    setLostWith('');
    setApplicationDate(new Date().toISOString().slice(0, 10));
    setSelectedAgentId('');
  };

  const retryFailedLead = async (lead: FailedLead) => {
    const agent = agents.find((item) => item.id === lead.external_agent_id);
    if (!agent) {
      setError(`Для заявки «${lead.name}» не найден подключённый менеджер.`);
      return;
    }

    setError(null);
    setSuccess(null);
    setRetryingLeadId(lead.id);
    try {
      await syncLead({
        local_lead_id: lead.id,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        lost_with: lead.lost_with,
        application_date: lead.application_date,
        external_agent_id: lead.external_agent_id,
      });
      setFailedLeads((current) => current.filter((item) => item.id !== lead.id));
      setSuccess(`Заявка «${lead.name}» повторно отправлена в CRM.`);
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : 'Неизвестная ошибка';
      await supabase
        .from('lead_submissions')
        .update({ sync_status: 'failed', sync_error: message })
        .eq('id', lead.id);
      setError(`Заявка «${lead.name}» не отправлена: ${message}`);
    } finally {
      setRetryingLeadId(null);
    }
  };

  const deleteFailedLead = async (lead: FailedLead) => {
    setError(null);
    setSuccess(null);
    setDeletingLeadId(lead.id);
    const { error: deleteError } = await supabase
      .from('lead_submissions')
      .delete()
      .eq('id', lead.id)
      .eq('sync_status', 'failed')
      .is('external_contact_id', null);

    if (deleteError) {
      setError(`Не удалось удалить заявку «${lead.name}»: ${deleteError.message}`);
    } else {
      setFailedLeads((current) => current.filter((item) => item.id !== lead.id));
      setSuccess(`Заявка «${lead.name}» удалена.`);
    }
    setDeletingLeadId(null);
  };

  const confirmDeleteFailedLead = (lead: FailedLead) => {
    confirmDialog(
      'Удалить заявку?',
      `Заявка «${lead.name}» не была передана во вторую CRM и будет удалена из списка.`,
      () => { void deleteFailedLead(lead); },
    );
  };

  const checkConnection = async () => {
    setError(null);
    setSuccess(null);
    setCheckingConnection(true);
    try {
      const check = await checkExternalConnection();
      if (check.ok) {
        setConnectionResult({ ok: true, text: `Подключение к основной CRM работает (код ${check.status}, найдено агентов: ${check.agents_found ?? 0}).` });
      } else {
        setConnectionResult({ ok: false, text: `Подключение не удалось (код ${check.status}): ${check.error ?? 'неизвестная ошибка'}` });
      }
    } catch (checkError) {
      setConnectionResult({
        ok: false,
        text: `Подключение не удалось: ${checkError instanceof Error ? checkError.message : 'Неизвестная ошибка'}`,
      });
    } finally {
      setCheckingConnection(false);
    }
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
      const message = syncError instanceof Error ? syncError.message : 'Неизвестная ошибка';
      setError(`Заявка сохранена, но не отправлена во вторую CRM: ${message}`);
      await loadFailedLeads();
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
        <View style={styles.connectionCard}>
          <View style={styles.connectionHeader}>
            <Text style={styles.connectionTitle}>Подключение к основной CRM</Text>
            <TouchableOpacity
              style={styles.connectionButton}
              onPress={checkConnection}
              disabled={checkingConnection}
              activeOpacity={0.8}
            >
              <PlugZap size={16} color={colors.neutral[0]} />
              <Text style={styles.connectionLabel}>{checkingConnection ? 'Проверяем…' : 'Проверить подключение'}</Text>
            </TouchableOpacity>
          </View>
          {connectionResult ? (
            <Text style={connectionResult.ok ? styles.connectionOk : styles.connectionFail}>{connectionResult.text}</Text>
          ) : (
            <Text style={styles.connectionHint}>Проверьте связь, если заявки не отправляются или аналитика пуста.</Text>
          )}
        </View>
        {error ? <ErrorBanner message={error} /> : null}
        {success ? (
          <View style={styles.successBanner}>
            <CheckCircle2 size={18} color={colors.accent[400]} />
            <Text style={styles.successText}>{success}</Text>
          </View>
        ) : null}
        {failedLeads.length > 0 ? (
          <View style={styles.failedCard}>
            <Text style={styles.failedTitle}>Неотправленные заявки</Text>
            <Text style={styles.failedText}>Они не попали в статистику. Повторите передачу после восстановления второй CRM.</Text>
            {failedLeads.map((lead) => (
              <View key={lead.id} style={styles.failedRow}>
                <View style={styles.failedInfo}>
                  <Text style={styles.failedName}>{lead.name}</Text>
                  <Text style={styles.failedDate}>{formatDate(lead.application_date)}</Text>
                </View>
                <ActionButton
                  label="Повторить передачу"
                  onPress={() => retryFailedLead(lead)}
                  loading={retryingLeadId === lead.id}
                  disabled={retryingLeadId !== null || deletingLeadId !== null}
                />
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => confirmDeleteFailedLead(lead)}
                  disabled={retryingLeadId !== null || deletingLeadId !== null}
                  activeOpacity={0.8}
                >
                  {deletingLeadId === lead.id ? <Text style={styles.deleteLabel}>Удаление...</Text> : <><Trash2 size={16} color={colors.error[500]} /><Text style={styles.deleteLabel}>Удалить ошибочную заявку</Text></>}
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.introCard}>
          <UserPlus size={22} color={colors.primary[300]} />
          <View style={styles.introCopy}>
            <Text style={styles.introTitle}>Передать нового клиента</Text>
            <Text style={styles.introText}>Заполните данные и выберите менеджера. Клиент сразу появится в его списке во второй CRM.</Text>
          </View>
        </View>
        <LabeledInput label="Имя и фамилия *" value={name} onChangeText={setName} placeholder="Иван Иванов" />
        <LabeledInput label="Номер телефона" value={phone} onChangeText={setPhone} placeholder="+373 000 00 000" keyboardType="phone-pad" />
        <LabeledInput label="Почта" value={email} onChangeText={setEmail} placeholder="client@example.com" keyboardType="default" />
        <LabeledInput label="С кем потерял" value={lostWith} onChangeText={setLostWith} placeholder="Необязательно" />
        <LabeledInput label="Дата заявки *" value={applicationDate} onChangeText={setApplicationDate} datePicker />

        <Text style={styles.label}>Назначить менеджера *</Text>
        {agents.length === 0 && !loading ? (
          <Text style={styles.empty}>Нет менеджеров с подключённой второй CRM.</Text>
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
  failedCard: { padding: 16, marginBottom: 20, borderRadius: 16, backgroundColor: colors.neutral[900], borderWidth: 1, borderColor: colors.error[600] },
  failedTitle: { fontFamily: 'Inter-SemiBold', fontSize: 16, color: colors.neutral[0], marginBottom: 6 },
  failedText: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 19, color: colors.neutral[200], marginBottom: 14 },
  failedRow: { paddingTop: 12, marginTop: 12, borderTopWidth: 1, borderTopColor: colors.error[600] },
  failedInfo: { marginBottom: 10 },
  failedName: { fontFamily: 'Inter-SemiBold', fontSize: 15, color: colors.neutral[0] },
  failedDate: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.neutral[300], marginTop: 3 },
  deleteButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.error[500] },
  deleteLabel: { fontFamily: 'Inter-SemiBold', fontSize: 14, color: colors.error[500] },
  bottomSpace: { height: 24 },
  connectionCard: { padding: 16, marginBottom: 20, borderRadius: 16, backgroundColor: colors.neutral[900], borderWidth: 1, borderColor: colors.neutral[700] },
  connectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  connectionTitle: { fontFamily: 'Inter-SemiBold', fontSize: 15, color: colors.neutral[0], flex: 1 },
  connectionButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.primary[600] },
  connectionLabel: { fontFamily: 'Inter-SemiBold', fontSize: 13, color: colors.neutral[0] },
  connectionHint: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 19, color: colors.neutral[400], marginTop: 10 },
  connectionOk: { fontFamily: 'Inter-Medium', fontSize: 13, lineHeight: 19, color: colors.accent[400], marginTop: 10 },
  connectionFail: { fontFamily: 'Inter-Medium', fontSize: 13, lineHeight: 19, color: colors.error[400], marginTop: 10 },
});
