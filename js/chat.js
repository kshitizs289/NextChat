// ============================================================
//  chat.js — Full real-time chat engine (Supabase backend)
//  Features: channels, DMs, messages, typing, presence, UI
// ============================================================

'use strict';

// ── App State ─────────────────────────────────────────────────
const App = {
  user:             null,   // Supabase auth user
  profile:          null,   // profiles table row
  currentRoomId:    null,
  currentRoomType:  null,   // 'channel' | 'dm'
  channels:         [],
  dms:              [],
  allProfiles:      {},     // id → profile
  onlineUsers:      new Set(),
  msgChannel:       null,   // active Supabase realtime channel (messages)
  typingChannel:    null,   // active Supabase realtime channel (typing)
  presenceChannel:  null,   // global presence channel
  typingTimer:      null,
  typingUsers:      {},     // name → timeout
  unreadCounts:     {},
  scrolledToBottom: true,
  newMsgCount:      0,
  membersPanelOpen: false,
};

// ── Emoji data ────────────────────────────────────────────────
const EMOJIS = [
  '😀','😂','😍','🥰','😎','🤔','😢','😡',
  '👍','👎','👏','🙏','🤝','✌️','💪','🤣',
  '🎉','🔥','💯','⭐','❤️','💙','💜','💚',
  '🚀','✨','🎵','🎮','🍕','☕','🌟','💡',
  '😊','🤩','😇','😏','🙄','😴','🤯','🥳',
  '👀','💬','📣','🔔','🎯','💎','🌈','🦋',
];

// ── Bootstrap ─────────────────────────────────────────────────
sb.auth.onAuthStateChange(async (event, session) => {
  if (!session) {
    window.location.href = 'index.html';
    return;
  }

  if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
    App.user = session.user;
    await loadProfile();
    renderMyProfile();
    setupPresence();
    buildEmojiGrid();
    setupScrollListener();
    setupAwayDetection();

    await Promise.all([
      subscribeChannels(),
      loadAllProfiles(),
    ]);

    await loadDMs();

    document.getElementById('app-loading').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');

    // Auto-select #general
    const general = App.channels.find(c => c.id === 'general');
    if (general) openChannel('general', 'channel');
  }
});

// ── Profile ───────────────────────────────────────────────────
async function loadProfile() {
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', App.user.id)
    .single();

  if (error || !data) {
    // Create profile if trigger hasn't fired yet
    const displayName = App.user.user_metadata?.display_name
      || App.user.email.split('@')[0];
    const { data: created } = await sb
      .from('profiles')
      .upsert({ id: App.user.id, display_name: displayName, email: App.user.email })
      .select()
      .single();
    App.profile = created || { id: App.user.id, display_name: displayName, email: App.user.email };
  } else {
    App.profile = data;
  }

  App.allProfiles[App.user.id] = App.profile;
}

function renderMyProfile() {
  const avatar = document.getElementById('my-avatar');
  const name   = document.getElementById('my-name');
  if (avatar) applyAvatar(avatar, App.user.id, App.profile.display_name);
  if (name)   name.textContent = App.profile.display_name;
}

// ── Load all profiles ─────────────────────────────────────────
async function loadAllProfiles() {
  const { data } = await sb.from('profiles').select('*');
  (data || []).forEach(p => { App.allProfiles[p.id] = p; });

  // Subscribe to profile changes
  sb.channel('profile-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, ({ new: row }) => {
      if (row) App.allProfiles[row.id] = { ...App.allProfiles[row.id], ...row };
      renderDMsList();
      if (App.membersPanelOpen) renderMembersPanel();
    })
    .subscribe();
}

// ── Presence ──────────────────────────────────────────────────
function setupPresence() {
  App.presenceChannel = sb.channel('global-presence', {
    config: { presence: { key: App.user.id } },
  });

  App.presenceChannel
    .on('presence', { event: 'sync' }, () => {
      const state = App.presenceChannel.presenceState();
      App.onlineUsers.clear();
      Object.values(state).flat().forEach(entry => {
        if (entry.user_id) App.onlineUsers.add(entry.user_id);
      });
      renderChannelsList();
      renderDMsList();
      if (App.membersPanelOpen) renderMembersPanel();
    })
    .on('presence', { event: 'join' }, ({ key }) => {
      App.onlineUsers.add(key);
      renderMembersPanel();
    })
    .on('presence', { event: 'leave' }, ({ key }) => {
      App.onlineUsers.delete(key);
      renderMembersPanel();
    })
    .subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        await App.presenceChannel.track({
          user_id:      App.user.id,
          display_name: App.profile.display_name,
          online_at:    new Date().toISOString(),
        });
      }
    });
}

