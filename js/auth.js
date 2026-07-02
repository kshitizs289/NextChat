// ============================================================
//  auth.js — Login & Registration (Supabase)
// ============================================================

// ── Redirect if already signed in ───────────────────────────
sb.auth.onAuthStateChange((event, session) => {
  if (session) window.location.href = 'chat.html';
});

// ── Login ─────────────────────────────────────────────────────
window.handleLogin = async function (e) {
  e.preventDefault();
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn      = document.getElementById('login-btn');

  clearErrors();
  setLoading(btn, true);

  const { error } = await sb.auth.signInWithPassword({ email, password });

  if (error) {
    setLoading(btn, false);
    handleAuthError(error, 'login');
  }
  // onAuthStateChange handles redirect on success
};

// ── Register ──────────────────────────────────────────────────
window.handleRegister = async function (e) {
  e.preventDefault();
  const name     = document.getElementById('reg-name').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const btn      = document.getElementById('register-btn');

  clearErrors();
  if (name.length < 2) { showError('reg-email-err', 'Name must be at least 2 characters'); return; }

  setLoading(btn, true);

  const { error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: name },
      emailRedirectTo: window.location.origin + '/chat.html',
    },
  });

  if (error) {
    setLoading(btn, false);
    handleAuthError(error, 'register');
  } else {
    showToast('Account created! Signing you in… 🎉', 'success');
    // onAuthStateChange will redirect automatically
  }
};

// ── Error map ─────────────────────────────────────────────────
function handleAuthError(err, form) {
  const msg = err.message || '';
  const map = [
    { match: /invalid.*credential|invalid.*password|invalid.*email/i, field: form === 'login' ? 'login-pwd-err' : 'reg-pwd-err', text: 'Invalid email or password.' },
    { match: /user.*not.*found|no.*user/i,                            field: form === 'login' ? 'login-email-err' : 'reg-email-err', text: 'No account found with this email.' },
    { match: /already.*registered|email.*taken|user.*exists/i,       field: 'reg-email-err', text: 'This email is already registered.' },
    { match: /password.*short|at least.*character/i,                  field: 'reg-pwd-err', text: 'Password must be at least 6 characters.' },
    { match: /invalid.*email/i,                                        field: form === 'login' ? 'login-email-err' : 'reg-email-err', text: 'Invalid email address.' },
    { match: /rate.*limit|too.*many.*request/i,                       field: form === 'login' ? 'login-pwd-err' : 'reg-pwd-err', text: 'Too many attempts. Wait a moment and try again.' },
    { match: /email.*confirm/i,                                        field: 'reg-email-err', text: 'Please check your email to confirm your account, then sign in.' },
  ];

  const entry = map.find(m => m.match.test(msg));
  if (entry) {
    showError(entry.field, entry.text);
  } else {
    showToast(msg || 'Something went wrong. Please try again.', 'error');
  }
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.classList.add('visible'); }
}

function clearErrors() {
  document.querySelectorAll('.input-error').forEach(el => {
    el.textContent = '';
    el.classList.remove('visible');
  });
}

function setLoading(btn, loading) {
  btn.disabled = loading;
  btn.classList.toggle('loading', loading);
}
