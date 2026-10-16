const crypto = require("node:crypto");

const COOKIE_NAME = "choco_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Vary": "Cookie",
      ...extraHeaders
    },
    body: JSON.stringify(body)
  };
}

function digest(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

function safeEqual(a, b) {
  return crypto.timingSafeEqual(digest(a), digest(b));
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function createSession(secret) {
  const expiresAt = String(Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS);
  return expiresAt + "." + sign(expiresAt, secret);
}

function isValidSession(cookieHeader, secret) {
  if (!cookieHeader) return false;
  const cookie = cookieHeader.split(";").map(part => part.trim())
    .find(part => part.startsWith(COOKIE_NAME + "="));
  if (!cookie) return false;
  const value = decodeURIComponent(cookie.slice(COOKIE_NAME.length + 1));
  const [expiresAt, signature, ...extra] = value.split(".");
  if (!expiresAt || !signature || extra.length || !/^\d+$/.test(expiresAt)) return false;
  if (Number(expiresAt) <= Math.floor(Date.now() / 1000)) return false;
  return safeEqual(signature, sign(expiresAt, secret));
}

function sessionCookie(value, maxAge) {
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Method not allowed." }, { Allow: "POST" });
  }

  const adminKey = process.env.PANEL_ADMIN_KEY;
  const sessionSecret = process.env.PANEL_SESSION_SECRET;
  if (!adminKey || !sessionSecret || adminKey.length < 24 || sessionSecret.length < 32) {
    return json(503, { ok: false, error: "Autentikasi belum dikonfigurasi dengan aman." });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { ok: false, error: "Permintaan tidak valid." });
  }

  const action = payload && payload.action;
  if (action === "login") {
    if (typeof payload.key !== "string" || payload.key.length > 512) {
      return json(400, { ok: false, error: "Format access key tidak valid." });
    }
    if (!safeEqual(payload.key, adminKey)) {
      return json(401, { ok: false, error: "Access key tidak valid." });
    }
    const token = createSession(sessionSecret);
    return json(200, { ok: true }, {
      "Set-Cookie": sessionCookie(token, SESSION_TTL_SECONDS)
    });
  }

  if (action === "verify") {
    const authenticated = isValidSession(event.headers.cookie || event.headers.Cookie, sessionSecret);
    return json(200, { ok: true, authenticated });
  }

  if (action === "logout") {
    return json(200, { ok: true }, {
      "Set-Cookie": sessionCookie("", 0)
    });
  }

  return json(400, { ok: false, error: "Aksi tidak dikenal." });
};