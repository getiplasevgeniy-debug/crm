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

function isAdmin(request: Request) {
  const authorization = request.headers.get('Authorization');
  const token = authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return false;
  const payload = token.split('.')[1];
  if (!payload) return false;
  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return claims?.role === 'authenticated' && claims?.user_metadata?.role !== 'admin' && claims?.app_metadata?.role === 'admin';
  } catch {
    return false;
  }
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

async function fetchStatusHistory() {
  const paths = [
    '/rest/v1/contact_status_history?select=contact_id,status,created_at&order=created_at.asc&limit=100000',
    '/rest/v1/status_history?select=contact_id,status,created_at&order=created_at.asc&limit=100000',
  ];
  for (const path of paths) {
    const response = await fetch(`${targetUrl}${path}`, { headers: targetHeaders() });
    if (response.ok) {
      const history = await response.json();
      if (Array.isArray(history)) return history;
    }
  }
  throw new Error('Target CRM status history unavailable');
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
  const trackingStart = '2026-10-01T00:00:00.000Z';
  requireConfiguration();
  const from = typeof body.from === 'string' ? body.from : '';
  const to = typeof body.to === 'string' ? body.to : '';
  const requestedFrom = from && !Number.isNaN(Date.parse(from)) ? from : trackingStart;
  const effectiveFrom = new Date(requestedFrom) < new Date(trackingStart) ? trackingStart : requestedFrom;
  let contactsPath = '/rest/v1/contacts?select=id,agent_id,status,created_at,notes&limit=10000&order=created_at.desc';
  contactsPath += `&created_at=gte.${encodeURIComponent(effectiveFrom)}`;
  if (to && !Number.isNaN(Date.parse(to))) contactsPath += `&created_at=lt.${encodeURIComponent(to)}`;
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
    if (typeof contact.notes !== 'string' || !contact.notes.trim() || typeof contact.created_at !== 'string') continue;
    const statuses = historyByContact.get(contact.id) || (typeof contact.status === 'string' ? [contact.status] : []);
    if (statuses.includes('Нет ответа')) continue;
    const agentId = contact.agent_id || 'unassigned';
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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    if (!isAdmin(request)) return json({ error: 'Not authorized' }, 403);
    const body = await request.json();
    const result = body.action === 'analytics' ? await analytics(body) : body.action === 'list_agents' ? await listAgents() : await syncLead(body);
    return json(result);
  } catch (error) {
    console.error('external CRM request failed', error);
    return json({ error: 'Не удалось выполнить операцию с внешней CRM' }, 400);
  }
});