// ── Subscribe channels ────────────────────────────────────────
async function subscribeChannels() {
  const { data } = await sb.from('channels').select('*').order('name');
  App.channels = data || [];
  renderChannelsList();

  sb.channel('channel-changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'channels' }, ({ new: ch }) => {
      if (ch && !App.channels.find(c => c.id === ch.id)) {
        App.channels.push(ch);
        App.channels.sort((a, b) => a.name.localeCompare(b.name));
        renderChannelsList();
      }
    })
    .subscribe();
}

function renderChannelsList() {
  const list = document.getElementById('channels-list');
  if (!list) return;
  list.innerHTML = App.channels.map(ch => {
    const unread = App.unreadCounts[ch.id] || 0;
    const active = App.currentRoomId === ch.id ? 'active' : '';
    return `<div class="nav-item ${active}" id="nav-ch-${ch.id}" onclick="openChannel('${ch.id}','channel')">
      <span class="nav-item-icon">#</span>
      <span class="nav-item-name truncate">${escapeHtml(ch.name)}</span>
      ${unread ? `<span class="nav-item-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
    </div>`;
  }).join('');
}

// ── Load DMs ──────────────────────────────────────────────────
async function loadDMs() {
  const uid = App.user.id;
  const { data } = await sb
    .from('dms')
    .select('*')
    .or(`member1_id.eq.${uid},member2_id.eq.${uid}`)
    .order('last_at', { ascending: false });

  App.dms = data || [];
  renderDMsList();

  // Subscribe to new DMs involving me
  sb.channel('dm-changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dms' }, ({ new: dm }) => {
      if (dm && (dm.member1_id === uid || dm.member2_id === uid)) {
        if (!App.dms.find(d => d.id === dm.id)) App.dms.unshift(dm);
        renderDMsList();
      }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'dms' }, ({ new: dm }) => {
      if (dm) {
        const idx = App.dms.findIndex(d => d.id === dm.id);
        if (idx !== -1) App.dms[idx] = dm;
        else App.dms.unshift(dm);
        renderDMsList();
      }
    })
    .subscribe();
}

function renderDMsList() {
  const list = document.getElementById('dms-list');
  if (!list) return;
  if (!App.dms.length) {
    list.innerHTML = `<div style="padding:4px 16px 8px;font-size:12px;color:var(--text-muted);font-style:italic;">No DMs yet</div>`;
    return;
  }

  list.innerHTML = App.dms.map(dm => {
    const otherId  = dm.member1_id === App.user.id ? dm.member2_id : dm.member1_id;
    const other    = App.allProfiles[otherId] || { display_name: 'User', id: otherId };
    const isOnline = App.onlineUsers.has(otherId);
    const unread   = App.unreadCounts[dm.id] || 0;
    const active   = App.currentRoomId === dm.id ? 'active' : '';
    return `<div class="nav-item ${active}" id="nav-dm-${dm.id}" onclick="openChannel('${dm.id}','dm')">
      <div class="avatar-wrap" style="flex-shrink:0;">
        <div class="avatar avatar-sm" id="dm-nav-av-${dm.id}"></div>
        <div class="status-dot ${isOnline ? 'online' : 'offline'}"></div>
      </div>
      <span class="nav-item-name truncate">${escapeHtml(other.display_name)}</span>
      ${unread ? `<span class="nav-item-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
    </div>`;
  }).join('');

  App.dms.forEach(dm => {
    const otherId = dm.member1_id === App.user.id ? dm.member2_id : dm.member1_id;
    const other   = App.allProfiles[otherId];
    const el      = document.getElementById(`dm-nav-av-${dm.id}`);
    if (el && other) applyAvatar(el, other.id, other.display_name);
  });
}

// ── Open channel or DM ────────────────────────────────────────
window.openChannel = async function (roomId, type) {
  if (App.currentRoomId === roomId) return;

  // Unsubscribe previous
  if (App.msgChannel)    { await App.msgChannel.unsubscribe();    App.msgChannel = null; }
  if (App.typingChannel) { await App.typingChannel.unsubscribe(); App.typingChannel = null; }

  clearTypingIndicator();
  clearMyTyping();

  App.currentRoomId   = roomId;
  App.currentRoomType = type;
  App.newMsgCount     = 0;
  updateScrollBtn();

  // Update nav highlight
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById(`nav-ch-${roomId}`) || document.getElementById(`nav-dm-${roomId}`);
  if (navEl) navEl.classList.add('active');

  // Clear unread
  App.unreadCounts[roomId] = 0;
  renderChannelsList();
  renderDMsList();

  // Show chat view
  document.getElementById('no-channel-state').classList.add('hidden');
  const chatView = document.getElementById('chat-view');
  chatView.classList.remove('hidden');
  chatView.style.display = 'flex';

  updateChatHeader(roomId, type);
  updateInputPlaceholder(roomId, type);

  // Clear messages
  document.getElementById('messages-list').innerHTML = '';
  document.getElementById('messages-list').dataset.lastDate = '';
  document.getElementById('channel-welcome').innerHTML = '';
  renderChannelWelcome(roomId, type);

  // Load + subscribe messages
  await subscribeMessages(roomId, type);
  subscribeTyping(roomId);

  if (App.membersPanelOpen) renderMembersPanel();
  setTimeout(() => document.getElementById('msg-input')?.focus(), 100);
};

// ── Chat header ───────────────────────────────────────────────
function updateChatHeader(roomId, type) {
  const iconEl = document.getElementById('chat-header-icon');
  const nameEl = document.getElementById('chat-header-name');
  const descEl = document.getElementById('chat-header-desc');
  const cntEl  = document.getElementById('header-member-count');

  if (type === 'channel') {
    const ch = App.channels.find(c => c.id === roomId) || { name: roomId };
    if (iconEl) iconEl.textContent = '#';
    if (nameEl) nameEl.textContent = ch.name;
    if (descEl) { descEl.textContent = ch.description || ''; descEl.style.display = ch.description ? '' : 'none'; }
    if (cntEl)  { cntEl.style.display = ''; document.getElementById('member-count-text').textContent = Object.keys(App.allProfiles).length; }
    document.title = `#${ch.name} — NexChat`;
  } else {
    const dm      = App.dms.find(d => d.id === roomId);
    const otherId = dm?.member1_id === App.user.id ? dm?.member2_id : dm?.member1_id;
    const other   = App.allProfiles[otherId] || { display_name: 'User' };
    if (iconEl) iconEl.textContent = '';
    if (nameEl) nameEl.textContent = other.display_name;
    if (descEl) { descEl.textContent = other.email || ''; }
    if (cntEl)  cntEl.style.display = 'none';
    document.title = `${other.display_name} — NexChat`;
  }
}

function updateInputPlaceholder(roomId, type) {
  const input = document.getElementById('msg-input');
  if (!input) return;
  if (type === 'channel') {
    const ch = App.channels.find(c => c.id === roomId);
    input.placeholder = `Message #${ch?.name || roomId}`;
  } else {
    const dm      = App.dms.find(d => d.id === roomId);
    const otherId = dm?.member1_id === App.user.id ? dm?.member2_id : dm?.member1_id;
    const other   = App.allProfiles[otherId] || {};
    input.placeholder = `Message ${other.display_name || 'user'}`;
  }
}

// ── Channel welcome ───────────────────────────────────────────
function renderChannelWelcome(roomId, type) {
  const el = document.getElementById('channel-welcome');
  if (!el) return;
  if (type === 'channel') {
    const ch = App.channels.find(c => c.id === roomId) || { name: roomId, description: '' };
    el.innerHTML = `
      <div class="channel-welcome-icon" style="font-size:28px;">#</div>
      <h2>Welcome to #${escapeHtml(ch.name)}!</h2>
      <p style="color:var(--text-secondary);">${escapeHtml(ch.description || 'This is the beginning of the channel.')}</p>`;
  } else {
    const dm      = App.dms.find(d => d.id === roomId);
    const otherId = dm?.member1_id === App.user.id ? dm?.member2_id : dm?.member1_id;
    const other   = App.allProfiles[otherId] || { display_name: 'User', id: otherId };
    el.innerHTML = `
      <div class="avatar avatar-xl" id="welcome-dm-avatar" style="margin-bottom:12px;"></div>
      <h2>${escapeHtml(other.display_name)}</h2>
      <p style="color:var(--text-secondary);">This is the beginning of your direct message history with <strong>${escapeHtml(other.display_name)}</strong>.</p>`;
    const avEl = document.getElementById('welcome-dm-avatar');
    if (avEl) applyAvatar(avEl, other.id, other.display_name);
  }
}

// ── Messages subscription ─────────────────────────────────────
async function subscribeMessages(roomId, type) {
  // Load history
  const { data: msgs, error } = await sb
    .from('messages')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })
    .limit(150);

  if (!error && msgs) {
    msgs.forEach(m => appendMessage(m, false, false));
    scrollToBottom();
  }

  // Subscribe real-time
  App.msgChannel = sb.channel(`room-${roomId}`)
    .on('postgres_changes', {
      event:  'INSERT',
      schema: 'public',
      table:  'messages',
      filter: `room_id=eq.${roomId}`,
    }, ({ new: msg }) => {
      if (msg) {
        const isOwn = msg.sender_id === App.user.id;
        if (!App.scrolledToBottom && !isOwn) { App.newMsgCount++; updateScrollBtn(); }
        appendMessage(msg, true, true);
        if (App.scrolledToBottom) scrollToBottom();
      }
    })
    .on('postgres_changes', {
      event:  'DELETE',
      schema: 'public',
      table:  'messages',
      filter: `room_id=eq.${roomId}`,
    }, ({ old: msg }) => {
      if (msg?.id) {
        const el = document.querySelector(`[data-msg-id="${msg.id}"]`);
        if (el) el.remove();
      }
    })
    .subscribe();
}

