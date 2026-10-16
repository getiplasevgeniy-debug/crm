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
  in_work: number;
  deposits: number;
  invalid: number;
  work_conversion: number;
  deposit_conversion: number;
  invalid_conversion: number;
};

export type ExternalAnalyticsTotals = {
  total: number;
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
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(result?.error || 'Не удалось связаться с внешней CRM');
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

export async function fetchExternalAgents() {
  const result = await callExternalCrm({ action: 'list_agents' });
  if (!Array.isArray(result)) throw new Error('Внешняя CRM вернула некорректный список агентов');
  return result as ExternalAgent[];
}

export async function fetchExternalAnalytics(from?: string, to?: string): Promise<ExternalAnalyticsResponse> {
  const payload: Record<string, unknown> = { action: 'analytics' };
  if (from) payload.from = from;
  if (to) payload.to = to;
  const result = await callExternalCrm(payload);
  if (!result || typeof result !== 'object' || !Array.isArray(result.by_agent))
    throw new Error('Внешняя CRM вернула некорректную аналитику');
  return result as ExternalAnalyticsResponse;
}
