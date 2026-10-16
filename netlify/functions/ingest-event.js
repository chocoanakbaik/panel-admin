const crypto = require("node:crypto");
const { json, readJsonBody } = require("./_lib/http");
const { request, databaseError } = require("./_lib/supabase");

const MAX_CLOCK_SKEW_SECONDS = 300;
const MAX_BODY_BYTES = 65536;
const SOURCES = {
  "choco-ai": "INTEGRATION_CHOCO_AI_SECRET",
  "sara-ai": "INTEGRATION_SARA_AI_SECRET",
  "help-center": "INTEGRATION_HELP_CENTER_SECRET"
};

function getHeader(event, name) {
  return event.headers?.[name] || event.headers?.[name.toLowerCase()] || "";
}

function rawBody(event) {
  if (!event.body) return "";
  return event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
}

function safeSignatureEqual(actual, expected) {
  if (typeof actual !== "string" || !/^[a-f0-9]{64}$/i.test(actual)) return false;
  const a = Buffer.from(actual, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function validateString(value, max = 160) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function validateEvent(payload) {
  if (payload.schema_version !== "1") return "Versi skema event tidak didukung.";
  if (!validateString(payload.event_id, 128)) return "event_id tidak valid.";
  if (!validateString(payload.source, 64)) return "source tidak valid.";
  if (!validateString(payload.event_type, 80)) return "event_type tidak valid.";
  if (!validateString(payload.idempotency_key, 128)) return "idempotency_key tidak valid.";
  if (!payload.occurred_at || Number.isNaN(Date.parse(payload.occurred_at))) return "occurred_at tidak valid.";
  if (!payload.data || typeof payload.data !== "object" || Array.isArray(payload.data)) return "data harus berupa objek.";
  if (payload.subject !== undefined && (
    !payload.subject || typeof payload.subject !== "object" || Array.isArray(payload.subject) ||
    (payload.subject.type !== undefined && !validateString(payload.subject.type, 40)) ||
    (payload.subject.id !== undefined && !validateString(payload.subject.id, 160))
  )) return "subject tidak valid.";

  if (payload.event_type === "abuse.report_submitted") {
    const d = payload.data;
    if (!validateString(d.report_id, 128) || !validateString(d.category, 80) ||
        !validateString(d.description, 5000)) return "Data laporan penyalahgunaan tidak lengkap.";
  }
  if (payload.event_type === "sara.response_reported") {
    const d = payload.data;
    if (!validateString(d.report_id, 128) || !validateString(d.category, 80) ||
        !validateString(d.description, 5000)) return "Data laporan Sara tidak lengkap.";
  }
  if (payload.event_type === "user.feedback_submitted") {
    const d = payload.data;
    if (!validateString(d.feedback_id, 128) || !validateString(d.category, 80) ||
        !validateString(d.message, 5000)) return "Data masukan tidak lengkap.";
  }
  return null;
}

function mapReportType(eventType) {
  if (eventType === "abuse.report_submitted") return "abuse";
  if (eventType === "sara.response_reported") return "sara_response";
  return "safety";
}

function retentionUntil(envName, fallbackDays, minDays, maxDays) {
  const configured = Number(process.env[envName]);
  const days = Number.isInteger(configured) && configured >= minDays && configured <= maxDays
    ? configured : fallbackDays;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Method not allowed." }, { Allow: "POST" });
  }
  const contentType = getHeader(event, "content-type").toLowerCase();
  if (!contentType.includes("application/json")) {
    return json(415, { ok: false, error: "Content-Type harus application/json." });
  }

  const bodyText = rawBody(event);
  if (Buffer.byteLength(bodyText, "utf8") > MAX_BODY_BYTES) {
    return json(413, { ok: false, error: "Payload terlalu besar." });
  }

  const source = getHeader(event, "x-choco-source");
  const timestampText = getHeader(event, "x-choco-timestamp");
  const signature = getHeader(event, "x-choco-signature");
  const envName = SOURCES[source];
  const secret = envName && process.env[envName];
  if (!secret || !timestampText || !signature) {
    return json(401, { ok: false, error: "Autentikasi sumber tidak valid." });
  }

  const timestamp = Number(timestampText);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(timestamp) || Math.abs(now - timestamp) > MAX_CLOCK_SKEW_SECONDS) {
    return json(401, { ok: false, error: "Timestamp permintaan tidak valid." });
  }

  const expectedSignature = crypto.createHmac("sha256", secret)
    .update(timestampText + "." + bodyText, "utf8")
    .digest("hex");
  if (!safeSignatureEqual(signature, expectedSignature)) {
    return json(401, { ok: false, error: "Tanda tangan permintaan tidak valid." });
  }

  let payload;
  try {
    payload = JSON.parse(bodyText || "{}");
  } catch {
    return json(400, { ok: false, error: "Format JSON tidak valid." });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return json(400, { ok: false, error: "Payload harus berupa objek JSON." });
  }
  const validationError = validateEvent(payload);
  if (validationError) return json(400, { ok: false, error: validationError });
  if (payload.source !== source) return json(401, { ok: false, error: "Sumber event tidak sesuai dengan kredensial." });

  try {
    const sourceResult = await request("integration_sources", {
      query: "select=source_id,enabled,allowed_event_types&source_id=eq." + encodeURIComponent(source) + "&limit=1"
    });
    const sourceConfig = Array.isArray(sourceResult.data) ? sourceResult.data[0] : null;
    if (!sourceConfig || !sourceConfig.enabled) {
      return json(403, { ok: false, error: "Integrasi sumber belum diaktifkan." });
    }
    if (!Array.isArray(sourceConfig.allowed_event_types) ||
        !sourceConfig.allowed_event_types.includes(payload.event_type)) {
      return json(400, { ok: false, error: "Jenis event tidak diizinkan untuk sumber ini." });
    }

    const data = payload.data;
    if (payload.event_type === "abuse.report_submitted" || payload.event_type === "sara.response_reported") {
      const report = {
        source_id: source,
        source_report_ref: data.report_id,
        report_type: mapReportType(payload.event_type),
        category: data.category,
        description: data.description,
        evidence: data.evidence && typeof data.evidence === "object" ? data.evidence : {},
        priority: ["low", "normal", "high", "urgent"].includes(data.priority) ? data.priority : "normal",
        submitted_at: payload.occurred_at,
        retention_until: retentionUntil("PANEL_REPORT_RETENTION_DAYS", 365, 30, 1825)
      };
      await request("reports", {
        method: "POST",
        query: "on_conflict=source_id%2Csource_report_ref",
        body: report,
        prefer: "resolution=ignore-duplicates,return=minimal"
      });
    }

    if (payload.event_type === "user.feedback_submitted") {
      const feedback = {
        source_id: source,
        source_feedback_ref: data.feedback_id,
        category: ["criticism", "suggestion", "bug", "usability", "other"].includes(data.category) ? data.category : "other",
        message: data.message,
        submitted_at: payload.occurred_at,
        retention_until: retentionUntil("PANEL_FEEDBACK_RETENTION_DAYS", 365, 30, 1825)
      };
      await request("feedback", {
        method: "POST",
        query: "on_conflict=source_id%2Csource_feedback_ref",
        body: feedback,
        prefer: "resolution=ignore-duplicates,return=minimal"
      });
    }

    if (payload.event_type === "account.activity" && payload.subject?.type === "account" && payload.subject.id) {
      await request("accounts", {
        method: "POST",
        query: "on_conflict=source_id%2Csource_account_ref",
        body: {
          source_id: source,
          source_account_ref: payload.subject.id,
          last_seen_at: payload.occurred_at
        },
        prefer: "resolution=merge-duplicates,return=minimal"
      });
    }

    const eventResult = await request("service_events", {
      method: "POST",
      query: "on_conflict=source_id%2Cevent_id",
      body: {
        source_id: source,
        event_id: payload.event_id,
        schema_version: payload.schema_version,
        event_type: payload.event_type,
        occurred_at: payload.occurred_at,
        subject_type: payload.subject?.type || null,
        subject_ref: payload.subject?.id || null,
        severity: ["info", "low", "medium", "high", "critical"].includes(data.severity) ? data.severity : null,
        data_json: data,
        idempotency_key: payload.idempotency_key,
        retention_until: retentionUntil("PANEL_EVENT_RETENTION_DAYS", 90, 7, 730)
      },
      prefer: "resolution=ignore-duplicates,return=representation"
    });

    await request("integration_sources", {
      method: "PATCH",
      query: "source_id=eq." + encodeURIComponent(source),
      body: { last_event_at: new Date().toISOString(), health_status: "healthy", updated_at: new Date().toISOString() },
      prefer: "return=minimal"
    });

    const duplicate = Array.isArray(eventResult.data) && eventResult.data.length === 0;
    return json(202, { ok: true, accepted: true, duplicate });
  } catch (error) {
    return databaseError(error);
  }
};
