const crypto = require("node:crypto");
const { json } = require("./http");

const COOKIE_NAME = "choco_admin_session";

function digest(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest();
}

function safeEqual(a, b) {
  return crypto.timingSafeEqual(digest(a), digest(b));
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function createSession(secret, ttlSeconds = 60 * 60 * 8) {
  const expiresAt = String(Math.floor(Date.now() / 1000) + ttlSeconds);
  return expiresAt + "." + sign(expiresAt, secret);
}

function getCookieValue(cookieHeader) {
  if (!cookieHeader) return "";
  const cookie = String(cookieHeader).split(";").map(part => part.trim())
    .find(part => part.startsWith(COOKIE_NAME + "="));
  if (!cookie) return "";
  try {
    return decodeURIComponent(cookie.slice(COOKIE_NAME.length + 1));
  } catch {
    return "";
  }
}

function isValidSession(cookieHeader, secret) {
  if (!secret || typeof secret !== "string" || secret.length < 32) return false;
  const value = getCookieValue(cookieHeader);
  if (!value) return false;
  const [expiresAt, signature, ...extra] = value.split(".");
  if (!expiresAt || !signature || extra.length || !/^\d+$/.test(expiresAt)) return false;
  if (Number(expiresAt) <= Math.floor(Date.now() / 1000)) return false;
  return safeEqual(signature, sign(expiresAt, secret));
}

function sessionCookie(value, maxAge) {
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

function getCookieHeader(event) {
  return event.headers?.cookie || event.headers?.Cookie || "";
}

function requireOwner(event) {
  const secret = process.env.PANEL_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    return { ok: false, response: json(503, { ok: false, error: "Autentikasi belum dikonfigurasi." }) };
  }
  if (!isValidSession(getCookieHeader(event), secret)) {
    return { ok: false, response: json(401, { ok: false, error: "Sesi admin tidak valid atau telah berakhir." }) };
  }
  return { ok: true };
}

function requireSameOrigin(event) {
  const origin = event.headers?.origin || event.headers?.Origin;
  const host = event.headers?.host || event.headers?.Host;
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    return parsed.host === host && parsed.protocol === "https:";
  } catch {
    return false;
  }
}

module.exports = {
  safeEqual,
  sign,
  createSession,
  isValidSession,
  sessionCookie,
  getCookieHeader,
  requireOwner,
  requireSameOrigin
};
