import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cnpj, companyName, email, password, fullName } = await req.json();

    if (!cnpj || !companyName || !email || !password || !fullName) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios ausentes" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Check if company already exists
    const { data: existingCompany } = await supabaseAdmin
      .from("companies")
      .select("id")
      .eq("cnpj", cnpj)
      .maybeSingle();

    let companyId: string;

    if (existingCompany) {
      companyId = existingCompany.id;
    } else {
      // Create company
      const { data: newCompany, error: companyError } = await supabaseAdmin
        .from("companies")
        .insert({ cnpj, name: companyName, email })
        .select("id")
        .single();

      if (companyError) {
        return new Response(JSON.stringify({ error: companyError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      companyId = newCompany.id;
    }

    // Check if this is the first user of this company
    const { count } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId);

    const isFirstUser = count === 0;

    // Create auth user (handle existing user gracefully)
    let userId: string;
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingAuthUser = existingUsers?.users?.find((u) => u.email === email);

    if (existingAuthUser) {
      // User already exists in auth - check if they have a profile (partial registration)
      const { data: existingProfile } = await supabaseAdmin
        .from("profiles")
        .select("user_id")
        .eq("user_id", existingAuthUser.id)
        .maybeSingle();

      if (existingProfile) {
        // Fully registered already - return success so frontend can login
        return new Response(
          JSON.stringify({ success: true, userId: existingAuthUser.id, role: isFirstUser ? "admin" : "user" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      userId = existingAuthUser.id;
      // Update password in case it changed
      await supabaseAdmin.auth.admin.updateUserById(userId, { password });
    } else {
      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (authError) {
        return new Response(JSON.stringify({ error: authError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = authUser.user.id;
    }

    // Create profile
    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      user_id: userId,
      company_id: companyId,
      full_name: fullName,
      email,
    });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Assign role (first user = admin)
    const role = isFirstUser ? "admin" : "user";
    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
      user_id: userId,
      company_id: companyId,
      role,
    });

    if (roleError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return new Response(JSON.stringify({ error: roleError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, userId, role }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
