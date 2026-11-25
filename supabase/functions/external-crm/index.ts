import webpush from 'npm:web-push@3.6.7';


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const targetUrl = Deno.env.get('TARGET_SUPABASE_URL');
const targetServiceRoleKey = Deno.env.get('TARGET_SUPABASE_SERVICE_ROLE_KEY');
const targetCrmIntegrationKey = Deno.env.get('TARGET_CRM_INTEGRATION_KEY');
const targetAnonKey = Deno.env.get('TARGET_SUPABASE_ANON_KEY') || targetServiceRoleKey;
const currentUrl = Deno.env.get('SUPABASE_URL');
const currentServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type AuthInfo = { authenticated: boolean; isAdmin: boolean; userId: string | null };

function getAuthInfo(request: Request): AuthInfo {
  const authorization = request.headers.get('Authorization');
  const token = authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return { authenticated: false, isAdmin: false, userId: null };
  const payload = token.split('.')[1];
  if (!payload) return { authenticated: false, isAdmin: false, userId: null };
  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    const authenticated = claims?.role === 'authenticated' && typeof claims?.sub === 'string';
    const admin = authenticated && claims?.app_metadata?.role === 'admin';
    return { authenticated, isAdmin: admin, userId: claims?.sub ?? null };
  } catch {
    return { authenticated: false, isAdmin: false, userId: null };
  }
}

function requireConfiguration() {
  if (!targetUrl || !targetServiceRoleKey || !targetAnonKey || !currentUrl || !currentServiceRoleKey) {
    throw new Error('External CRM is not configured');
  }
}

function targetHeaders() {
  return {
    apikey: targetServiceRoleKey!,
    Authorization: `Bearer ${targetServiceRoleKey!}`,
    'Content-Type': 'application/json',
  };
}

function crmDataHeaders() {
  return {
    apikey: targetAnonKey!,
    'Content-Type': 'application/json',
    'X-CRM-SERVER-KEY': targetCrmIntegrationKey!,
  };
}

