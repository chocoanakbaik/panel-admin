const { json } = require("./_lib/http");
const { request, databaseError } = require("./_lib/supabase");

exports.handler = async (event) => {
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
