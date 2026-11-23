import { supabase } from '@/lib/supabase';

export type ExternalAgent = {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
};

export type ExternalAnalyticsRow = {
  agent_id: string;
  agent_name: string;
  total: number;
  statuses: Record<string, number>;
  in_work: number;
  deposits: number;
  invalid: number;
  work_conversion: number;
  deposit_conversion: number;
  invalid_conversion: number;
};

export type ExternalAnalyticsTotals = {
  total: number;
  statuses: Record<string, number>;
  in_work: number;
  deposits: number;
  invalid: number;
  work_conversion: number;
  deposit_conversion: number;
  invalid_conversion: number;
};

export type ExternalAnalyticsResponse = {
  totals: ExternalAnalyticsTotals;
  by_agent: ExternalAnalyticsRow[];
};

async function callExternalCrm(body: Record<string, unknown>) {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('Сессия истекла. Войдите снова.');

  const response = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/external-crm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
    },
    body: JSON.stringify(body),
  });
  const responseText = await response.text();
  let result: Record<string, unknown> | unknown[] | null = null;
  try {
    result = responseText ? JSON.parse(responseText) : null;
  } catch {
    result = null;
  }
  if (!response.ok || !result) {
    const rawMessage = typeof result === 'object' && result && !Array.isArray(result) && typeof result.error === 'string'
      ? result.error
      : responseText || 'Пустой ответ сервера';
    const message = `Код ${response.status}: ${rawMessage}`;
    throw new Error(rawMessage === 'Agent not linked to external CRM'
      ? 'Ваш профиль ещё не привязан к агенту во внешней CRM. Обратитесь к администратору.'
      : message);
  }
  if (typeof result === 'object' && result && !Array.isArray(result) && typeof result.error === 'string') {
    throw new Error(`Код ${response.status}: ${result.error}`);
  }
  return result;
}

export function syncLead(input: {
  local_lead_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  lost_with: string | null;
  application_date: string;
  external_agent_id: string;
}) {
  return callExternalCrm({ action: 'sync_lead', ...input });
}

export type ExternalConnectionCheck = {
  ok: boolean;
  status: number;
  error?: string;
  agents_found?: number;
};

export async function checkExternalConnection(): Promise<ExternalConnectionCheck> {
  const result = await callExternalCrm({ action: 'check_connection' });
  if (!result || Array.isArray(result) || typeof (result as { ok?: unknown }).ok !== 'boolean') {
    throw new Error('Сервер вернул некорректный результат проверки');
  }
  return result as ExternalConnectionCheck;
}

export async function fetchExternalAgents() {
  const result = await callExternalCrm({ action: 'list_agents' });
  if (!Array.isArray(result)) throw new Error('Внешняя CRM вернула некорректный список агентов');
  return result as ExternalAgent[];
}

export async function fetchMyAnalytics(from?: string, to?: string): Promise<ExternalAnalyticsResponse> {
  const payload: Record<string, unknown> = { action: 'my_analytics' };
  if (from) payload.from = from;
  if (to) payload.to = to;
  const result = await callExternalCrm(payload);
  if (!result || Array.isArray(result) || !Array.isArray(result.by_agent))
    throw new Error('Внешняя CRM вернула некорректную аналитику');
  return result as ExternalAnalyticsResponse;
}

export async function fetchExternalAnalytics(from?: string, to?: string): Promise<ExternalAnalyticsResponse> {
  const payload: Record<string, unknown> = { action: 'analytics' };
  if (from) payload.from = from;
  if (to) payload.to = to;
  const result = await callExternalCrm(payload);
  if (!result || Array.isArray(result) || !Array.isArray(result.by_agent))
    throw new Error('Внешняя CRM вернула некорректную аналитику');
  return result as ExternalAnalyticsResponse;
}
