const loginView = document.getElementById("login-view");
const dashboardView = document.getElementById("dashboard-view");
const loginForm = document.getElementById("login-form");
const accessKeyInput = document.getElementById("access-key");
const loginButton = document.getElementById("login-button");
const loginMessage = document.getElementById("login-message");
const logoutButton = document.getElementById("logout-button");
const refreshButton = document.getElementById("refresh-button");
const globalMessage = document.getElementById("global-message");

const SOURCE_NAMES = {
  "choco-ai": "Choco AI",
  "sara-ai": "Sara AI",
  "help-center": "Choco AI Help Center"
};
const STATUS_LABELS = {
  "new": "Baru",
  "reviewing": "Ditinjau",
  "resolved": "Selesai",
  "dismissed": "Ditutup",
  "planned": "Direncanakan",
  "unknown": "Belum tersinkron",
  "active": "Aktif",
  "suspended": "Ditangguhkan",
  "deactivated": "Dinonaktifkan",
  "healthy": "Terhubung",
  "degraded": "Perlu diperiksa",
  "disconnected": "Terputus",
  "pending": "Belum terhubung"
};

async function readJson(response) {
  try { return await response.json(); } catch { return {}; }
}

async function requestAuth(action, key) {
  const response = await fetch("/.netlify/functions/admin-auth", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, key })
  });
  return { response, result: await readJson(response) };
}

async function requestAdmin(resource, params = {}) {
  const url = new URL("/.netlify/functions/admin-api", window.location.origin);
  url.searchParams.set("resource", resource);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  const result = await readJson(response);
  if (response.status === 401) {
    showLogin("Sesi admin berakhir. Silakan masuk kembali.");
    throw new Error("Sesi admin berakhir.");
  }
  if (!response.ok || !result.ok) {
    const error = new Error(result.error || "Data tidak dapat dimuat.");
    error.status = response.status;
    throw error;
  }
  return result.data;
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
  accessKeyInput.value = "";
  loadDashboard();
}

function showLogin(message = "") {
  dashboardView.hidden = true;
  loginView.hidden = false;
  loginMessage.textContent = message;
}

