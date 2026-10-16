const { json } = require("./_lib/http");
const { request, databaseError } = require("./_lib/supabase");

exports.config = {
  schedule: "@daily"
};

exports.handler = async (event) => {
  // Scheduled invocations have no HTTP method. Refuse manual/public HTTP calls.
  if (event && event.httpMethod) {
    return json(404, { ok: false, error: "Not found." });
  }

  const cutoff = encodeURIComponent(new Date().toISOString());
  try {
    await request("service_events", {
      method: "DELETE",
      query: "retention_until=lte." + cutoff
    });
    await request("reports", {
      method: "DELETE",
      query: "retention_until=lte." + cutoff + "&status=in.(resolved,dismissed)"
    });
    await request("feedback", {
      method: "DELETE",
      query: "retention_until=lte." + cutoff + "&status=in.(resolved,dismissed)"
    });
    return json(200, { ok: true, completed_at: new Date().toISOString() });
  } catch (error) {
    return databaseError(error);
  }
};