// ── Render message ────────────────────────────────────────────
function appendMessage(msg, animated = true, checkContinued = true) {
  const list = document.getElementById('messages-list');
  if (!list) return;

  const isOwn   = msg.sender_id === App.user.id;
  const profile = App.allProfiles[msg.sender_id] || { display_name: msg.sender_name || 'User', id: msg.sender_id };

  // Date divider
  if (msg.created_at) {
    const dateKey = new Date(msg.created_at).toDateString();
    if (list.dataset.lastDate !== dateKey) {
      list.dataset.lastDate = dateKey;
      const div = document.createElement('div');
      div.className = 'date-divider';
      div.textContent = formatDateLabel({ toDate: () => new Date(msg.created_at) });
      list.appendChild(div);
    }
  }

  // System messages
  if (msg.msg_type === 'system') {
    const el = document.createElement('div');
    el.className = 'msg-system';
    el.textContent = msg.text;
    list.appendChild(el);
    return;
  }

  // Continuation check
  const lastGroup    = list.querySelector('.msg-group:last-of-type');
  const lastSender   = lastGroup?.dataset.sender;
  const lastTs       = lastGroup?.dataset.ts;
  const isSameMinute = lastTs && (new Date(msg.created_at) - new Date(lastTs)) < 5 * 60 * 1000;
  const isContinued  = checkContinued && lastSender === msg.sender_id && isSameMinute;

  const el = document.createElement('div');
  el.className = `msg-group${isContinued ? ' msg-continued' : ''}`;
  el.dataset.sender = msg.sender_id;
  el.dataset.msgId  = msg.id;
  el.dataset.ts     = msg.created_at;
  if (animated) el.style.animation = 'slideUp 0.2s ease forwards';

  const deleteBtn = isOwn
    ? `<button class="msg-action-btn" title="Delete" onclick="deleteMsg('${msg.id}')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
      </button>` : '';

  if (isContinued) {
    el.innerHTML = `
      <div style="width:36px;flex-shrink:0;display:flex;align-items:flex-start;justify-content:flex-end;padding-top:3px;">
        <span class="msg-continued-time">${formatTime({ toDate: () => new Date(msg.created_at) })}</span>
      </div>
      <div class="msg-body">
        <div class="msg-text">${formatMessageText(msg.text)}</div>
        <div class="msg-actions">
          <button class="msg-action-btn" title="React" onclick="showToast('Reactions coming soon! 🎉','info')">😊</button>
          ${deleteBtn}
        </div>
      </div>`;
  } else {
    const avId = `av-${msg.id}`;
    el.innerHTML = `
      <div class="avatar-wrap msg-avatar">
        <div class="avatar avatar-md" id="${avId}"></div>
      </div>
      <div class="msg-body">
        <div class="msg-header">
          <span class="msg-sender">${escapeHtml(profile.display_name || msg.sender_name || 'User')}</span>
          <span class="msg-time">${formatTime({ toDate: () => new Date(msg.created_at) })}</span>
        </div>
        <div class="msg-text">${formatMessageText(msg.text)}</div>
        <div class="msg-actions">
          <button class="msg-action-btn" title="React" onclick="showToast('Reactions coming soon! 🎉','info')">😊</button>
          ${deleteBtn}
        </div>
      </div>`;
    setTimeout(() => {
      const avEl = document.getElementById(avId);
      if (avEl) applyAvatar(avEl, profile.id, profile.display_name || 'U');
    }, 0);
  }

  list.appendChild(el);
}