function setGlobalMessage(title, description, type = "info") {
  globalMessage.replaceChildren();
  const strong = document.createElement("strong");
  strong.textContent = title;
  const span = document.createElement("span");
  span.textContent = description;
  globalMessage.dataset.type = type;
  globalMessage.append(strong, span);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function sourceName(sourceId) {
  return SOURCE_NAMES[sourceId] || sourceId || "Sumber tidak diketahui";
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status || "Tidak diketahui";
}

function makeStatusPill(status) {
  const pill = document.createElement("span");
  pill.className = "status-pill status-" + String(status || "unknown").replace(/[^a-z0-9_-]/gi, "");
  pill.textContent = statusLabel(status);
  return pill;
}

function setMetric(name, value) {
  const node = document.querySelector('[data-metric="' + name + '"]');
  if (node) node.textContent = Number.isFinite(Number(value)) ? Number(value).toLocaleString("id-ID") : "—";
}

function renderServices(items) {
  const container = document.getElementById("service-grid");
  container.replaceChildren();
  const byId = new Map((Array.isArray(items) ? items : []).map(item => [item.source_id, item]));
  for (const id of ["choco-ai", "sara-ai", "help-center"]) {
    const item = byId.get(id);
    let status = item?.health_status || "pending";
    if (!item || !item.enabled || !item.last_event_at) status = "pending";
    else if (Date.now() - new Date(item.last_event_at).getTime() > 48 * 60 * 60 * 1000) status = "degraded";

    const card = document.createElement("article");
    card.className = "service-card";
    const indicator = document.createElement("span");
    indicator.className = "service-indicator " + status;
    const details = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = item?.display_name || sourceName(id);
    const description = document.createElement("p");
    description.textContent = item?.last_event_at
      ? "Event terakhir: " + formatDate(item.last_event_at)
      : "Belum ada event yang diterima panel.";
    details.append(title, description);
    const state = document.createElement("span");
    state.className = "service-state";
    state.textContent = statusLabel(status);
    card.append(indicator, details, state);
    container.append(card);
  }
}

function renderEvents(items) {
  const tbody = document.getElementById("events-table-body");
  tbody.replaceChildren();
  if (!items?.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.className = "empty-cell";
    cell.textContent = "Belum ada data aktivitas dari layanan yang terhubung.";
    row.append(cell);
    tbody.append(row);
    return;
  }
  for (const item of items) {
    const row = document.createElement("tr");
    const values = [
      formatDate(item.occurred_at),
      sourceName(item.source_id),
      item.event_type || "—",
      item.subject_ref || "—",
      item.severity || "—"
    ];
    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    tbody.append(row);
  }
}

function renderAccounts(items) {
  const tbody = document.getElementById("accounts-table-body");
  tbody.replaceChildren();
  if (!items?.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.className = "empty-cell";
    cell.textContent = "Belum ada akun yang dilaporkan oleh sumber terhubung.";
    row.append(cell);
    tbody.append(row);
    return;
  }
  for (const item of items) {
    const row = document.createElement("tr");
    const source = document.createElement("td");
    source.textContent = sourceName(item.source_id);
    const account = document.createElement("td");
    account.textContent = item.display_label || item.source_account_ref || "—";
    const status = document.createElement("td");
    status.append(makeStatusPill(item.status_cache));
    const seen = document.createElement("td");
    seen.textContent = formatDate(item.last_seen_at);
    const actions = document.createElement("td");
    const actionWrap = document.createElement("div");
    actionWrap.className = "account-actions";
    const reason = document.createElement("input");
    reason.type = "text";
    reason.maxLength = 1000;
    reason.placeholder = "Alasan wajib";
    reason.setAttribute("aria-label", "Alasan moderasi akun " + (item.source_account_ref || ""));
    const available = item.source_id === "choco-ai" && item.moderation_available === true;
    if (!available) {
      reason.disabled = true;
      reason.title = "Backend moderasi sumber belum terhubung.";
    }
    const makeActionButton = (label, actionType) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.disabled = !available;
      button.title = available ? label : "Backend moderasi sumber belum terhubung.";
      button.addEventListener("click", () => runModeration(item, actionType, reason, button));
      return button;
    };
    actionWrap.append(
      reason,
      makeActionButton("Tangguhkan", "suspend"),
      makeActionButton("Pulihkan", "restore"),
      makeActionButton("Nonaktifkan", "deactivate")
    );
    if (!available) {
      const note = document.createElement("span");
      note.className = "moderation-pending";
      note.textContent = "Belum terhubung";
      actionWrap.append(note);
    }
    actions.append(actionWrap);
    row.append(source, account, status, seen, actions);
    tbody.append(row);
  }
}

async function runModeration(account, actionType, reasonInput, button) {
  const reason = reasonInput.value.trim();
  if (!reason) {
    reasonInput.setCustomValidity("Masukkan alasan moderasi.");
    reasonInput.reportValidity();
    return;
  }
  reasonInput.setCustomValidity("");
  if (actionType === "deactivate" &&
      !window.confirm("Konfirmasi: nonaktifkan akun ini secara permanen? Pastikan alasan dan identitas akun sudah benar.")) {
    return;
  }
  button.disabled = true;
  const originalLabel = button.textContent;
  button.textContent = "Memproses...";
  const idempotencyKey = window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : ("mod-" + Date.now() + "-" + Math.random().toString(36).slice(2, 14));
  try {
    const response = await fetch("/.netlify/functions/admin-moderation", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_id: account.source_id,
        account_ref: account.source_account_ref,
        action_type: actionType,
        reason,
        idempotency_key: idempotencyKey
      })
    });
    const result = await readJson(response);
    if (response.status === 401) {
      showLogin("Sesi admin berakhir. Silakan masuk kembali.");
      return;
    }
    if (!response.ok || !result.ok || result.status !== "confirmed") {
      throw new Error(result.error || "Layanan sumber belum mengonfirmasi tindakan.");
    }
    setGlobalMessage("Tindakan moderasi dikonfirmasi", "Layanan Choco AI telah mengonfirmasi status akun. Tindakan dan alasannya dicatat di audit log.", "success");
    await loadDashboard();
  } catch (error) {
    setGlobalMessage("Tindakan moderasi tidak dikonfirmasi", error.message || "Tidak ada perubahan status yang dapat dipastikan.", "error");
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

function makeSelect(currentValue, allowedValues) {
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Status tindak lanjut");
  for (const value of allowedValues) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = statusLabel(value);
    option.selected = value === currentValue;
    select.append(option);
  }
  return select;
}

