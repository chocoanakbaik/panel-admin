const { json, readJsonBody } = require("./_lib/http");
const { requireOwner, requireSameOrigin } = require("./_lib/auth");
const { request, countRows, databaseError } = require("./_lib/supabase");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function queryParams(event) {
  try {
    if (event.rawUrl) return new URL(event.rawUrl, "https://panel.invalid").searchParams;
  } catch {
    // Fall back to Netlify's parsed query string.
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(event.queryStringParameters || {})) {
    if (typeof value === "string") params.set(key, value);
  }
  return params;
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function validEnum(value, allowed) {
  return typeof value === "string" && allowed.includes(value);
}

async function overview() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [events24h, accounts, openReports, openFeedback, integrations] = await Promise.all([
    countRows("service_events", "received_at=gte." + encodeURIComponent(since)),
    countRows("accounts"),
    countRows("reports", "status=in.(new,reviewing)"),
    countRows("feedback", "status=in.(new,reviewing)"),
    request("integration_sources", {
      query: "select=source_id,display_name,enabled,health_status,last_event_at,last_health_at&order=display_name.asc"
    })
  ]);
  return {
    events_last_24h: events24h,
    accounts_total: accounts,
    reports_open: openReports,
    feedback_open: openFeedback,
    integrations: integrations.data || [],
    generated_at: new Date().toISOString()
  };
}

async function listResource(resource, params) {
  const limit = clampNumber(params.get("limit"), 25, 1, 100);
  const offset = clampNumber(params.get("offset"), 0, 0, 1000000);
  const searchRaw = (params.get("q") || "").trim().slice(0, 100).replace(/[^a-zA-Z0-9\\s._-]/g, " ");
  const query = new URLSearchParams();
  query.set("limit", String(limit));
  query.set("offset", String(offset));

  if (resource === "events") {
    query.set("select", "id,source_id,event_id,event_type,occurred_at,received_at,subject_type,subject_ref,severity,data_json");
    query.set("order", "received_at.desc");
    const source = params.get("source");
    if (["choco-ai", "sara-ai", "help-center"].includes(source)) query.set("source_id", "eq." + source);
    const eventType = params.get("event_type");
    if (eventType && /^[a-z0-9._-]{1,80}$/i.test(eventType)) query.set("event_type", "eq." + eventType);
    return (await request("service_events", { query: query.toString() })).data || [];
  }

  if (resource === "reports") {
    query.set("select", "id,source_id,source_report_ref,report_type,category,description,evidence,status,priority,submitted_at,updated_at");
    query.set("order", "submitted_at.desc");
    const status = params.get("status");
    if (validEnum(status, ["new", "reviewing", "resolved", "dismissed"])) query.set("status", "eq." + status);
    const type = params.get("type");
    if (validEnum(type, ["abuse", "sara_response", "safety", "bug", "other"])) query.set("report_type", "eq." + type);
    if (searchRaw) query.set("or", "(description.ilike.*" + searchRaw + "*,category.ilike.*" + searchRaw + "*)");
    return (await request("reports", { query: query.toString() })).data || [];
  }

  if (resource === "feedback") {
    query.set("select", "id,source_id,source_feedback_ref,category,message,status,submitted_at,updated_at");
    query.set("order", "submitted_at.desc");
    const status = params.get("status");
    if (validEnum(status, ["new", "reviewing", "planned", "resolved", "dismissed"])) query.set("status", "eq." + status);
    if (searchRaw) query.set("message", "ilike.*" + searchRaw + "*");
    return (await request("feedback", { query: query.toString() })).data || [];
  }

  if (resource === "accounts") {
    query.set("select", "id,source_id,source_account_ref,display_label,status_cache,created_at,last_seen_at,last_status_sync_at");
    query.set("order", "last_seen_at.desc.nullslast");
    const source = params.get("source");
    if (["choco-ai", "sara-ai", "help-center"].includes(source)) query.set("source_id", "eq." + source);
    if (validEnum(params.get("status"), ["unknown", "active", "suspended", "deactivated"])) query.set("status_cache", "eq." + params.get("status"));
    const rows = (await request("accounts", { query: query.toString() })).data || [];
    return rows.map(row => ({
      ...row,
      moderation_available: row.source_id === "choco-ai" &&
        process.env.MODERATION_CHOCO_AI_ENABLED === "true" && Boolean(process.env.MODERATION_CHOCO_AI_URL && process.env.MODERATION_CHOCO_AI_SECRET)
    }));
  }

  if (resource === "audit") {
    query.set("select", "id,actor,action,target_type,target_ref,reason,result,created_at");
    query.set("order", "created_at.desc");
    return (await request("admin_audit_log", { query: query.toString() })).data || [];
  }

  return null;
}

exports.handler = async (event) => {
  const owner = requireOwner(event);
  if (!owner.ok) return owner.response;

  const method = event.httpMethod;
  if (method === "GET") {
    const params = queryParams(event);
    const resource = params.get("resource") || "overview";
    try {
      if (resource === "overview") return json(200, { ok: true, data: await overview() });
      if (["events", "reports", "feedback", "accounts", "audit"].includes(resource)) {
        return json(200, { ok: true, data: await listResource(resource, params) });
      }
      if (resource === "integrations") {
        const result = await request("integration_sources", {
          query: "select=source_id,display_name,enabled,allowed_event_types,health_status,last_event_at,last_health_at&order=display_name.asc"
        });
        return json(200, { ok: true, data: result.data || [] });
      }
      return json(400, { ok: false, error: "Resource tidak dikenal." });
    } catch (error) {
      return databaseError(error);
    }
  }

  if (method === "POST") {
    if (!requireSameOrigin(event)) return json(403, { ok: false, error: "Origin permintaan tidak diizinkan." });
    const parsed = readJsonBody(event, 16384);
    if (!parsed.ok) return parsed.response;
    const payload = parsed.value;
    const resource = payload.resource;
    const id = payload.id;
    const status = payload.status;
    const reason = typeof payload.reason === "string" ? payload.reason.trim().slice(0, 1000) : "";
    if (!UUID_RE.test(id || "") || !reason) {
      return json(400, { ok: false, error: "ID dan alasan tindak lanjut wajib diisi." });
    }

    let rpc;
    if (resource === "reports" && validEnum(status, ["new", "reviewing", "resolved", "dismissed"])) {
      rpc = "admin_update_report_status";
    } else if (resource === "feedback" && validEnum(status, ["new", "reviewing", "planned", "resolved", "dismissed"])) {
      rpc = "admin_update_feedback_status";
    } else {
      return json(400, { ok: false, error: "Perubahan status tidak valid." });
    }

    try {
      const result = await request("rpc/" + rpc, {
        method: "POST",
        body: { p_id: id, p_status: status, p_actor: "owner", p_reason: reason },
        prefer: "return=representation"
      });
      if (!result.data) return json(404, { ok: false, error: "Data tidak ditemukan." });
      return json(200, { ok: true, data: result.data });
    } catch (error) {
      return databaseError(error);
    }
  }

  return json(405, { ok: false, error: "Method not allowed." }, { Allow: "GET, POST" });
};
