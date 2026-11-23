import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerRole = userData.user.app_metadata?.role;
    if (callerRole !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    if (body.action === "reset-password") {
      const managerId = typeof body.manager_id === "string" ? body.manager_id.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!managerId || password.length < 6) {
        return new Response(JSON.stringify({ error: "Manager and password are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: manager, error: managerError } = await supabase
        .from("managers")
        .select("auth_user_id")
        .eq("id", managerId)
        .maybeSingle();
      if (managerError || !manager?.auth_user_id) {
        return new Response(JSON.stringify({ error: "Manager account is not available" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: updateError } = await supabase.auth.admin.updateUserById(manager.auth_user_id, { password });
      if (updateError) {
        return new Response(JSON.stringify({ error: "Could not update manager password" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { name, phone, salary_percentage, email, password } = body;

    if (!name || !email || !password) {
      return new Response(JSON.stringify({ error: "name, email, password are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (password.length < 6) {
      return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: newAuthUser, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: "manager" },
      app_metadata: { role: "manager" },
    });

    if (createErr) {
      return new Response(JSON.stringify({ error: createErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const external_agent_id = typeof body.external_agent_id === "string" && body.external_agent_id
      ? body.external_agent_id
      : null;

    const { data: manager, error: mgrErr } = await supabase
      .from("managers")
      .insert({
        name,
        phone: phone || null,
        salary_percentage: salary_percentage || 0,
        auth_user_id: newAuthUser.user.id,
        email,
        external_agent_id,
      })
      .select()
      .single();

    if (mgrErr) {
      await supabase.auth.admin.deleteUser(newAuthUser.user.id);
      return new Response(JSON.stringify({ error: mgrErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ manager }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