function makeRecordCard(item, type) {
  const card = document.createElement("article");
  card.className = "record-card";
  const head = document.createElement("div");
  head.className = "record-head";
  const title = document.createElement("h3");
  title.className = "record-title";
  title.textContent = (type === "reports" ? item.category : item.category) || "Tanpa kategori";
  const status = makeStatusPill(item.status);
  head.append(title, status);

  const meta = document.createElement("div");
  meta.className = "record-meta";
  const source = document.createElement("span");
  source.textContent = sourceName(item.source_id);
  const date = document.createElement("span");
  date.textContent = formatDate(item.submitted_at);
  meta.append(source, date);
  if (item.report_type) {
    const reportType = document.createElement("span");
    reportType.textContent = item.report_type === "sara_response" ? "Laporan jawaban Sara" : item.report_type;
    meta.append(reportType);
  }

  const description = document.createElement("p");
  description.className = "record-description";
  description.textContent = type === "reports" ? (item.description || "Tidak ada deskripsi.") : (item.message || "Tidak ada isi masukan.");

  const controls = document.createElement("div");
  controls.className = "record-controls";
  const label = document.createElement("label");
  label.textContent = "Tindak lanjut";
  const statusSelect = makeSelect(item.status, type === "reports"
    ? ["new", "reviewing", "resolved", "dismissed"]
    : ["new", "reviewing", "planned", "resolved", "dismissed"]);
  const reason = document.createElement("input");
  reason.type = "text";
  reason.maxLength = 1000;
  reason.placeholder = "Alasan perubahan status (wajib)";
  reason.setAttribute("aria-label", "Alasan perubahan status");
  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "Simpan tindak lanjut";
  save.addEventListener("click", async () => {
    if (!reason.value.trim()) {
      reason.setCustomValidity("Masukkan alasan tindak lanjut.");
      reason.reportValidity();
      return;
    }
    reason.setCustomValidity("");
    save.disabled = true;
    save.textContent = "Menyimpan...";
    try {
      const response = await fetch("/.netlify/functions/admin-api", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: type,
          id: item.id,
          status: statusSelect.value,
          reason: reason.value.trim()
        })
      });
      const result = await readJson(response);
      if (response.status === 401) {
        showLogin("Sesi admin berakhir. Silakan masuk kembali.");
        return;
      }
      if (!response.ok || !result.ok) throw new Error(result.error || "Perubahan gagal disimpan.");
      setGlobalMessage("Tindak lanjut tersimpan", "Status dan alasan perubahan telah dicatat di audit log.", "success");
      await loadDashboard();
    } catch (error) {
      let message = card.querySelector(".inline-error");
      if (!message) {
        message = document.createElement("p");
        message.className = "inline-error";
        controls.after(message);
      }
      message.textContent = error.message || "Perubahan gagal disimpan.";
    } finally {
      save.disabled = false;
      save.textContent = "Simpan tindak lanjut";
    }
  });
  controls.append(label, statusSelect, reason, save);
  card.append(head, meta, description, controls);
  return card;
}

function renderAudit(items) {
  const tbody = document.getElementById("audit-table-body");
  tbody.replaceChildren();
  if (!items?.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.className = "empty-cell";
    cell.textContent = "Belum ada tindakan admin yang tercatat.";
    row.append(cell);
    tbody.append(row);
    return;
  }
  for (const item of items) {
    const row = document.createElement("tr");
    const values = [
      formatDate(item.created_at),
      item.actor || "owner",
      item.action || "—",
      [item.target_type, item.target_ref].filter(Boolean).join(": ") || "—",
      item.reason || "—",
      item.result || "—"
    ];
    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    tbody.append(row);
  }
}

function renderRecords(containerId, items, type) {
  const container = document.getElementById(containerId);
  container.replaceChildren();
  if (!items?.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = type === "reports"
      ? "Belum ada laporan yang diterima. Sumber laporan akan muncul setelah integrasi aktif."
      : "Belum ada masukan yang diterima. Sumber masukan akan muncul setelah formulir terhubung.";
    container.append(empty);
    return;
  }
  for (const item of items) container.append(makeRecordCard(item, type));
}

