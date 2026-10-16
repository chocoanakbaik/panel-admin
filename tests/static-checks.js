const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const exists = file => fs.existsSync(path.join(root, file));

for (const file of [
  "public/index.html",
  "public/style.css",
  "public/app.js",
  "netlify.toml",
  "supabase/schema.sql",
  "netlify/functions/admin-auth.js",
  "netlify/functions/admin-api.js",
  "netlify/functions/ingest-event.js",
  "netlify/functions/admin-moderation.js"
]) {
  assert.ok(exists(file), "Required project file is missing: " + file);
}

const netlify = read("netlify.toml");
assert.match(netlify, /publish\s*=\s*"public"/, "Only the public directory should be deployed as static assets.");
assert.match(netlify, /functions\s*=\s*"netlify\/functions"/, "Netlify Functions directory must be configured.");
assert.match(netlify, /Content-Security-Policy/, "Security policy header is required.");

const auth = read("netlify/functions/admin-auth.js");
assert.match(auth, /PANEL_ADMIN_KEY/, "Owner key must be checked server-side.");
assert.match(auth, /admin_is_login_limited/, "Login rate limiting must be enabled.");
assert.match(auth, /requireSameOrigin/, "Auth actions must enforce same-origin requests.");

const ingestion = read("netlify/functions/ingest-event.js");
assert.match(ingestion, /x-choco-signature/, "Source signatures must be required.");
assert.match(ingestion, /timingSafeEqual/, "Signature comparison must be timing-safe.");
assert.match(ingestion, /idempotency_key/, "Event ingestion must be idempotent.");

const moderation = read("netlify/functions/admin-moderation.js");
assert.match(moderation, /status === "confirmed"/, "Moderation must require source confirmation.");
assert.match(moderation, /MODERATION_CHOCO_AI_URL/, "Moderation must call the account-owning service.");
assert.match(moderation, /idempotency_key/, "Moderation commands must be idempotent.");

const html = read("public/index.html");
for (const id of ["login-view", "dashboard-view", "service-grid", "events-table-body", "accounts-table-body", "reports-list", "feedback-list"]) {
  assert.ok(html.includes('id="' + id + '"'), "Required UI target is missing: " + id);
}

console.log("Static project checks passed.");
