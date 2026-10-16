const { json } = require("./http");

function getConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { url: url.replace(/\/$/, ""), key };
}

async function request(table, options = {}) {
  const config = getConfig();
  if (!config) {
    const error = new Error("Database is not configured.");
    error.status = 503;
    throw error;
  }
  const { method = "GET", query = "", body, prefer, range } = options;
  const endpoint = new URL(`${config.url}/rest/v1/${table}`);
  if (query) endpoint.search = query;
  const headers = {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    Accept: "application/json"
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;
  if (range) headers.Range = range;
  const response = await fetch(endpoint, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }
  if (!response.ok) {
    const error = new Error("Database request failed.");
    error.status = response.status >= 500 ? 503 : 400;
    error.databaseStatus = response.status;
    throw error;
  }
  return { data, headers: response.headers, status: response.status };
}

async function countRows(table, filters = "") {
  const result = await request(table, {
    query: filters ? `select=id&${filters}` : "select=id",
    prefer: "count=exact",
    range: "0-0"
  });
  const contentRange = result.headers.get("content-range") || "";
  const match = contentRange.match(/\/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function databaseError(error) {
  const status = error && error.status === 503 ? 503 : 500;
  return json(status, {
    ok: false,
    error: status === 503
      ? "Penyimpanan belum tersedia. Periksa konfigurasi database."
      : "Permintaan data gagal diproses."
  });
}

module.exports = { getConfig, request, countRows, databaseError };
