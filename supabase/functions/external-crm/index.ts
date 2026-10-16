const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const targetUrl = Deno.env.get('TARGET_SUPABASE_URL');
const targetServiceRoleKey = Deno.env.get('TARGET_SUPABASE_SERVICE_ROLE_KEY');
const currentUrl = Deno.env.get('SUPABASE_URL');
const currentServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

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

function isAdmin(request: Request) {
  return getAuthInfo(request).isAdmin;
}

function requireConfiguration() {
  if (!targetUrl || !targetServiceRoleKey || !currentUrl || !currentServiceRoleKey) {
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
  if (lostWith && lostWith.length > 500) throw new Error('Invalid lead data');
  if (Number.isNaN(Date.parse(applicationDate))) throw new Error('Invalid lead data');

  const contact = {
    name,
    email,
    phone,
    status: 'Новый',
    agent_id: agentId,
    created_at: applicationDate,
    updated_at: applicationDate,
    notes: lostWith ? `С кем потерял: ${lostWith}` : null,
  };

  const response = await fetch(`${targetUrl}/rest/v1/contacts`, {
    method: 'POST',
    headers: { ...targetHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify(contact),
  });
  if (!response.ok) throw new Error('Target CRM rejected the lead');
  const rows = await response.json();
  const externalContactId = rows?.[0]?.id;
  if (typeof externalContactId !== 'string') throw new Error('Target CRM returned an invalid contact');

  await updateLocalLead(localLeadId, {
    external_contact_id: externalContactId,
    sync_status: 'synced',
    sync_error: null,
  });
  return { external_contact_id: externalContactId };
}

async function fetchAll(path: string) {
  const response = await fetch(`${targetUrl}${path}`, { headers: targetHeaders() });
  if (!response.ok) throw new Error('Target CRM analytics unavailable');
  return response.json();
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

async function listAgents() {
  requireConfiguration();
  const agents = await fetchAll('/rest/v1/agents?select=id,name,email,role,status&order=name.asc&limit=1000');
  if (!Array.isArray(agents)) throw new Error('Target CRM returned invalid agents');
  return agents.filter((a: { status?: string }) => a.status === 'active' || !a.status).map((a: { id: string; name: string; email?: string; role?: string }) => ({
    id: a.id,
    name: a.name,
    email: a.email ?? null,
    role: a.role ?? null,
  }));
}

async function analytics(body: Record<string, unknown>) {
  requireConfiguration();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const effectiveFrom = today.toISOString();
  let contactsPath = '/rest/v1/contacts?select=id,agent_id,status,created_at&limit=10000&order=created_at.desc';
  contactsPath += `&created_at=gte.${encodeURIComponent(effectiveFrom)}`;
  const [contacts, agents, history] = await Promise.all([
    fetchAll(contactsPath),
    fetchAll('/rest/v1/agents?select=id,name&status=eq.active&limit=1000'),
    fetchStatusHistory(),
  ]);
  const agentNames = new Map<string, string>((agents || []).map((agent: { id: string; name: string }) => [agent.id, agent.name]));
  const historyByContact = new Map<string, string[]>();
  for (const event of history || []) {
    if (typeof event.contact_id !== 'string' || typeof event.status !== 'string') continue;
    const statuses = historyByContact.get(event.contact_id) || [];
    if (!statuses.includes(event.status)) statuses.push(event.status);
    historyByContact.set(event.contact_id, statuses);
  }
  const makeSummary = (agentId: string) => ({ agent_id: agentId, agent_name: agentNames.get(agentId) || 'Без агента', total: 0, statuses: {} as Record<string, number> });
  const summaries = new Map<string, ReturnType<typeof makeSummary>>();
  const totals = { total: 0, statuses: {} as Record<string, number> };
  for (const contact of contacts || []) {
    if (typeof contact.created_at !== 'string') continue;
    const agentId = typeof contact.agent_id === 'string' && contact.agent_id ? contact.agent_id : 'unassigned';
    const currentStatus = typeof contact.status === 'string' ? contact.status : '';
    const statuses = historyByContact.get(contact.id) || (currentStatus ? [currentStatus] : []);
    if (statuses.includes('Нет ответа')) continue;
    const summary = summaries.get(agentId) || makeSummary(agentId);
    summary.total += 1;
    totals.total += 1;
    for (const status of statuses) {
      summary.statuses[status] = (summary.statuses[status] || 0) + 1;
      totals.statuses[status] = (totals.statuses[status] || 0) + 1;
    }
    summaries.set(agentId, summary);
  }
  const addConversions = (summary: { total: number; statuses: Record<string, number> }) => ({
    ...summary,
    in_work: summary.statuses['В работе'] || 0,
    deposits: summary.statuses['Депозит'] || 0,
    invalid: summary.statuses['Не валид'] || 0,
    work_conversion: summary.total ? (summary.statuses['В работе'] || 0) / summary.total : 0,
    deposit_conversion: summary.total ? (summary.statuses['Депозит'] || 0) / summary.total : 0,
    invalid_conversion: summary.total ? (summary.statuses['Не валид'] || 0) / summary.total : 0,
  });
  return { totals: addConversions(totals), by_agent: Array.from(summaries.values()).map(addConversions).sort((a, b) => b.total - a.total) };
}

async function findContact(body: Record<string, unknown>) {
  requireConfiguration();
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) throw new Error('name required');
  const encoded = encodeURIComponent(`%${name}%`);
  const contacts = await fetchAll(`/rest/v1/contacts?select=id,name,agent_id,status,created_at&name=ilike.${encoded}&limit=20&order=created_at.desc`);
  const agents = await fetchAll('/rest/v1/agents?select=id,name&limit=1000');
  const agentMap = new Map<string, string>((agents || []).map((a: { id: string; name: string }) => [a.id, a.name]));
  return (contacts || []).map((c: { id: string; name: string; agent_id: string; status: string; created_at: string }) => ({
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

async function myAnalytics(authInfo: AuthInfo) {
  requireConfiguration();
  if (!authInfo.userId) throw new Error('Not authenticated');

  // Find manager's external_agent_id
  const mgrRes = await fetch(`${currentUrl}/rest/v1/managers?select=external_agent_id&auth_user_id=eq.${encodeURIComponent(authInfo.userId)}&limit=1`, {
    headers: {
      apikey: currentServiceRoleKey!,
      Authorization: `Bearer ${currentServiceRoleKey!}`,
    },
  });
  if (!mgrRes.ok) throw new Error('Failed to fetch manager');
  const mgrData = await mgrRes.json();
  const externalAgentId = mgrData?.[0]?.external_agent_id;
  if (!externalAgentId) throw new Error('Agent not linked to external CRM');

  // Fetch only this agent's contacts from today
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const effectiveFrom = today.toISOString();
  let contactsPath = `/rest/v1/contacts?select=id,agent_id,status,created_at&limit=10000&order=created_at.desc`;
  contactsPath += `&created_at=gte.${encodeURIComponent(effectiveFrom)}`;
  contactsPath += `&agent_id=eq.${encodeURIComponent(externalAgentId)}`;

  const [contacts, agents, history] = await Promise.all([
    fetchAll(contactsPath),
    fetchAll('/rest/v1/agents?select=id,name&status=eq.active&limit=1000'),
    fetchStatusHistory(),
  ]);
  const agentName = (agents || []).find((a: { id: string }) => a.id === externalAgentId)?.name || 'Моя статистика';

  const historyByContact = new Map<string, string[]>();
  for (const event of history || []) {
    if (typeof event.contact_id !== 'string' || typeof event.status !== 'string') continue;
    const statuses = historyByContact.get(event.contact_id) || [];
    if (!statuses.includes(event.status)) statuses.push(event.status);
    historyByContact.set(event.contact_id, statuses);
  }

  const summary = { agent_id: externalAgentId, agent_name: agentName, total: 0, statuses: {} as Record<string, number> };
  for (const contact of contacts || []) {
    if (typeof contact.created_at !== 'string') continue;
    const currentStatus = typeof contact.status === 'string' ? contact.status : '';
    const statuses = historyByContact.get(contact.id) || (currentStatus ? [currentStatus] : []);
    if (statuses.includes('Нет ответа')) continue;
    summary.total += 1;
    for (const status of statuses) {
      summary.statuses[status] = (summary.statuses[status] || 0) + 1;
    }
  }

  const totals = { total: summary.total, statuses: { ...summary.statuses } };
  const addConversions = (s: { total: number; statuses: Record<string, number> }) => ({
    ...s,
    in_work: s.statuses['В работе'] || 0,
    deposits: s.statuses['Депозит'] || 0,
    invalid: s.statuses['Не валид'] || 0,
    work_conversion: s.total ? (s.statuses['В работе'] || 0) / s.total : 0,
    deposit_conversion: s.total ? (s.statuses['Депозит'] || 0) / s.total : 0,
    invalid_conversion: s.total ? (s.statuses['Не валид'] || 0) / s.total : 0,
  });
  return { totals: addConversions(totals), by_agent: [addConversions(summary)] };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const authInfo = getAuthInfo(request);
    if (!authInfo.authenticated) return json({ error: 'Not authorized' }, 403);
    const body = await request.json();
    let result;
    if (body.action === 'my_analytics') {
      result = await myAnalytics(authInfo);
    } else if (body.action === 'analytics') {
      if (!authInfo.isAdmin) return json({ error: 'Admin only' }, 403);
      result = await analytics(body);
    } else if (body.action === 'list_agents') {
      if (!authInfo.isAdmin) return json({ error: 'Admin only' }, 403);
      result = await listAgents();
    } else if (body.action === 'find_contact') {
      if (!authInfo.isAdmin) return json({ error: 'Admin only' }, 403);
      result = await findContact(body);
    } else if (body.action === 'assign_contact') {
      if (!authInfo.isAdmin) return json({ error: 'Admin only' }, 403);
      result = await assignContact(body);
    } else {
      if (!authInfo.isAdmin) return json({ error: 'Admin only' }, 403);
      result = await syncLead(body);
    }
    return json(result);
  } catch (error) {
    console.error('external CRM request failed', error);
    return json({ error: 'Не удалось выполнить операцию с внешней CRM' }, 400);
  }
});
