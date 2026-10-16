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

async function analytics() {
  requireConfiguration();
  const [contacts, agents] = await Promise.all([
    fetchAll('/rest/v1/contacts?select=id,agent_id,status,created_at&limit=10000'),
    fetchAll('/rest/v1/agents?select=id,name&status=eq.active&limit=1000'),
  ]);
  const agentNames = new Map<string, string>((agents || []).map((agent: { id: string; name: string }) => [agent.id, agent.name]));
  const summaries = new Map<string, { agent_id: string; agent_name: string; total: number; in_work: number; deposits: number; invalid: number }>();

  for (const contact of contacts || []) {
    const agentId = contact.agent_id || 'unassigned';
    const summary = summaries.get(agentId) || {
      agent_id: agentId,
      agent_name: agentNames.get(agentId) || 'Без агента',
      total: 0,
      in_work: 0,
      deposits: 0,
      invalid: 0,
    };
    summary.total += 1;
    if (contact.status === 'В работе') summary.in_work += 1;
    if (contact.status === 'Депозит') summary.deposits += 1;
    if (contact.status === 'Не валид') summary.invalid += 1;
    summaries.set(agentId, summary);
  }

  return Array.from(summaries.values()).map((summary) => ({
    ...summary,
    work_conversion: summary.total ? summary.in_work / summary.total : 0,
    deposit_conversion: summary.in_work ? summary.deposits / summary.in_work : 0,
    invalid_conversion: summary.total ? summary.invalid / summary.total : 0,
  })).sort((a, b) => b.total - a.total);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    if (!isAdmin(request)) return json({ error: 'Not authorized' }, 403);
    const body = await request.json();
    const result = body.action === 'analytics' ? await analytics() : await syncLead(body);
    return json(result);
  } catch (error) {
    console.error('external CRM request failed', error);
    return json({ error: 'Не удалось выполнить операцию с внешней CRM' }, 400);
  }
});
