'use strict';

/* ── State ──────────────────────────────────────────────────────── */
let activeConvId = null;

/* ── DOM refs ───────────────────────────────────────────────────── */
const convList      = document.getElementById('convList');
const messages      = document.getElementById('messages');
const welcome       = document.getElementById('welcome');
const messageInput  = document.getElementById('messageInput');
const sendBtn       = document.getElementById('sendBtn');
const newChatBtn    = document.getElementById('newChatBtn');
const sidebar       = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const topbarTitle   = document.getElementById('topbarTitle');

/* ── Marked config ──────────────────────────────────────────────── */
marked.setOptions({ breaks: true, gfm: true });

/* ── Sidebar toggle (mobile) ────────────────────────────────────── */
sidebarToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
document.addEventListener('click', e => {
  if (!sidebar.contains(e.target) && !sidebarToggle.contains(e.target))
    sidebar.classList.remove('open');
});

/* ── Textarea auto-resize ───────────────────────────────────────── */
messageInput.addEventListener('input', () => {
  sendBtn.disabled = !messageInput.value.trim();
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 180) + 'px';
});

/* ── Enter to send ──────────────────────────────────────────────── */
messageInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
});

sendBtn.addEventListener('click', handleSend);
newChatBtn.addEventListener('click', createConversation);

/* ── Suggestion chips ───────────────────────────────────────────── */
document.querySelectorAll('.suggestion').forEach(btn => {
  btn.addEventListener('click', async () => {
    if (!activeConvId) await createConversation();
    messageInput.value = btn.dataset.text;
    sendBtn.disabled = false;
    handleSend();
  });
});

/* ── API helpers ─────────────────────────────────────────────────── */
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/* ── Conversation management ────────────────────────────────────── */
async function loadConversations() {
  const convs = await api('/api/conversations');
  renderConvList(convs);
  return convs;
}

function renderConvList(convs) {
  if (!convs.length) {
    convList.innerHTML = '<p class="conv-empty">No conversations yet.</p>';
    return;
  }
  convList.innerHTML = convs.map(c => `
    <div class="conv-item ${c.id === activeConvId ? 'active' : ''}" data-id="${c.id}">
      <span class="conv-item-title">${escHtml(c.title)}</span>
      <button class="conv-delete" data-id="${c.id}" title="Delete">✕</button>
    </div>
  `).join('');

  convList.querySelectorAll('.conv-item').forEach(el => {
    el.addEventListener('click', e => {
      if (!e.target.classList.contains('conv-delete'))
        openConversation(el.dataset.id);
    });
  });
  convList.querySelectorAll('.conv-delete').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); deleteConversation(btn.dataset.id); });
  });
}

async function createConversation() {
  const conv = await api('/api/conversations', { method: 'POST' });
  activeConvId = conv.id;
  await loadConversations();
  clearMessages();
  topbarTitle.textContent = 'New Chat';
  messageInput.focus();
  return conv;
}

async function openConversation(id) {
  activeConvId = id;
  sidebar.classList.remove('open');

  // Mark active
  document.querySelectorAll('.conv-item').forEach(el =>
    el.classList.toggle('active', el.dataset.id === id));

  const msgs = await api(`/api/conversations/${id}/messages`);
  clearMessages();
  if (msgs.length) {
    welcome.style.display = 'none';
    msgs.forEach(m => appendMessage(m.role, m.content, false));
  }

  // Update title
  const conv = document.querySelector(`.conv-item[data-id="${id}"] .conv-item-title`);
  topbarTitle.textContent = conv ? conv.textContent : 'Chat';
  scrollToBottom();
}

async function deleteConversation(id) {
  await api(`/api/conversations/${id}`, { method: 'DELETE' });
  if (activeConvId === id) {
    activeConvId = null;
    clearMessages();
    topbarTitle.textContent = 'Orion AI';
  }
  loadConversations();
}

/* ── Messaging ───────────────────────────────────────────────────── */
async function handleSend() {
  const text = messageInput.value.trim();
  if (!text || sendBtn.disabled) return;

  if (!activeConvId) await createConversation();

  // Clear input
  messageInput.value = '';
  messageInput.style.height = 'auto';
  sendBtn.disabled = true;

  welcome.style.display = 'none';
  appendMessage('user', text);

  const typingEl = appendTyping();
  try {
    const reply = await api(`/api/conversations/${activeConvId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: text }),
    });
    typingEl.remove();
    appendMessage('assistant', reply.content);
    // Refresh sidebar title
    loadConversations();
    const conv = document.querySelector(`.conv-item[data-id="${activeConvId}"] .conv-item-title`);
    if (conv) topbarTitle.textContent = conv.textContent;
  } catch (err) {
    typingEl.remove();
    appendError(err.message || 'Something went wrong. Please try again.');
  }
}

function appendMessage(role, content, animate = true) {
  const el = document.createElement('div');
  el.className = `message ${role}`;
  if (!animate) el.style.animation = 'none';

  const initial = role === 'user' ? 'U' : '◈';
  const parsed = role === 'assistant' ? marked.parse(content) : escHtml(content).replace(/\n/g, '<br>');

  el.innerHTML = `
    <div class="avatar">${initial}</div>
    <div class="bubble">${parsed}</div>
  `;
  messages.appendChild(el);
  scrollToBottom();
  return el;
}

function appendTyping() {
  const el = document.createElement('div');
  el.className = 'message assistant typing';
  el.innerHTML = `
    <div class="avatar">◈</div>
    <div class="bubble"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
  `;
  messages.appendChild(el);
  scrollToBottom();
  return el;
}

function appendError(msg) {
  const el = document.createElement('div');
  el.className = 'message assistant';
  el.innerHTML = `
    <div class="avatar">◈</div>
    <div class="bubble" style="color:#f87171;border-color:#4b1e1e;">⚠ ${escHtml(msg)}</div>
  `;
  messages.appendChild(el);
  scrollToBottom();
}

function clearMessages() {
  messages.innerHTML = '';
  welcome.style.display = 'flex';
  messages.appendChild(welcome);
}

function scrollToBottom() {
  messages.scrollTop = messages.scrollHeight;
}

/* ── Utility ─────────────────────────────────────────────────────── */
function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── Init ────────────────────────────────────────────────────────── */
(async () => {
  const convs = await loadConversations();
  if (convs.length) openConversation(convs[0].id);
})();