async function loadDashboard() {
  if (refreshButton) refreshButton.disabled = true;
  setGlobalMessage("Memuat data...", "Menghubungkan dashboard ke API privat dan penyimpanan.", "info");
  try {
    const overview = await requestAdmin("overview");
    setMetric("events_last_24h", overview.events_last_24h);
    setMetric("accounts_total", overview.accounts_total);
    setMetric("reports_open", overview.reports_open);
    setMetric("feedback_open", overview.feedback_open);
    const generatedAt = formatDate(overview.generated_at);
    document.getElementById("data-updated-at").textContent = "Data dihitung pada " + generatedAt + ".";
    document.getElementById("footer-updated-at").textContent = generatedAt;

    const eventSource = document.getElementById("activity-source-filter").value;
    const accountSource = document.getElementById("account-source-filter").value;
    const reportSearch = document.getElementById("report-search").value.trim();
    const reportStatus = document.getElementById("report-status-filter").value;
    const feedbackSearch = document.getElementById("feedback-search").value.trim();
    const feedbackStatus = document.getElementById("feedback-status-filter").value;
    const [integrations, events, accounts, reports, feedback, audit] = await Promise.all([
      requestAdmin("integrations"),
      requestAdmin("events", { limit: 12, source: eventSource }),
      requestAdmin("accounts", { limit: 12, source: accountSource }),
      requestAdmin("reports", { limit: 10, q: reportSearch, status: reportStatus }),
      requestAdmin("feedback", { limit: 10, q: feedbackSearch, status: feedbackStatus }),
      requestAdmin("audit", { limit: 25 })
    ]);
    renderServices(integrations);
    renderEvents(events);
    renderAccounts(accounts);
    renderRecords("reports-list", reports, "reports");
    renderRecords("feedback-list", feedback, "feedback");
    renderAudit(audit);
    setGlobalMessage(
      "Dashboard tersambung ke penyimpanan",
      "Data ditampilkan berdasarkan event yang benar-benar diterima. Sumber tanpa event tetap ditandai belum terhubung.",
      "success"
    );
  } catch (error) {
    if (error.message !== "Sesi admin berakhir.") {
      setGlobalMessage(
        "Data belum tersedia",
        error.status === 503
          ? "Database belum dikonfigurasi atau tidak dapat diakses. Ikuti panduan konfigurasi sebelum rilis."
          : (error.message || "Tidak dapat memuat data dari API panel."),
        "error"
      );
    }
  } finally {
    if (refreshButton) refreshButton.disabled = false;
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const key = accessKeyInput.value;
  if (!key) return;
  loginButton.disabled = true;
  loginButton.querySelector("span").textContent = "Memeriksa...";
  loginMessage.textContent = "";
  try {
    const { response, result } = await requestAuth("login", key);
    if (response.ok && result.ok) {
      showDashboard();
    } else if (response.status === 401) {
      showLogin("Access key tidak valid.");
      accessKeyInput.focus();
    } else if (response.status === 429) {
      showLogin(result.error || "Terlalu banyak percobaan. Coba lagi nanti.");
    } else {
      showLogin(result.error || "Autentikasi gagal. Coba lagi.");
    }
  } catch {
    showLogin("Tidak dapat terhubung ke layanan autentikasi.");
  } finally {
    loginButton.disabled = false;
    loginButton.querySelector("span").textContent = "Masuk";
  }
});

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  try { await requestAuth("logout"); } catch { /* The UI still returns to login. */ }
  showLogin("Sesi admin telah ditutup.");
  logoutButton.disabled = false;
  accessKeyInput.focus();
});

refreshButton.addEventListener("click", loadDashboard);
document.getElementById("activity-source-filter").addEventListener("change", loadDashboard);
document.getElementById("account-source-filter").addEventListener("change", loadDashboard);
document.getElementById("report-filter-form").addEventListener("submit", event => {
  event.preventDefault();
  loadDashboard();
});
document.getElementById("feedback-filter-form").addEventListener("submit", event => {
  event.preventDefault();
  loadDashboard();
});

async function restoreSession() {
  try {
    const { response, result } = await requestAuth("verify");
    if (response.ok && result.authenticated) {
      loginView.hidden = true;
      dashboardView.hidden = false;
      loadDashboard();
    }
  } catch {
    // Keep the login screen visible if the function is not available.
  }
}

restoreSession();
