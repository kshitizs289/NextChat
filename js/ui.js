// ============================================================
//  ui.js — Shared UI utilities (used by both auth & chat pages)
// ============================================================

// ── Avatar ──────────────────────────────────────────────────
const AVATAR_COLORS = [
  ['#6366F1', '#8B5CF6'], // indigo → violet
  ['#06B6D4', '#6366F1'], // cyan → indigo
  ['#EC4899', '#8B5CF6'], // pink → violet
  ['#F59E0B', '#EF4444'], // amber → red
  ['#10B981', '#06B6D4'], // emerald → cyan
  ['#8B5CF6', '#EC4899'], // violet → pink
  ['#EF4444', '#F59E0B'], // red → amber
  ['#14B8A6', '#6366F1'], // teal → indigo
];

function getAvatarColors(uid) {
  if (!uid) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Apply avatar styles to an element
 * @param {HTMLElement} el
 * @param {string} uid
 * @param {string} name
 */
function applyAvatar(el, uid, name) {
  const [c1, c2] = getAvatarColors(uid);
  el.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
  el.textContent = getInitials(name);
  el.style.color = 'white';
  el.style.textShadow = '0 1px 2px rgba(0,0,0,0.3)';
}

// ── Toast ────────────────────────────────────────────────────
window.showToast = function (message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = {
    success: '✓',
    error:   '✕',
    info:    'ℹ',
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span style="font-size:15px;flex-shrink:0;">${icons[type] || icons.info}</span>
    <span>${escapeHtml(message)}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
};

// ── HTML escape ──────────────────────────────────────────────
window.escapeHtml = function (str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

// ── Format message text ──────────────────────────────────────
window.formatMessageText = function (text) {
  if (!text) return '';
  let t = escapeHtml(text);
  // Bold: **text**
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic: *text*
  t = t.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Inline code: `code`
  t = t.replace(/`(.+?)`/g, '<code>$1</code>');
  // URLs
  t = t.replace(/(https?:\/\/[^\s<>"]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  // Line breaks
  t = t.replace(/\n/g, '<br/>');
  return t;
};

// ── Modal helpers ────────────────────────────────────────────
window.openModal = function (id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
};

window.closeModal = function (id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
};

// Close modal on overlay click
document.addEventListener('click', function (e) {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('active');
  }
});

// ── Toggle password visibility ───────────────────────────────
window.togglePwd = function (inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.innerHTML = show
    ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
    : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
};

// ── Password strength ────────────────────────────────────────
window.checkStrength = function (pwd) {
  const bars = ['s1', 's2', 's3', 's4'].map(id => document.getElementById(id));
  if (!bars[0]) return;

  const classes = ['weak', 'fair', 'good', 'strong'];
  let score = 0;
  if (pwd.length >= 6)  score++;
  if (pwd.length >= 10) score++;
  if (/[A-Z]/.test(pwd) && /[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;

  bars.forEach((b, i) => {
    b.className = 'strength-bar';
    if (i < score) b.classList.add(classes[Math.min(score - 1, 3)]);
  });
};

// ── Tab switching (auth page) ────────────────────────────────
window.switchTab = function (tab) {
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('form-login').classList.toggle('active', tab === 'login');
  document.getElementById('form-register').classList.toggle('active', tab === 'register');
};

// ── Sidebar section toggle ───────────────────────────────────
window.toggleSection = function (listId) {
  const el = document.getElementById(listId);
  if (el) {
    el.style.display = el.style.display === 'none' ? '' : '';
    // (keep expanded for now — just toggle chevron state visually)
  }
};

// ── Format timestamps ────────────────────────────────────────
window.formatTime = function (ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const h = d.getHours() % 12 || 12;
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = d.getHours() < 12 ? 'AM' : 'PM';
  return isToday ? `${h}:${m} ${ampm}` : `${d.getMonth()+1}/${d.getDate()} ${h}:${m} ${ampm}`;
};

window.formatDateLabel = function (ts) {
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isToday) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
};

// ── Debounce ─────────────────────────────────────────────────
window.debounce = function (fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
};

// ── Auto-resize textarea ─────────────────────────────────────
window.autoResize = function (textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
};

// ── Expose applyAvatar globally ──────────────────────────────
window.applyAvatar = applyAvatar;
window.getAvatarColors = getAvatarColors;
window.getInitials = getInitials;
