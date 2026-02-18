// script.js - Shared logic for the entire QueueSmart Tutor frontend

const CURRENT_USER_KEY = 'currentUser';
const USERS_KEY = 'users';
const SERVICES_KEY = 'services';
const QUEUES_KEY = 'queues';
const QUEUE_HISTORY_KEY = "queueHistory";   // user-history

var currentUser = null;
var allUsers = [];
var services = [];
var queues = {};

// ====================== DATA MANAGEMENT ======================
function loadData() {
  allUsers = JSON.parse(localStorage.getItem(USERS_KEY)) || [
    { email: "student@tutor.com", password: "student123", role: "user" },
    { email: "admin@tutor.com", password: "admin123", role: "admin" }
  ];

  services = JSON.parse(localStorage.getItem(SERVICES_KEY)) || [
    { id: 1, name: "Algebra Tutoring", description: "One-on-one help with algebra", expectedDuration: 45, priority: "medium" },
    { id: 2, name: "Essay Review", description: "Detailed feedback on essays", expectedDuration: 30, priority: "low" },
    { id: 3, name: "Calculus Help", description: "Calculus 1 & 2 support", expectedDuration: 60, priority: "high" }
  ];

  queues = JSON.parse(localStorage.getItem(QUEUES_KEY)) || {};
  services.forEach(s => { if (!queues[s.id]) queues[s.id] = []; });

  // Initialize history if it doesn't exist
  if (!localStorage.getItem(QUEUE_HISTORY_KEY)) {               
    localStorage.setItem(QUEUE_HISTORY_KEY, JSON.stringify([])); 
  }

  saveData();
}

function recordQueueCompletion(serviceID, userEmail, joinedAt, status = 'completed')
{
  // Get existing history form localStorage or create empty array
  const history = JSON.parse(localStorage.getItem(QUEUE_HISTORY_KEY)) || [];
  
  // Find the service details to story with the history entry
  const service = services.find(s => s.id === serviceId);

  // Create a comprehensive history entry with all relevant data
  const entry = {
    // Unique ID using timestap + random number to avoid collisions
    id: Date.now() + Math.random(),
    serviceId: serviceId,
    serviceName: service ? service.name : 'Unknown Service',
    userEmail: userEmail,
    joinedAt: joinedAt,
    completedAt: new Date().toISOString(),
    status: status, // 'completed', 'left', 'served'
    // Calculate wait time in minutes
    waitTimeMinutes: Math.floor((Date.now() - new Date(joinedAt)) / 60000)
  };

  // Add new entry to history array
  history.push(entry);
  
  //Save updated history back to localStorage
  localStorage.setItem(QUEUE_HISTORY_KEY, JSON.stringify(history));

  return entry;   // for debugging purposes
}

function saveData() {
  localStorage.setItem(USERS_KEY, JSON.stringify(allUsers));
  localStorage.setItem(SERVICES_KEY, JSON.stringify(services));
  localStorage.setItem(QUEUES_KEY, JSON.stringify(queues));
}

// ====================== UI HELPERS ======================
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = 'notification-toast';
  if (type === 'error') toast.style.backgroundColor = '#ef4444';
  else if (type === 'info') toast.style.backgroundColor = '#3b82f6';
  else toast.style.backgroundColor = '#10b981';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'all 0.3s';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3800);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ====================== AUTH ======================
function checkAuth(requiredRole = null) {
  currentUser = JSON.parse(localStorage.getItem(CURRENT_USER_KEY));
  if (!currentUser) {
    window.location.href = 'index.html';
    return null;
  }
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

// ====================== LOGIN / SIGNUP ======================
function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('email').value.trim().toLowerCase();
  const password = document.getElementById('password').value;

  if (!email || !password) {
    showToast('Please fill all fields', 'error');
    return;
  }
  if (!isValidEmail(email)) {
    showToast('Invalid email format', 'error');
    return;
  }

  const user = allUsers.find(u => u.email === email && u.password === password);
  if (user) {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify({ email: user.email, role: user.role }));
    showToast(`Welcome back, ${user.role === 'admin' ? 'Administrator' : 'Student'}!`, 'success');
    
    if (user.role === 'admin') window.location.href = 'admin-dashboard.html';
    else window.location.href = 'dashboard.html';
  } else {
    showToast('Invalid email or password', 'error');
  }
}

