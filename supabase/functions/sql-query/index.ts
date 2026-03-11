import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-api-key",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate API Key
  const apiKey = req.headers.get("x-api-key");
  const expectedKey = Deno.env.get("SQL_MANAGER_API_KEY");

  if (!apiKey || apiKey !== expectedKey) {
    return new Response(
      JSON.stringify({ error: "Unauthorized: invalid API key" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const { table, select = "*", filters, limit = 1000, offset = 0, order } = body;

    // Create admin client (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Dynamically fetch allowed tables from information_schema
    const { data: tablesData, error: tablesError } = await supabaseAdmin
      .from("information_schema.tables")
      .select("table_name")
      .eq("table_schema", "public")
      .eq("table_type", "BASE TABLE");

    if (tablesError) {
      return new Response(
        JSON.stringify({ error: "Erro ao verificar tabelas disponíveis: " + tablesError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const allowedTables = (tablesData ?? []).map((t: { table_name: string }) => t.table_name);

    // Validate table name against dynamic allowlist
    if (!table || !allowedTables.includes(table)) {
      return new Response(
        JSON.stringify({
          error: `Tabela inválida. Tabelas disponíveis: ${allowedTables.sort().join(", ")}`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let query = supabaseAdmin.from(table).select(select);

    // Apply filters: [{ column, operator, value }]
    if (filters && Array.isArray(filters)) {
      for (const f of filters) {
        const { column, operator, value } = f;
        switch (operator) {
          case "eq": query = query.eq(column, value); break;
          case "neq": query = query.neq(column, value); break;
          case "gt": query = query.gt(column, value); break;
          case "gte": query = query.gte(column, value); break;
          case "lt": query = query.lt(column, value); break;
          case "lte": query = query.lte(column, value); break;
          case "like": query = query.like(column, value); break;
          case "ilike": query = query.ilike(column, value); break;
          case "in": query = query.in(column, value); break;
          case "is": query = query.is(column, value); break;
        }
      }
    }

    // Apply ordering
    if (order) {
      const { column, ascending = true } = order;
      query = query.order(column, { ascending });
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ data, count: data?.length ?? 0, table, select }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
