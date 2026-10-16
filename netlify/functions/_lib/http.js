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

function readJsonBody(event, maxBytes = 65536) {
  const body = event.body || "";
  if (Buffer.byteLength(body, "utf8") > maxBytes) {
    return { ok: false, response: json(413, { ok: false, error: "Payload terlalu besar." }) };
  }
  try {
    const parsed = JSON.parse(body || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, response: json(400, { ok: false, error: "Format JSON tidak valid." }) };
  }
}

module.exports = { json, readJsonBody };