async function callCrmData(body: Record<string, unknown>): Promise<unknown[]> {
  const response = await fetch(`${targetUrl}/functions/v1/crm-data`, {
    method: 'POST',
    headers: crmDataHeaders(),
    body: JSON.stringify(body),
  });
  const responseText = await response.text().catch(() => '');
  let result: { data?: unknown; error?: unknown } | null = null;
  try {
    result = responseText ? JSON.parse(responseText) : null;
  } catch {
    result = null;
  }
  if (!response.ok || !result) {
    const detail = responseText.slice(0, 300).replace(/\s+/g, ' ').trim();
    throw new Error(`Вторая CRM вернула ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  if (result.error) {
    throw new Error(`Вторая CRM отклонила запрос: ${String(result.error)}`);
  }
  if (!Array.isArray(result.data)) {
    throw new Error('Вторая CRM вернула некорректный ответ');
  }
  return result.data;
}

async function getAppSetting(key: string): Promise<string | null> {
  const response = await fetch(`${currentUrl}/rest/v1/app_settings?select=value&key=eq.${encodeURIComponent(key)}&limit=1`, {
    headers: { apikey: currentServiceRoleKey!, Authorization: `Bearer ${currentServiceRoleKey!}` },
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return rows?.[0]?.value ?? null;
}

async function notifyAgentNewLead(agentId: string, leadName: string) {
  const vapidPublicKey = await getAppSetting('vapid_public_key');
  const vapidPrivateKey = await getAppSetting('vapid_private_key');
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error('push: VAPID keys not found in app_settings');
    return;
  }

  const managerResponse = await fetch(`${currentUrl}/rest/v1/managers?select=auth_user_id,external_agent_id&auth_user_id=not.is.null`, {
    headers: { apikey: currentServiceRoleKey!, Authorization: `Bearer ${currentServiceRoleKey!}` },
  });
  if (!managerResponse.ok) {
    console.error('push: failed to fetch managers', managerResponse.status);
    return;
  }
  const managers = await managerResponse.json();
  const matchedManagers = (managers || []).filter((m: { external_agent_id?: string | null; auth_user_id?: string }) =>
    m.external_agent_id && m.auth_user_id && m.external_agent_id === agentId,
  );
  const userIds = matchedManagers
    .map((m: { auth_user_id?: string }) => m.auth_user_id)
    .filter((userId: unknown): userId is string => typeof userId === 'string');
  if (userIds.length === 0) {
    console.error('push: no manager linked to external_agent_id', agentId);
    return;
  }

  const subscriptionResponse = await fetch(`${currentUrl}/rest/v1/push_subscriptions?select=id,endpoint,p256dh,auth&user_id=in.(${userIds.map(encodeURIComponent).join(',')})`, {
    headers: { apikey: currentServiceRoleKey!, Authorization: `Bearer ${currentServiceRoleKey!}` },
  });
  if (!subscriptionResponse.ok) {
    console.error('push: failed to fetch subscriptions', subscriptionResponse.status);
    return;
  }
  const subscriptions = await subscriptionResponse.json();
  if (!subscriptions || subscriptions.length === 0) {
    console.error('push: no subscriptions for users', userIds);
    return;
  }
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  await Promise.all((subscriptions || []).map(async (subscription: { id: string; endpoint: string; p256dh: string; auth: string }) => {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify({ title: 'Новый клиент', body: `${leadName} назначен вам через CRM`, url: '/leads' }),
      );
    } catch (error) {
      console.error('push: sendNotification failed', (error as Error).message);
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await fetch(`${currentUrl}/rest/v1/push_subscriptions?id=eq.${encodeURIComponent(subscription.id)}`, {
          method: 'DELETE',
          headers: { apikey: currentServiceRoleKey!, Authorization: `Bearer ${currentServiceRoleKey!}` },
        });
      }
    }
  }));
}

async function updateLocalLead(id: string, values: Record<string, unknown>) {
  const response = await fetch(`${currentUrl}/rest/v1/lead_submissions?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      apikey: currentServiceRoleKey!,
      Authorization: `Bearer ${currentServiceRoleKey!}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ ...values, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error('Local lead update failed');
}

async function syncLead(body: Record<string, unknown>) {
  requireConfiguration();
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : null;
  const phone = typeof body.phone === 'string' ? body.phone.trim() : null;
  const lostWith = typeof body.lost_with === 'string' ? body.lost_with.trim() : null;
  const applicationDate = typeof body.application_date === 'string' ? body.application_date : new Date().toISOString();
  const agentId = typeof body.external_agent_id === 'string' ? body.external_agent_id : '';
  const localLeadId = typeof body.local_lead_id === 'string' ? body.local_lead_id : '';

  if (!name || name.length > 200 || !agentId || !localLeadId) throw new Error('Invalid lead data');
  if (email && email.length > 320) throw new Error('Invalid lead data');
  if (phone && phone.length > 50) throw new Error('Invalid lead data');
  if (lostWith && lostWith.length > 100000) throw new Error('Invalid lead data');
  if (Number.isNaN(Date.parse(applicationDate))) throw new Error('Invalid lead data');

  const contact = {
    name,
    email,
    phone,
    status: 'Новый',
    agent_id: agentId,
    created_at: applicationDate,
    notes: lostWith ? `С кем потерял: ${lostWith}` : null,
  };

  const rows = await callCrmData({
    op: 'insert',
    table: 'contacts',
    values: contact,
  });
  const externalContactId = rows?.[0]?.id;
  if (typeof externalContactId !== 'string') throw new Error('Target CRM returned an invalid contact');

  await updateLocalLead(localLeadId, {
    external_contact_id: externalContactId,
    sync_status: 'synced',
    sync_error: null,
  });
  await notifyAgentNewLead(agentId, name).catch((err) => console.error('push notification failed:', err));
  return { external_contact_id: externalContactId };
}

async function fetchStatusHistory(): Promise<Array<{ contact_id: string; status: string }>> {
  const paths = [
    '/rest/v1/contact_status_history?select=contact_id,status,created_at&order=created_at.asc&limit=100000',
    '/rest/v1/status_history?select=contact_id,status,created_at&order=created_at.asc&limit=100000',
  ];
  for (const path of paths) {
    try {
      const response = await fetch(`${targetUrl}${path}`, { headers: targetHeaders() });
      if (response.ok) {
        const history = await response.json();
        if (Array.isArray(history)) return history;
      }
    } catch {
      // try next path
    }
  }
  return [];
}

async function checkConnection() {
  if (!targetUrl) {
    return { ok: false, status: 0, error: 'Адрес второй CRM (TARGET_SUPABASE_URL) не настроен' };
  }
  if (!targetCrmIntegrationKey) {
    return { ok: false, status: 0, error: 'Ключ доступа ко второй CRM (TARGET_CRM_INTEGRATION_KEY) не настроен' };
  }
  const response = await fetch(`${targetUrl}/functions/v1/crm-data`, {
    method: 'POST',
    headers: crmDataHeaders(),
    body: JSON.stringify({ op: 'select', table: 'agents', select: 'id' }),
  });
  const responseText = await response.text().catch(() => '');
  if (!response.ok) {
    const detail = responseText.slice(0, 300).replace(/\s+/g, ' ').trim();
    return { ok: false, status: response.status, error: `Вторая CRM вернула ${response.status}${detail ? `: ${detail}` : ''}` };
  }
  let result: { data?: unknown; error?: unknown } | null = null;
  try {
    result = responseText ? JSON.parse(responseText) : null;
  } catch {
    result = null;
  }
  if (result?.error) {
    return { ok: false, status: response.status, error: `Вторая CRM отклонила запрос: ${String(result.error)}` };
  }
  if (!result || !Array.isArray(result.data)) {
    return { ok: false, status: response.status, error: 'Вторая CRM вернула некорректный ответ' };
  }
  return { ok: true, status: response.status, agents_found: result.data.length };
}

async function listAgents() {
  requireConfiguration();
  const agents = await callCrmData({
    op: 'select',
    table: 'agents',
    select: 'id,name,email,role,status',
  });
  if (!Array.isArray(agents)) throw new Error('Target CRM returned invalid agents');
  return agents.filter((a: { status?: string }) => a.status === 'active' || !a.status).map((a: { id: string; name: string; email?: string; role?: string }) => ({
    id: a.id,
    name: a.name,
    email: a.email ?? null,
    role: a.role ?? null,
  }));
}

function dateRangeFromBody(body: Record<string, unknown>): { from?: string; to?: string } {
  const from = typeof body.from === 'string' ? body.from : undefined;
  const to = typeof body.to === 'string' ? body.to : undefined;
  return { from, to };
}

type LocalLead = {
  external_agent_id: string;
  external_contact_id: string;
  application_date: string;
};

async function fetchLocalLeads(from?: string, to?: string, externalAgentId?: string): Promise<LocalLead[]> {
  const params = new URLSearchParams({
    select: 'external_agent_id,external_contact_id,application_date',
    sync_status: 'eq.synced',
    external_contact_id: 'not.is.null',
    limit: '10000',
  });
  if (from) params.append('application_date', `gte.${from}`);
  if (to) params.append('application_date', `lt.${to}`);
  if (externalAgentId) params.set('external_agent_id', `eq.${externalAgentId}`);
  const response = await fetch(`${currentUrl}/rest/v1/lead_submissions?${params.toString()}`, {
    headers: {
      apikey: currentServiceRoleKey!,
      Authorization: `Bearer ${currentServiceRoleKey!}`,
    },
  });
  if (!response.ok) throw new Error('Local lead statistics unavailable');
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error('Invalid local lead statistics');
  return rows.filter((row: LocalLead) => row.external_agent_id && row.external_contact_id);
}

function makeAnalyticsSummary(agentId: string, agentName: string) {
  return { agent_id: agentId, agent_name: agentName, total: 0, statuses: {} as Record<string, number> };
}

function addConversions(summary: { total: number; statuses: Record<string, number> }) {
  return {
    ...summary,
    in_work: summary.statuses['В работе'] || 0,
    deposits: summary.statuses['Депозит'] || 0,
    invalid: summary.statuses['Не валид'] || 0,
    work_conversion: summary.total ? (summary.statuses['В работе'] || 0) / summary.total : 0,
    deposit_conversion: summary.total ? (summary.statuses['Депозит'] || 0) / summary.total : 0,
    invalid_conversion: summary.total ? (summary.statuses['Не валид'] || 0) / summary.total : 0,
  };
}

function isRealAgent(name: string | undefined | null): boolean {
  if (!name || !name.trim()) return false;
  const lower = name.trim().toLowerCase();
  return lower !== 'админ' && lower !== 'admin' && lower !== 'administrator';
}

async function fetchLocalAgents(): Promise<Array<{ id: string; name: string }>> {
  const response = await fetch(`${currentUrl}/rest/v1/managers?select=name,external_agent_id&external_agent_id=not.is.null&order=name.asc`, {
    headers: {
      apikey: currentServiceRoleKey!,
      Authorization: `Bearer ${currentServiceRoleKey!}`,
    },
  });
  if (!response.ok) throw new Error('Не удалось загрузить менеджеров текущей CRM');
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error('Текущая CRM вернула некорректный список менеджеров');
  return rows
    .filter((row: { external_agent_id?: unknown; name?: unknown }) =>
      typeof row.external_agent_id === 'string' && isRealAgent(typeof row.name === 'string' ? row.name : null),
    )
    .map((row: { external_agent_id: string; name: string }) => ({
      id: row.external_agent_id,
      name: row.name,
    }));
}

async function buildAnalytics(leads: LocalLead[], includeAllAgents: boolean) {
  const [agents, history] = await Promise.all([
    fetchLocalAgents(),
    fetchStatusHistory(),
  ]);
  const agentIds = Array.from(new Set(leads.map((lead) => lead.external_agent_id)));
  const agentNames = new Map<string, string>(agents.map((agent: { id: string; name: string }) => [agent.id, agent.name]));
  const summaries = new Map<string, ReturnType<typeof makeAnalyticsSummary>>();
  if (includeAllAgents) {
    for (const agent of agents || []) {
      if (typeof agent.id === 'string') summaries.set(agent.id, makeAnalyticsSummary(agent.id, agent.name || 'Без имени'));
    }
  }
  const historyByContact = new Map<string, string[]>();
  for (const event of history || []) {
    if (typeof event.contact_id !== 'string' || typeof event.status !== 'string') continue;
    const statuses = historyByContact.get(event.contact_id) || [];
    if (!statuses.includes(event.status)) statuses.push(event.status);
    historyByContact.set(event.contact_id, statuses);
  }

  const contactIds = Array.from(new Set(leads.map((lead) => lead.external_contact_id)));
  const contactById = new Map<string, { agent_id?: string; status?: string }>();
  // Long "id in (...)" URLs fail once the lead count grows; fetch in fixed-size chunks.
  const chunkSize = 200;
  for (let i = 0; i < contactIds.length; i += chunkSize) {
    const chunk = contactIds.slice(i, i + chunkSize);
    const contacts = await callCrmData({
      op: 'select',
      table: 'contacts',
      select: 'id,agent_id,status',
      filters: [{ col: 'id', op: 'in', value: chunk }],
    });
    for (const contact of (contacts || []) as Array<{ id: string; agent_id?: string; status?: string }>) {
      contactById.set(contact.id, contact);
    }
  }

  const validLeads = leads.filter((lead) => contactById.has(lead.external_contact_id));

  for (const lead of validLeads) {
    const contact = contactById.get(lead.external_contact_id);
    const agentId = lead.external_agent_id;
    const agentName = agentNames.get(agentId);
    if (!agentName) continue;
    const summary = summaries.get(agentId) || makeAnalyticsSummary(agentId, agentName);
    const currentStatus = contact?.status || '';
    const statuses = historyByContact.get(lead.external_contact_id) || (currentStatus ? [currentStatus] : []);
    summary.total += 1;
    for (const status of statuses) summary.statuses[status] = (summary.statuses[status] || 0) + 1;
    summaries.set(agentId, summary);
  }

  const totals = makeAnalyticsSummary('all', 'Все агенты');
  for (const summary of summaries.values()) {
    totals.total += summary.total;
    for (const [status, count] of Object.entries(summary.statuses)) totals.statuses[status] = (totals.statuses[status] || 0) + count;
  }
  return {
    totals: addConversions(totals),
    by_agent: Array.from(summaries.values()).filter((summary) => summary.total > 0 || includeAllAgents).map(addConversions).sort((a, b) => b.total - a.total),
  };
}

function maskName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 3) return trimmed;
  return `${trimmed.slice(0, 3)}${'*'.repeat(Math.min(trimmed.length - 3, 30))}`;
}

function kyivDateString(iso: string): string {
  return new Date(iso).toLocaleString('sv-SE', { timeZone: 'Europe/Kyiv' }).slice(0, 10);
}

async function dailyTransferred(body: Record<string, unknown>) {
  requireConfiguration();
  const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
    ? body.date
    : kyivDateString(new Date().toISOString());

  const params = new URLSearchParams({
    select: 'id,name,application_date,external_contact_id,external_agent_id,assigned_manager_id,sync_status,created_at',
    sync_status: 'eq.synced',
    external_contact_id: 'not.is.null',
    order: 'created_at.desc',
    limit: '10000',
  });
  const response = await fetch(`${currentUrl}/rest/v1/lead_submissions?${params.toString()}`, {
    headers: { apikey: currentServiceRoleKey!, Authorization: `Bearer ${currentServiceRoleKey!}` },
  });
  if (!response.ok) throw new Error('Не удалось загрузить список переданных клиентов');
  const leads = await response.json();
  if (!Array.isArray(leads)) throw new Error('Некорректный список переданных клиентов');

  const agentNames = new Map<string, string>(
    (await fetchLocalAgents()).map((a: { id: string; name: string }) => [a.id, a.name]),
  );

  const contactIds = Array.from(new Set(leads.map((l: { external_contact_id: string }) => l.external_contact_id)));
  const contactById = new Map<string, { status?: string; agent_id?: string }>();
  const chunkSize = 200;
  for (let i = 0; i < contactIds.length; i += chunkSize) {
    const chunk = contactIds.slice(i, i + chunkSize);
    const contacts = await callCrmData({
      op: 'select',
      table: 'contacts',
      select: 'id,agent_id,status',
      filters: [{ col: 'id', op: 'in', value: chunk }],
    });
    for (const contact of (contacts || []) as Array<{ id: string; agent_id?: string; status?: string }>) {
      contactById.set(contact.id, contact);
    }
  }

  const items = (leads || [])
    .filter((lead: { created_at: string }) => kyivDateString(lead.created_at) === date)
    .map((lead: { id: string; name: string; application_date: string; external_contact_id: string; external_agent_id: string | null; assigned_manager_id: string | null; created_at: string }) => {
    const contact = contactById.get(lead.external_contact_id);
    return {
      id: lead.id,
      name: maskName(lead.name),
      application_date: lead.created_at,
      status: contact?.status || 'Неизвестно',
      agent_name: lead.external_agent_id ? agentNames.get(lead.external_agent_id) || null : null,
    };
  });

  const statuses: Record<string, number> = {};
  for (const item of items) {
    statuses[item.status] = (statuses[item.status] || 0) + 1;
  }

  return { date, total: items.length, statuses, items };
}

async function analytics(body: Record<string, unknown>) {
  requireConfiguration();
  const { from, to } = dateRangeFromBody(body);
  const leads = await fetchLocalLeads(from, to);
  return buildAnalytics(leads, true);
}

async function findContact(body: Record<string, unknown>) {
  requireConfiguration();
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) throw new Error('name required');
  const contacts = await callCrmData({
    op: 'select',
    table: 'contacts',
    select: 'id,name,agent_id,status,created_at',
  });
  const agents = await callCrmData({
    op: 'select',
    table: 'agents',
    select: 'id,name',
  });
  const agentMap = new Map<string, string>((agents || []).map((a: { id: string; name: string }) => [a.id, a.name]));
  return (contacts || [])
    .filter((c: { name?: string }) => typeof c.name === 'string' && c.name.toLowerCase().includes(name.toLowerCase()))
    .slice(0, 20)
    .map((c: { id: string; name: string; agent_id: string; status: string; created_at: string }) => ({
    id: c.id,
    name: c.name,
    agent_id: c.agent_id,
    agent_name: agentMap.get(c.agent_id) || null,
    status: c.status,
    created_at: c.created_at,
  }));
}

async function assignContact(body: Record<string, unknown>) {
  requireConfiguration();
  const contactId = typeof body.contact_id === 'string' ? body.contact_id.trim() : '';
  const agentId = typeof body.agent_id === 'string' ? body.agent_id.trim() : '';
  const status = typeof body.status === 'string' ? body.status.trim() : '';
  if (!contactId || !agentId) throw new Error('contact_id and agent_id required');
  const patch: Record<string, string> = { agent_id: agentId, updated_at: new Date().toISOString() };
  if (status) patch.status = status;
  const response = await fetch(`${targetUrl}/rest/v1/contacts?id=eq.${encodeURIComponent(contactId)}`, {
    method: 'PATCH',
    headers: { ...targetHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error('Failed to update contact');
  const rows = await response.json();
  return { updated: rows?.[0] ?? null };
}

async function myAnalytics(authInfo: AuthInfo, body: Record<string, unknown>) {
  requireConfiguration();
  if (!authInfo.userId) throw new Error('Not authenticated');

  const mgrRes = await fetch(`${currentUrl}/rest/v1/managers?select=external_agent_id&auth_user_id=eq.${encodeURIComponent(authInfo.userId)}&limit=1`, {
    headers: {
      apikey: currentServiceRoleKey!,
      Authorization: `Bearer ${currentServiceRoleKey!}`,
    },
  });
  if (!mgrRes.ok) throw new Error('Failed to fetch manager');
  const mgrData = await mgrRes.json();
  const externalAgentId = mgrData?.[0]?.external_agent_id;
  if (!externalAgentId) {
    return {
      totals: { total: 0, statuses: {}, in_work: 0, deposits: 0, invalid: 0, work_conversion: 0, deposit_conversion: 0, invalid_conversion: 0 },
      by_agent: [],
    };
  }

  const { from, to } = dateRangeFromBody(body);
  const leads = await fetchLocalLeads(from, to, externalAgentId);
  return buildAnalytics(leads, false);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const authInfo = getAuthInfo(request);
    if (!authInfo.authenticated) return json({ error: 'Not authorized' }, 403);
    const body = await request.json();
    let result;
    if (body.action === 'my_analytics') {
      result = await myAnalytics(authInfo, body);
    } else if (body.action === 'analytics') {
      if (!authInfo.isAdmin) return json({ error: 'Admin only' }, 403);
      result = await analytics(body);
    } else if (body.action === 'daily_transferred') {
      if (!authInfo.isAdmin) return json({ error: 'Admin only' }, 403);
      result = await dailyTransferred(body);
    } else if (body.action === 'check_connection') {
      if (!authInfo.isAdmin) return json({ error: 'Admin only' }, 403);
      result = await checkConnection();
    } else if (body.action === 'list_agents') {
      if (!authInfo.isAdmin) return json({ error: 'Admin only' }, 403);
      result = await listAgents();
    } else if (body.action === 'find_contact') {
      if (!authInfo.isAdmin) return json({ error: 'Admin only' }, 403);
      result = await findContact(body);
    } else if (body.action === 'assign_contact') {
      if (!authInfo.isAdmin) return json({ error: 'Admin only' }, 403);
      result = await assignContact(body);
    } else if (body.action === 'get_vapid_public_key') {
      result = { public_key: await getAppSetting('vapid_public_key') };
    } else {
      if (!authInfo.isAdmin) return json({ error: 'Admin only' }, 403);
      result = await syncLead(body);
    }
    return json(result);
  } catch (error) {
    console.error('external CRM request failed', error);
    const detail = error instanceof Error ? error.message : 'unknown error';
    return json({ error: `Не удалось выполнить операцию со второй CRM: ${detail}` }, 400);
  }
});
