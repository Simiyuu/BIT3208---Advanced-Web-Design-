const API = 'http://localhost:3000/api';
let token = localStorage.getItem('token');
let username = localStorage.getItem('username');
let selectedNoteId = null;
let notes = [];

if (token) showApp();

function showApp() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appScreen').style.display = 'flex';
  document.getElementById('userInfo').classList.remove('hidden');
  document.getElementById('usernameDisplay').textContent = username;
  loadNotes();
}

function showAuth() {
  document.getElementById('authScreen').style.display = 'flex';
  document.getElementById('appScreen').style.display = 'none';
  document.getElementById('userInfo').classList.add('hidden');
}

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login');
  document.getElementById('registerForm').classList.toggle('hidden', tab !== 'register');
}

async function register() {
  const user  = document.getElementById('regUser').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const pass  = document.getElementById('regPass').value;
  const msg   = document.getElementById('registerMsg');

  if (!user || !email || !pass) {
    msg.style.color = 'var(--danger)';
    msg.textContent = 'Please fill in all fields';
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    msg.style.color = 'var(--danger)';
    msg.textContent = 'Please enter a valid email';
    return;
  }

  const res = await fetch(`${API}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, email, password: pass })
  });
  const data = await res.json();

  if (res.ok) {
    msg.style.color = 'var(--accent)';
    msg.textContent = '✓ ' + data.message;
  } else {
    msg.style.color = 'var(--danger)';
    msg.textContent = data.error;
  }
}

async function login() {
  const user = document.getElementById('loginUser').value.trim();
  const pass = document.getElementById('loginPass').value;
  const msg  = document.getElementById('loginMsg');

  if (!user || !pass) {
    msg.textContent = 'Fill in all fields';
    return;
  }

  const res = await fetch(`${API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: pass })
  });
  const data = await res.json();

  if (res.ok) {
    token    = data.token;
    username = data.username;
    localStorage.setItem('token', token);
    localStorage.setItem('username', username);
    showApp();
  } else {
    msg.textContent = data.error;
  }
}

async function logout() {
  await fetch(`${API}/logout`, {
    method: 'POST',
    headers: { 'Authorization': token }
  });
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  token    = null;
  username = null;
  showAuth();
}

async function loadNotes() {
  const res = await fetch(`${API}/notes`, {
    headers: { 'Authorization': token }
  });
  notes = await res.json();
  renderNotes();
}

function renderNotes() {
  const list = document.getElementById('notesList');
  document.getElementById('noteCount').textContent = notes.length;

  if (notes.length === 0) {
    list.innerHTML = '<div class="empty-notes">No notes yet.<br/>Create your first one →</div>';
    return;
  }

  list.innerHTML = notes.map(n => `
    <div class="note-item ${n.id === selectedNoteId ? 'active' : ''}" onclick="selectNote('${n.id}')">
      <div class="note-item-title">${escHtml(n.title)}</div>
      <div class="note-item-preview">${escHtml(n.content)}</div>
      <div class="note-item-date">${new Date(n.created_at).toLocaleDateString()}</div>
    </div>
  `).join('');
}

function selectNote(id) {
  selectedNoteId = id;
  const note = notes.find(n => n.id === id);
  if (!note) return;

  document.getElementById('noteDetail').classList.remove('hidden');
  document.getElementById('detailTitle').textContent = note.title;
  document.getElementById('detailBody').textContent  = note.content;
  document.getElementById('detailDate').textContent  =
    'Created ' + new Date(note.created_at).toLocaleString();

  renderNotes();
}

async function createNote() {
  const title   = document.getElementById('noteTitle').value.trim();
  const content = document.getElementById('noteContent').value.trim();
  const msg     = document.getElementById('noteMsg');

  if (!title || !content) {
    msg.style.color = 'var(--danger)';
    msg.textContent = 'Fill in title and content';
    return;
  }

  const res = await fetch(`${API}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': token },
    body: JSON.stringify({ title, content })
  });
  const data = await res.json();

  if (res.ok) {
    msg.style.color = 'var(--accent)';
    msg.textContent = '✓ Note saved to database!';
    document.getElementById('noteTitle').value   = '';
    document.getElementById('noteContent').value = '';
    setTimeout(() => msg.textContent = '', 3000);
    loadNotes();
  } else {
    msg.style.color = 'var(--danger)';
    msg.textContent = data.error;
  }
}

async function deleteNote() {
  if (!selectedNoteId) return;
  await fetch(`${API}/notes/${selectedNoteId}`, {
    method: 'DELETE',
    headers: { 'Authorization': token }
  });
  document.getElementById('noteDetail').classList.add('hidden');
  selectedNoteId = null;
  loadNotes();
}

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function checkStrength(password) {
  const fill  = document.getElementById('strengthFill');
  const label = document.getElementById('strengthLabel');

  let score = 0;
  if (password.length >= 8)               score++;
  if (/[A-Z]/.test(password))             score++;
  if (/[0-9]/.test(password))             score++;
  if (/[^A-Za-z0-9]/.test(password))      score++;

  if (password.length === 0) {
    fill.style.width      = '0%';
    fill.style.background = 'transparent';
    label.textContent     = '';
    label.style.color     = '';
    return;
  }

  if (score <= 1) {
    fill.style.width      = '33%';
    fill.style.background = '#ff5f5f';
    label.textContent     = 'Weak';
    label.style.color     = '#ff5f5f';
  } else if (score === 2 || score === 3) {
    fill.style.width      = '66%';
    fill.style.background = '#f0c040';
    label.textContent     = 'Medium';
    label.style.color     = '#f0c040';
  } else {
    fill.style.width      = '100%';
    fill.style.background = '#c8f060';
    label.textContent     = 'Strong';
    label.style.color     = '#c8f060';
  }
}

function editNote() {
  if (!selectedNoteId) return;
  const note = notes.find(n => n.id === selectedNoteId);
  if (!note) return;

  document.getElementById('noteTitle').value   = note.title;
  document.getElementById('noteContent').value = note.content;

  const btn = document.querySelector('.form-row .btn-primary');
  btn.textContent  = 'Update Note';
  btn.onclick      = () => updateNote(selectedNoteId);

  document.getElementById('noteTitle').focus();
}

async function updateNote(id) {
  const title   = document.getElementById('noteTitle').value.trim();
  const content = document.getElementById('noteContent').value.trim();
  const msg     = document.getElementById('noteMsg');

  if (!title || !content) {
    msg.style.color = 'var(--danger)';
    msg.textContent = 'Fill in title and content';
    return;
  }

  await fetch(`${API}/notes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': token },
    body: JSON.stringify({ title, content })
  });

  const btn = document.querySelector('.form-row .btn-primary');
  btn.textContent = 'Save Note';
  btn.onclick     = createNote;

  document.getElementById('noteTitle').value   = '';
  document.getElementById('noteContent').value = '';
  msg.style.color = 'var(--accent)';
  msg.textContent = '✓ Note updated!';
  setTimeout(() => msg.textContent = '', 3000);
  loadNotes();
}