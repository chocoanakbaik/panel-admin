const loginView = document.getElementById("login-view");
const dashboardView = document.getElementById("dashboard-view");
const loginForm = document.getElementById("login-form");
const accessKeyInput = document.getElementById("access-key");
const loginButton = document.getElementById("login-button");
const loginMessage = document.getElementById("login-message");
const logoutButton = document.getElementById("logout-button");

async function requestAuth(action, key) {
  const response = await fetch("/.netlify/functions/admin-auth", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, key })
  });
  let result = {};
  try { result = await response.json(); } catch { /* Ignore non-JSON responses. */ }
  return { response, result };
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
  accessKeyInput.value = "";
}

function showLogin(message = "") {
  dashboardView.hidden = true;
  loginView.hidden = false;
  loginMessage.textContent = message;
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

async function restoreSession() {
  try {
    const { response, result } = await requestAuth("verify");
    if (response.ok && result.authenticated) showDashboard();
  } catch {
    // If the function is not deployed yet, leave the login screen visible.
  }
}

restoreSession();