function handleSignup(e) {
  e.preventDefault();
  const email = document.getElementById('email').value.trim().toLowerCase();
  const password = document.getElementById('password').value;
  const confirm = document.getElementById('confirm-password').value;
  const isAdmin = document.getElementById('is-admin').checked;

  if (!email || !password || !confirm) {
    showToast('Please fill all fields', 'error');
    return;
  }
  if (!isValidEmail(email)) {
    showToast('Invalid email format', 'error');
    return;
  }
  if (password.length < 8) {
    showToast('Password must be at least 8 characters', 'error');
    return;
  }
  if (password !== confirm) {
    showToast('Passwords do not match', 'error');
    return;
  }
  if (allUsers.some(u => u.email === email)) {
    showToast('Email already registered', 'error');
    return;
  }

  const role = isAdmin ? 'admin' : 'user';
  allUsers.push({ email, password, role });
  saveData();

  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify({ email, role }));
  showToast('Account created successfully!', 'success');

  if (role === 'admin') window.location.href = 'admin-dashboard.html';
  else window.location.href = 'dashboard.html';
}

// ====================== QUEUE HELPERS ======================
function getQueue(serviceId) {
  return queues[serviceId] || [];
}

function addToQueue(serviceId, userEmail) {
  if (!queues[serviceId]) queues[serviceId] = [];
  if (queues[serviceId].some(q => q.email === userEmail)) {
    showToast('You are already in this queue', 'error');
    return false;
  }

  const entry = {
    email: userEmail,
    joinedAt: new Date().toISOString(),
    priority: 'medium'
  };
  queues[serviceId].push(entry);
  saveData();

  const service = services.find(s => s.id === serviceId);
  showToast(`Joined ${service.name}! Position: ${queues[serviceId].length}`, 'success');
  return true;
}

function leaveQueue(serviceId, userEmail) {
  if (!queues[serviceId]) return;
  queues[serviceId] = queues[serviceId].filter(q => q.email !== userEmail);
  saveData();
  showToast('You left the queue', 'info');
}

function serveNext(serviceId) {
  if (!queues[serviceId] || queues[serviceId].length === 0) {
    showToast('Queue is empty', 'error');
    return;
  }
  const served = queues[serviceId].shift();
  const service = services.find(s => s.id === serviceId);
  const waitMin = Math.floor((Date.now() - new Date(served.joinedAt)) / 60000);

  saveData();
  showToast(`Served ${served.email} – ${service.name}`, 'success');
}

function changePriority(serviceId, userEmail, newPriority) {
  const q = queues[serviceId];
  if (!q) return;
  const entry = q.find(item => item.email === userEmail);
  if (entry) {
    entry.priority = newPriority;
    saveData();
    showToast(`Priority changed to ${newPriority}`, 'success');
  }
}

function reorderQueue(serviceId, fromIdx, toIdx) {
  const q = queues[serviceId];
  if (!q) return;
  const [moved] = q.splice(fromIdx, 1);
  q.splice(toIdx, 0, moved);
  saveData();
}

function calculateWait(serviceId, position) { // position starts at 1
  const service = services.find(s => s.id === serviceId);
  return position * (service ? service.expectedDuration : 30);
}

// ====================== INIT ======================
loadData();   // always load on every page

// Auto-redirect if already logged in on auth pages
if (window.location.pathname.includes('index.html') || window.location.pathname.includes('signup.html')) {
  const user = JSON.parse(localStorage.getItem(CURRENT_USER_KEY));
  if (user) {
    if (user.role === 'admin') window.location.href = 'admin-dashboard.html';
    else window.location.href = 'dashboard.html';
  }
}