// ── Send message ──────────────────────────────────────────────
window.sendMessage = async function () {
  const input   = document.getElementById('msg-input');
  const text    = input?.value.trim();
  if (!text || !App.currentRoomId) return;

  const sendBtn = document.getElementById('send-btn');
  sendBtn.disabled = true;
  input.value   = '';
  autoResize(input);
  clearMyTyping();

  const { error } = await sb.from('messages').insert({
    room_id:     App.currentRoomId,
    room_type:   App.currentRoomType,
    sender_id:   App.user.id,
    sender_name: App.profile.display_name,
    text,
    msg_type:    'text',
  });

  if (error) {
    showToast('Failed to send message', 'error');
    input.value = text;
    autoResize(input);
  } else {
    // Update DM last_at
    if (App.currentRoomType === 'dm') {
      sb.from('dms').update({ last_at: new Date().toISOString() }).eq('id', App.currentRoomId).then(() => {});
    }
  }

  sendBtn.disabled = false;
  input.focus();
};

// ── Delete message ────────────────────────────────────────────
window.deleteMsg = async function (msgId) {
  if (!msgId || !confirm('Delete this message?')) return;
  const { error } = await sb.from('messages').delete().eq('id', msgId).eq('sender_id', App.user.id);
  if (error) showToast('Could not delete message', 'error');
};

