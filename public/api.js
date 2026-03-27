// api.js
// QueueSmart Frontend — API Client
// Replaces localStorage-based logic in script.js with real fetch() calls to the Express backend.
// Drop this file in the same folder as your HTML pages and replace:
//   <script src="script.js"></script>
// with:
//   <script src="api.js"></script>

const API_BASE = 'http://localhost:3000/api';
const CURRENT_USER_KEY = 'currentUser';

// ── In-memory cache (populated from backend on loadData) ─────────────────────
var currentUser = null;
var allUsers    = [];
var services    = [];
var queues      = {};

// ═══════════════════════════════════════════════════════════════════════════════
// DATA BOOTSTRAP — called once per page load (mirrors script.js loadData())
// ═══════════════════════════════════════════════════════════════════════════════
async function loadData() {
  try {
    console.log("🔄 Loading services from backend...");

    const res = await fetch(`${API_BASE}/services`);
    const data = await res.json();

    if (data.success) {
      services = data.services || [];
      console.log(`✅ Loaded ${services.length} services from backend`);
    } else {
      console.error("Backend returned error:", data.errors);
    }
  } catch (e) {
    console.error("❌ Failed to load services from backend", e);
    showToast("Cannot connect to backend. Is the server running?", "error");
  }
}
// ═══════════════════════════════════════════════════════════════════════════════
// UI HELPERS (identical to script.js — no changes needed in HTML)
// ═══════════════════════════════════════════════════════════════════════════════
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = 'notification-toast';
  if (type === 'error')        toast.style.backgroundColor = '#ef4444';
  else if (type === 'info')    toast.style.backgroundColor = '#3b82f6';
  else                         toast.style.backgroundColor = '#10b981';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'all 0.3s';
    toast.style.opacity    = '0';
    toast.style.transform  = 'translateY(-20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3800);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════════
function checkAuth(requiredRole = null) {
  currentUser = JSON.parse(localStorage.getItem(CURRENT_USER_KEY));
  if (!currentUser) { window.location.href = 'index.html'; return null; }
  if (requiredRole && currentUser.role !== requiredRole) {
    showToast('Access denied. Administrators only.', 'error');
    window.location.href = 'dashboard.html';
    return null;
  }
  return currentUser;
}

function logout() {
  localStorage.removeItem(CURRENT_USER_KEY);
  showToast('You have been logged out', 'info');
  window.location.href = 'index.html';
}

// Called by index.html login form submit handler
async function handleLoginAPI(email, password) {
  const res  = await fetch(`${API_BASE}/auth/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (data.success) {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(data.user));
  }
  return data;   // { success, user, errors }
}

// Called by signup.html form submit handler
async function handleSignupAPI(email, password, role) {
  const res  = await fetch(`${API_BASE}/auth/register`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password, role })
  });
  const data = await res.json();
  if (data.success) {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(data.user));
  }
  return data;
}

// Legacy wrappers so existing HTML event-listeners still work unchanged
async function handleLogin(e) {
  e.preventDefault();
  const email    = document.getElementById('email').value.trim().toLowerCase();
  const password = document.getElementById('password').value;
  if (!email || !password) { showToast('Please fill all fields', 'error'); return; }
  if (!isValidEmail(email)) { showToast('Invalid email format', 'error'); return; }

  const data = await handleLoginAPI(email, password);
  if (data.success) {
    showToast(`Welcome back!`, 'success');
    window.location.href = data.user.role === 'admin' ? 'admin-dashboard.html' : 'dashboard.html';
  } else {
    showToast(data.errors?.[0] || 'Login failed', 'error');
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const email    = document.getElementById('email').value.trim().toLowerCase();
  const password = document.getElementById('password').value;
  const confirm  = document.getElementById('confirm-password').value;
  const isAdmin  = document.getElementById('is-admin').checked;

  if (!email || !password || !confirm) { showToast('Please fill all fields', 'error'); return; }
  if (!isValidEmail(email))            { showToast('Invalid email format', 'error');   return; }
  if (password.length < 6)             { showToast('Password must be at least 6 characters', 'error'); return; }
  if (password !== confirm)            { showToast('Passwords do not match', 'error'); return; }

  const data = await handleSignupAPI(email, password, isAdmin ? 'admin' : 'user');
  if (data.success) {
    showToast('Account created!', 'success');
    window.location.href = data.user.role === 'admin' ? 'admin-dashboard.html' : 'dashboard.html';
  } else {
    showToast(data.errors?.[0] || 'Registration failed', 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUEUE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
function getQueue(serviceId) {
  return queues[serviceId] || [];
}

async function addToQueue(serviceId, userEmail) {
  const res  = await fetch(`${API_BASE}/queue/${serviceId}/join`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email: userEmail })
  });
  const data = await res.json();
  if (data.success) {
    showToast(data.message, 'success');
    // Refresh local queue cache
    await refreshQueue(serviceId);
  } else {
    showToast(data.errors?.[0] || 'Could not join queue', 'error');
  }
  return data.success;
}

async function leaveQueue(serviceId, userEmail) {
  const res  = await fetch(`${API_BASE}/queue/${serviceId}/leave`, {
    method:  'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email: userEmail })
  });
  const data = await res.json();
  if (data.success) {
    showToast('You left the queue', 'info');
    await refreshQueue(serviceId);
  } else {
    showToast(data.errors?.[0] || 'Could not leave queue', 'error');
  }
}

async function serveNext(serviceId) {
  const res  = await fetch(`${API_BASE}/queue/${serviceId}/serve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  const data = await res.json();
  if (data.success) {
    showToast(data.message, 'success');
    await refreshQueue(serviceId);
  } else {
    showToast(data.errors?.[0] || 'Queue is empty', 'error');
  }
}

async function changePriority(serviceId, userEmail, newPriority) {
  const res  = await fetch(`${API_BASE}/queue/${serviceId}/priority`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email: userEmail, priority: newPriority })
  });
  const data = await res.json();
  if (data.success) showToast(`Priority updated to ${newPriority}`, 'success');
  else showToast(data.errors?.[0] || 'Could not update priority', 'error');
}

