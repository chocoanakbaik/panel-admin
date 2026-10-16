const crypto = require("node:crypto");
const { json, readJsonBody } = require("./_lib/http");
const { safeEqual, createSession, isValidSession, sessionCookie, getCookieHeader, requireSameOrigin } = require("./_lib/auth");
const { request } = require("./_lib/supabase");

const SESSION_TTL_SECONDS = 60 * 60 * 8;

function requesterHash(event, secret) {
  const ip = event.headers?.["x-nf-client-connection-ip"] ||
    event.headers?.["X-Nf-Client-Connection-Ip"] || "unknown";
  return crypto.createHmac("sha256", secret).update(String(ip)).digest("hex");
}

async function rateLimitState(ipHash) {
  const result = await request("rpc/admin_is_login_limited", {
    method: "POST",
    body: { p_ip_hash: ipHash }
  });
  return result.data === true;
}

async function recordLoginAttempt(ipHash, success) {
  await request("rpc/admin_record_login_attempt", {
    method: "POST",
    body: { p_ip_hash: ipHash, p_success: success }
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Method not allowed." }, { Allow: "POST" });
  }
  if (!requireSameOrigin(event)) {
    return json(403, { ok: false, error: "Origin permintaan tidak diizinkan." });
  }

  const adminKey = process.env.PANEL_ADMIN_KEY;
  const sessionSecret = process.env.PANEL_SESSION_SECRET;
  if (!adminKey || !sessionSecret || adminKey.length < 24 || sessionSecret.length < 32) {
    return json(503, { ok: false, error: "Autentikasi belum dikonfigurasi dengan aman." });
  }

  const parsed = readJsonBody(event, 4096);
  if (!parsed.ok) return parsed.response;
  const action = parsed.value.action;

  if (action === "verify") {
    const authenticated = isValidSession(getCookieHeader(event), sessionSecret);
    return json(200, { ok: true, authenticated });
  }

  if (action === "logout") {
    return json(200, { ok: true }, {
      "Set-Cookie": sessionCookie("", 0)
    });
  }

  if (action !== "login") return json(400, { ok: false, error: "Aksi tidak dikenal." });
  const key = parsed.value.key;
  if (typeof key !== "string" || key.length < 1 || key.length > 512) {
    return json(400, { ok: false, error: "Format access key tidak valid." });
  }

  const ipHash = requesterHash(event, sessionSecret);
  let limited;
  try {
    limited = await rateLimitState(ipHash);
  } catch {
    return json(503, { ok: false, error: "Layanan autentikasi sementara tidak tersedia." });
  }
  if (limited) {
    return json(429, { ok: false, error: "Terlalu banyak percobaan. Coba lagi setelah 15 menit." }, {
      "Retry-After": "900"
    });
  }

  const validKey = safeEqual(key, adminKey);
  try {
    await recordLoginAttempt(ipHash, validKey);
  } catch {
    return json(503, { ok: false, error: "Layanan autentikasi sementara tidak tersedia." });
  }
  if (!validKey) return json(401, { ok: false, error: "Access key tidak valid." });

  const token = createSession(sessionSecret, SESSION_TTL_SECONDS);
  return json(200, { ok: true }, {
    "Set-Cookie": sessionCookie(token, SESSION_TTL_SECONDS)
  });
};