// ── Input handling ────────────────────────────────────────────
window.handleInputKeydown = function (e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
};

window.handleInputChange = function () {
  const input   = document.getElementById('msg-input');
  const sendBtn = document.getElementById('send-btn');
  autoResize(input);
  sendBtn.disabled = !input.value.trim();
  if (App.currentRoomId && input.value.trim()) broadcastTyping(true);
  else broadcastTyping(false);
};

window.formatText = function (style) {
  const input = document.getElementById('msg-input');
  if (!input) return;
  const s = input.selectionStart, e = input.selectionEnd;
  const sel = input.value.substring(s, e);
  const wraps = { bold: '**', italic: '*', code: '`' };
  const w = wraps[style]; if (!w) return;
  input.value = input.value.substring(0, s) + w + sel + w + input.value.substring(e);
  input.focus(); input.selectionStart = s + w.length; input.selectionEnd = e + w.length;
};

// ── Typing indicators ─────────────────────────────────────────
const broadcastTyping = debounce(async function (isTyping) {
  if (!App.typingChannel || !App.currentRoomId) return;
  clearTimeout(App.typingTimer);
  await App.typingChannel.send({
    type: 'broadcast',
    event: 'typing',
    payload: { userId: App.user.id, name: App.profile.display_name, isTyping },
  }).catch(() => {});
  if (isTyping) {
    App.typingTimer = setTimeout(() => broadcastTyping(false), 4000);
  }
}, 350);

function clearMyTyping() {
  clearTimeout(App.typingTimer);
  if (App.typingChannel) {
    App.typingChannel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: App.user.id, name: App.profile.display_name, isTyping: false },
    }).catch(() => {});
  }
}