async function reorderQueue(serviceId, fromIdx, toIdx) {
  try {
    const res = await fetch(`${API_BASE}/queue/${serviceId}/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        fromIndex: fromIdx, 
        toIndex: toIdx 
      })
    });

    const data = await res.json();

    if (data.success) {
      queues[serviceId] = data.queue || [];  
    }

    return data;
  } catch (err) {
    console.error("Reorder API error:", err);
    return { success: false, errors: ["Network error during reorder"] };
  }
}


async function handleReorder(serviceId, fromIdx, toIdx) {
    if (fromIdx === toIdx) return;

    console.log(`Reordering service ${serviceId}: position ${fromIdx + 1} → ${toIdx + 1}`);

    const result = await reorderQueue(serviceId, fromIdx, toIdx);

    if (result && result.success) 
      {
        await refreshQueue(serviceId);
        location.reload(); // Force full page reload to reflect changes

        console.log(' Reorder completed and queue refreshed for service ${serviceId}');
    }
     else {
        console.error("Reorder failed:", result?.errors);
        // showToast(result?.errors?.[0] || "Failed to reorder", "error");
    }

    return result && result.success;
}

// Make sure it's globally available
window.handleReorder = handleReorder;

function calculateWait(serviceId, position) {
  const service = services.find(s => s.id === serviceId);
  return position * (service ? service.expectedDuration : 30);
}

// Refresh local cache for one queue from the backend
async function refreshQueue(serviceId) {
  try {
    const res  = await fetch(`${API_BASE}/queue/${serviceId}`);
    const data = await res.json();
    if (data.success) queues[serviceId] = data.queue;
  } catch (e) { /* offline */ }
}

// Refresh all queues
async function refreshAllQueues() {
  for (const s of services) {
    await refreshQueue(s.id);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICES (used by admin-services.html)
// ═══════════════════════════════════════════════════════════════════════════════
async function createService(name, description, expectedDuration, priority) {
  const res  = await fetch(`${API_BASE}/services`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name, description, expectedDuration, priority })
  });
  const data = await res.json();
  if (data.success) {
    services.push(data.service);
    queues[data.service.id] = [];
    showToast('Service created', 'success');
  } else {
    showToast(data.errors?.[0] || 'Failed to create service', 'error');
  }
  return data;
}

async function updateService(id, patch) {
  const res  = await fetch(`${API_BASE}/services/${id}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(patch)
  });
  const data = await res.json();
  if (data.success) {
    const idx = services.findIndex(s => s.id === id);
    if (idx !== -1) services[idx] = data.service;
    showToast('Service updated', 'success');
  } else {
    showToast(data.errors?.[0] || 'Failed to update service', 'error');
  }
  return data;
}

async function deleteService(id) {
  if (!confirm('Delete this service and its queue?')) return;
  const res  = await fetch(`${API_BASE}/services/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (data.success) {
    services = services.filter(s => s.id !== id);
    delete queues[id];
    showToast('Service deleted', 'success');
  } else {
    showToast(data.errors?.[0] || 'Failed to delete service', 'error');
  }
  return data;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════
async function getUserNotifications(userEmail, limit = 5) {
  try {
    const res  = await fetch(`${API_BASE}/notifications/${encodeURIComponent(userEmail)}?limit=${limit}`);
    const data = await res.json();
    return data.success ? data.notifications : [];
  } catch { return []; }
}

async function markNotificationRead(notificationId) {
  try {
    await fetch(`${API_BASE}/notifications/${notificationId}/read`, { method: 'PATCH' });
  } catch { /* ignore */ }
}

async function clearNotifications(userEmail) {
  try {
    await fetch(`${API_BASE}/notifications/${encodeURIComponent(userEmail)}`, { method: 'DELETE' });
  } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════════════════════════════════════════════
async function getUserHistory(userEmail, filter = {}) {
  const params = new URLSearchParams();
  if (filter.status)    params.append('status',    filter.status);
  if (filter.serviceId) params.append('serviceId', filter.serviceId);
  if (filter.startDate) params.append('startDate', filter.startDate);
  if (filter.endDate)   params.append('endDate',   filter.endDate);
  if (filter.all !== undefined) params.append('all', filter.all);

  try {
    const res  = await fetch(`${API_BASE}/history/${encodeURIComponent(userEmail)}?${params}`);
    const data = await res.json();
    return data.success ? data.history : [];
  } catch { return []; }
}

async function getHistoryStats(userEmail) {
  try {
    const res  = await fetch(`${API_BASE}/history/${encodeURIComponent(userEmail)}/stats`);
    const data = await res.json();
    return data.success ? data.stats : {};
  } catch { return {}; }
}

async function clearUserHistory(userEmail) {
  try {
    const res  = await fetch(`${API_BASE}/history/${encodeURIComponent(userEmail)}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) showToast('History cleared', 'success');
    return data.success;
  } catch { return false; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// INIT — runs on every page load
// ═══════════════════════════════════════════════════════════════════════════════
(async function init() {
  await loadData();
  await refreshAllQueues();

  console.log("✅ App initialized - services and queues loaded");
})();
