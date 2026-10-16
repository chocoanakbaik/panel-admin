const crypto = require("node:crypto");
const { json, readJsonBody } = require("./_lib/http");
const { requireOwner, requireSameOrigin } = require("./_lib/auth");
const { request, databaseError } = require("./_lib/supabase");

const SOURCE_URLS = {
  "choco-ai": "MODERATION_CHOCO_AI_URL"
};
const SOURCE_SECRETS = {
  "choco-ai": "MODERATION_CHOCO_AI_SECRET"
};

function safeText(value, max) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function expectedAccountStatus(action) {
  if (action === "suspend") return "suspended";
  if (action === "restore") return "active";
  if (action === "deactivate") return "deactivated";
  return null;
}

function signedHeaders(source, secret, timestamp, body, actionId) {
  const signature = crypto.createHmac("sha256", secret)
    .update(timestamp + "." + body, "utf8")
    .digest("hex");
  return {
    "Content-Type": "application/json",
    "x-panel-source": "choco-panel-admin",
    "x-panel-timestamp": timestamp,
    "x-panel-signature": signature,
    "x-panel-action-id": actionId
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Method not allowed." }, { Allow: "POST" });
  }
  const owner = requireOwner(event);
  if (!owner.ok) return owner.response;
  if (!requireSameOrigin(event)) return json(403, { ok: false, error: "Origin permintaan tidak diizinkan." });

  const parsed = readJsonBody(event, 8192);
  if (!parsed.ok) return parsed.response;
  const payload = parsed.value;
  const sourceId = payload.source_id;
  const accountRef = payload.account_ref;
  const actionType = payload.action_type;
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  const idempotencyKey = payload.idempotency_key;
  const expiresAt = payload.expires_at || null;

  if (!SOURCE_URLS[sourceId] || !safeText(accountRef, 160) ||
      !expectedAccountStatus(actionType) || !safeText(reason, 1000) ||
      !safeText(idempotencyKey, 128) || !/^[a-zA-Z0-9._:-]{8,128}$/.test(idempotencyKey)) {
    return json(400, { ok: false, error: "Sumber, akun, tindakan, alasan, atau idempotency key tidak valid." });
  }
  if (actionType === "suspend" && expiresAt &&
      (Number.isNaN(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now())) {
    return json(400, { ok: false, error: "Waktu berakhirnya penangguhan harus berada di masa depan." });
  }

  const urlValue = process.env[SOURCE_URLS[sourceId]];
  const secret = process.env[SOURCE_SECRETS[sourceId]];
  if (!urlValue || !secret || secret.length < 32) {
    return json(503, {
      ok: false,
      error: "Backend moderasi Choco AI belum dikonfigurasi. Tidak ada tindakan yang dijalankan."
    });
  }
  let targetUrl;
  try {
    targetUrl = new URL(urlValue);
    if (targetUrl.protocol !== "https:") throw new Error("https required");
  } catch {
    return json(503, { ok: false, error: "Endpoint moderasi sumber tidak dikonfigurasi dengan aman." });
  }

  try {
    const inserted = await request("moderation_actions", {
      method: "POST",
      query: "on_conflict=idempotency_key",
      body: {
        source_id: sourceId,
        source_account_ref: accountRef,
        action_type: actionType,
        reason,
        expires_at: expiresAt,
        status: "requested",
        idempotency_key: idempotencyKey
      },
      prefer: "resolution=ignore-duplicates,return=representation"
    });
    let action = Array.isArray(inserted.data) ? inserted.data[0] : null;
    if (!action) {
      const existing = await request("moderation_actions", {
        query: "select=id,status,source_id,source_account_ref,action_type,reason,expires_at&idempotency_key=eq." +
          encodeURIComponent(idempotencyKey) + "&limit=1"
      });
      const prior = Array.isArray(existing.data) ? existing.data[0] : null;
      if (!prior) return json(503, { ok: false, error: "Status tindakan tidak dapat diverifikasi." });
      if (prior.source_id !== sourceId || prior.source_account_ref !== accountRef ||
          prior.action_type !== actionType || prior.reason !== reason ||
          (prior.expires_at || null) !== (expiresAt || null)) {
        return json(409, { ok: false, error: "Idempotency key sudah dipakai untuk tindakan berbeda." });
      }
      if (prior.status === "confirmed") {
        return json(200, { ok: true, duplicate: true, status: "confirmed", action_id: prior.id });
      }
      action = prior;
      await request("moderation_actions", {
        method: "PATCH",
        query: "id=eq." + encodeURIComponent(action.id),
        body: { status: "requested" },
        prefer: "return=minimal"
      });
    }

    const command = {
      action_id: action.id,
      source_id: sourceId,
      source_account_ref: accountRef,
      action_type: actionType,
      reason,
      actor: "owner",
      expires_at: expiresAt,
      idempotency_key: idempotencyKey
    };
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify(command);
    let sourceResponse;
    let sourceResult = {};
    try {
      sourceResponse = await fetch(targetUrl, {
        method: "POST",
        headers: signedHeaders(sourceId, secret, timestamp, body, action.id),
        body,
        signal: AbortSignal.timeout(10000)
      });
      try { sourceResult = await sourceResponse.json(); } catch { sourceResult = {}; }
    } catch {
      sourceResponse = null;
    }

    const expectedStatus = expectedAccountStatus(actionType);
    const confirmed = Boolean(
      sourceResponse && sourceResponse.ok &&
      sourceResult && sourceResult.ok === true &&
      sourceResult.status === "confirmed" &&
      sourceResult.account_status === expectedStatus
    );

    const safeResult = {
      http_status: sourceResponse ? sourceResponse.status : null,
      status: sourceResult?.status || "no_confirmation",
      account_status: sourceResult?.account_status || null,
      command_ref: safeText(sourceResult?.command_ref, 160) ? sourceResult.command_ref : null
    };
    const finalized = await request("rpc/admin_finalize_moderation_action", {
      method: "POST",
      body: {
        p_action_id: action.id,
        p_status: confirmed ? "confirmed" : "failed",
        p_source_result: safeResult,
        p_actor: "owner",
        p_reason: reason,
        p_source_id: sourceId,
        p_account_ref: accountRef,
        p_account_status: confirmed ? expectedStatus : "unknown"
      }
    });

    if (!confirmed) {
      return json(502, {
        ok: false,
        error: "Layanan sumber belum mengonfirmasi tindakan. Status akun tidak dianggap berubah.",
        action_id: action.id,
        status: "failed"
      });
    }
    return json(200, { ok: true, status: "confirmed", action_id: action.id, data: finalized.data });
  } catch (error) {
    return databaseError(error);
  }
};