function subscribeTyping(roomId) {
  App.typingChannel = sb.channel(`typing-${roomId}`, {
    config: { broadcast: { self: false } },
  });
  App.typingChannel
    .on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (!payload) return;
      const { userId, name, isTyping } = payload;
      if (userId === App.user.id) return;

      if (isTyping) {
        App.typingUsers[name] = true;
        clearTimeout(App.typingUsers[`_t_${name}`]);
        App.typingUsers[`_t_${name}`] = setTimeout(() => {
          delete App.typingUsers[name];
          renderTypingIndicator();
        }, 5000);
      } else {
        clearTimeout(App.typingUsers[`_t_${name}`]);
        delete App.typingUsers[name];
      }
      renderTypingIndicator();
    })
    .subscribe();
}

function renderTypingIndicator() {
  const names = Object.keys(App.typingUsers).filter(k => !k.startsWith('_t_'));
  const dots  = document.getElementById('typing-dots');
  const text  = document.getElementById('typing-text');
  if (!dots) return;

  if (!names.length) {
    dots.classList.add('hidden');
    text.textContent = '';
    return;
  }
  dots.classList.remove('hidden');
  if (names.length === 1)      text.textContent = `${names[0]} is typing…`;
  else if (names.length === 2) text.textContent = `${names[0]} and ${names[1]} are typing…`;
  else                         text.textContent = `${names.length} people are typing…`;
}

function clearTypingIndicator() {
  App.typingUsers = {};
  renderTypingIndicator();
}

// ── Scroll ────────────────────────────────────────────────────
function setupScrollListener() {
  const area = document.getElementById('messages-area');
  if (!area) return;
  area.addEventListener('scroll', () => {
    const atBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 80;
    App.scrolledToBottom = atBottom;
    if (atBottom) { App.newMsgCount = 0; }
    updateScrollBtn();
  }, { passive: true });
}

window.scrollToBottom = function (smooth = false) {
  const area = document.getElementById('messages-area');
  if (area) area.scrollTo({ top: area.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  App.newMsgCount = 0;
  updateScrollBtn();
};

function updateScrollBtn() {
  const btn = document.getElementById('scroll-btn');
  if (!btn) return;
  btn.classList.toggle('visible', !App.scrolledToBottom);
  let badge = btn.querySelector('.scroll-btn-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.className = 'scroll-btn-badge';
    btn.appendChild(badge);
  }
  badge.textContent = App.newMsgCount || '';
  badge.style.display = App.newMsgCount > 0 ? 'flex' : 'none';
}

// ── Emoji ─────────────────────────────────────────────────────
function buildEmojiGrid() {
  const grid = document.getElementById('emoji-grid');
  if (!grid) return;
  grid.innerHTML = EMOJIS.map(e =>
    `<div class="emoji-item" onclick="insertEmoji('${e}')">${e}</div>`
  ).join('');
}

window.toggleEmojiPicker = function (e) {
  e.stopPropagation();
  document.getElementById('emoji-picker').classList.toggle('open');
};
window.insertEmoji = function (emoji) {
  const input = document.getElementById('msg-input');
  if (!input) return;
  const pos = input.selectionStart || input.value.length;
  input.value = input.value.substring(0, pos) + emoji + input.value.substring(pos);
  input.focus();
  input.selectionStart = input.selectionEnd = pos + emoji.length;
  document.getElementById('emoji-picker').classList.remove('open');
  document.getElementById('send-btn').disabled = !input.value.trim();
};
document.addEventListener('click', e => {
  const picker = document.getElementById('emoji-picker');
  const btn    = document.getElementById('emoji-btn');
  if (picker && !picker.contains(e.target) && e.target !== btn) picker.classList.remove('open');
});

// ── Members panel ─────────────────────────────────────────────
window.toggleMembersPanel = function () {
  App.membersPanelOpen = !App.membersPanelOpen;
  document.getElementById('members-panel').classList.toggle('collapsed', !App.membersPanelOpen);
  if (App.membersPanelOpen) renderMembersPanel();
};

function renderMembersPanel() {
  const scroll = document.getElementById('members-scroll');
  if (!scroll) return;
  const profiles = Object.values(App.allProfiles);
  const online   = profiles.filter(p => App.onlineUsers.has(p.id));
  const offline  = profiles.filter(p => !App.onlineUsers.has(p.id));

  let html = '';
  if (online.length)  html += `<div class="members-group-label">Online — ${online.length}</div>` + online.map(p => memberItem(p, true)).join('');
  if (offline.length) html += `<div class="members-group-label">Offline — ${offline.length}</div>` + offline.map(p => memberItem(p, false)).join('');
  scroll.innerHTML = html;

  [...online, ...offline].forEach(p => {
    const el = document.getElementById(`mav-${p.id}`);
    if (el) applyAvatar(el, p.id, p.display_name);
  });
}

function memberItem(profile, isOnline) {
  return `<div class="member-item" onclick="startDM('${profile.id}')">
    <div class="avatar-wrap">
      <div class="avatar avatar-sm" id="mav-${profile.id}"></div>
      <div class="status-dot ${isOnline ? 'online' : 'offline'}"></div>
    </div>
    <span class="member-name truncate">${escapeHtml(profile.display_name)}</span>
  </div>`;
}

// ── Add Channel ───────────────────────────────────────────────
window.openAddChannelModal = function () {
  document.getElementById('new-channel-name').value = '';
  document.getElementById('new-channel-desc').value = '';
  openModal('add-channel-modal');
  setTimeout(() => document.getElementById('new-channel-name').focus(), 200);
};

window.createChannel = async function () {
  const name = document.getElementById('new-channel-name').value.trim()
    .toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const desc = document.getElementById('new-channel-desc').value.trim();
  if (!name) { showToast('Channel name is required', 'error'); return; }
  if (App.channels.find(c => c.name === name)) { showToast(`#${name} already exists`, 'error'); return; }

  const { error } = await sb.from('channels').insert({
    id: name, name, description: desc, created_by: App.user.id,
  });

  if (error) { showToast('Failed to create channel', 'error'); return; }

  // System message
  await sb.from('messages').insert({
    room_id: name, room_type: 'channel',
    sender_id: App.user.id,
    sender_name: App.profile.display_name,
    text: `${App.profile.display_name} created this channel`,
    msg_type: 'system',
  });

  closeModal('add-channel-modal');
  showToast(`#${name} created!`, 'success');
  openChannel(name, 'channel');
};

// ── New DM ────────────────────────────────────────────────────
window.openNewDMModal = function () {
  document.getElementById('dm-search-user').value = '';
  document.getElementById('dm-user-results').innerHTML = '';
  openModal('new-dm-modal');
  setTimeout(() => document.getElementById('dm-search-user').focus(), 200);
};

window.searchUsersForDM = debounce(function (query) {
  const results = document.getElementById('dm-user-results');
  if (!results) return;
  const q = query.trim().toLowerCase();
  const users = Object.values(App.allProfiles)
    .filter(p => p.id !== App.user.id)
    .filter(p => !q || p.display_name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q));

  if (!users.length) {
    results.innerHTML = `<div style="padding:12px;font-size:13px;color:var(--text-muted);text-align:center;">No users found</div>`;
    return;
  }
  results.innerHTML = users.map(p => `
    <div class="member-item" onclick="startDM('${p.id}')" style="padding:10px 12px;border-radius:var(--r-md);cursor:pointer;">
      <div class="avatar-wrap">
        <div class="avatar avatar-md" id="dmsearch-av-${p.id}"></div>
        <div class="status-dot ${App.onlineUsers.has(p.id) ? 'online' : 'offline'}"></div>
      </div>
      <div>
        <div style="font-size:14px;font-weight:500;">${escapeHtml(p.display_name)}</div>
        <div style="font-size:12px;color:var(--text-muted);">${escapeHtml(p.email || '')}</div>
      </div>
    </div>`).join('');
  users.forEach(p => {
    const el = document.getElementById(`dmsearch-av-${p.id}`);
    if (el) applyAvatar(el, p.id, p.display_name);
  });
}, 200);

window.startDM = async function (targetId) {
  if (targetId === App.user.id) { showToast("You can't DM yourself!", 'info'); return; }
  closeModal('new-dm-modal');

  const dmId    = [App.user.id, targetId].sort().join('_');
  const { data } = await sb.from('dms').select('id').eq('id', dmId).single();

  if (!data) {
    await sb.from('dms').insert({
      id:        dmId,
      member1_id: App.user.id < targetId ? App.user.id : targetId,
      member2_id: App.user.id < targetId ? targetId : App.user.id,
      last_at:   new Date().toISOString(),
    });
    // Reload DMs
    await loadDMs();
  }

  openChannel(dmId, 'dm');
};

// ── Status ────────────────────────────────────────────────────
window.openStatusMenu = function (e) {
  e.stopPropagation();
  const menu = document.getElementById('status-menu');
  menu.classList.toggle('hidden');
  if (!menu.classList.contains('hidden')) {
    const rect = document.getElementById('sidebar-user').getBoundingClientRect();
    menu.style.cssText += `;bottom:${window.innerHeight - rect.top + 8}px;left:${rect.left}px;`;
  }
};
window.closeStatusMenu = function () {
  document.getElementById('status-menu')?.classList.add('hidden');
};
document.addEventListener('click', () => closeStatusMenu());

window.setStatus = async function (status) {
  closeStatusMenu();
  const colorMap  = { online: 'var(--status-online)', away: 'var(--status-away)', dnd: 'var(--status-dnd)', offline: 'var(--status-offline)' };
  const labelMap  = { online: 'Online', away: 'Away', dnd: 'Do Not Disturb', offline: 'Appear Offline' };
  const dotEl     = document.getElementById('my-status-dot');
  const ldotEl    = document.getElementById('my-status-label-dot');
  const textEl    = document.getElementById('my-status-text');
  if (dotEl)  dotEl.className = `status-dot ${status === 'dnd' ? 'online' : status}`;
  if (ldotEl) ldotEl.style.background = colorMap[status];
  if (textEl) textEl.textContent = labelMap[status];

  // Update presence track
  if (App.presenceChannel) {
    await App.presenceChannel.track({ user_id: App.user.id, display_name: App.profile.display_name, status });
  }
  showToast(`Status set to ${labelMap[status]}`, 'success');
};

// ── Away detection ────────────────────────────────────────────
function setupAwayDetection() {
  let awayTimer;
  const reset = () => {
    clearTimeout(awayTimer);
    if (App.presenceChannel) App.presenceChannel.track({ user_id: App.user.id, display_name: App.profile?.display_name, status: 'online' }).catch(() => {});
    awayTimer = setTimeout(() => {
      if (App.presenceChannel) App.presenceChannel.track({ user_id: App.user.id, display_name: App.profile?.display_name, status: 'away' }).catch(() => {});
    }, 5 * 60 * 1000);
  };
  ['mousemove','keydown','click','scroll'].forEach(e => document.addEventListener(e, reset, { passive: true }));
  reset();
}

// ── Settings ──────────────────────────────────────────────────
window.openSettingsModal = function () {
  const ni = document.getElementById('settings-display-name');
  const nd = document.getElementById('settings-name-display');
  const ed = document.getElementById('settings-email-display');
  const av = document.getElementById('settings-avatar');
  if (ni) ni.value = App.profile?.display_name || '';
  if (nd) nd.textContent = App.profile?.display_name || '';
  if (ed) ed.textContent = App.user?.email || '';
  if (av) applyAvatar(av, App.user?.id, App.profile?.display_name || 'U');
  openModal('settings-modal');
};

window.saveSettings = async function () {
  const name = document.getElementById('settings-display-name').value.trim();
  if (name.length < 2) { showToast('Name must be at least 2 characters', 'error'); return; }

  const { error } = await sb.from('profiles').update({ display_name: name }).eq('id', App.user.id);
  if (error) { showToast('Failed to update profile', 'error'); return; }

  App.profile.display_name = name;
  App.allProfiles[App.user.id].display_name = name;
  renderMyProfile();
  closeModal('settings-modal');
  showToast('Profile updated!', 'success');
};

// ── Sign out ──────────────────────────────────────────────────
window.signOut = async function () {
  clearMyTyping();
  if (App.presenceChannel) await App.presenceChannel.untrack().catch(() => {});
  await sb.auth.signOut();
  window.location.href = 'index.html';
};

// ── Search ────────────────────────────────────────────────────
window.handleSearch = debounce(function (q) {
  q = q.toLowerCase().trim();
  document.querySelectorAll('#channels-list .nav-item, #dms-list .nav-item').forEach(el => {
    const name = el.querySelector('.nav-item-name')?.textContent.toLowerCase() || '';
    el.style.display = !q || name.includes(q) ? '' : 'none';
  });
}, 200);

// ── Keyboard shortcuts ────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    document.getElementById('emoji-picker')?.classList.remove('open');
    closeStatusMenu();
  }
});
