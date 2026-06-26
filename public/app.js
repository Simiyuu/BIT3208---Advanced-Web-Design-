const API = 'http://localhost:3000/api';
let token = localStorage.getItem('token');
let username = localStorage.getItem('username');
let selectedNoteId = null;
let notes = [];
let pendingUserId = null;

if (token) showApp();

function showApp() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appScreen').style.display = 'flex';
  document.getElementById('userInfo').classList.remove('hidden');
  document.getElementById('usernameDisplay').textContent = username;
  document.getElementById('roleDisplay').textContent = localStorage.getItem('role') || 'student';
  loadNotes();
  if (localStorage.getItem('role') === 'administrator') {
    loadAdminPanel();
  }
  if (localStorage.getItem('role') === 'lecturer') {
    loadLecturerPanel();
  }
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
  document.getElementById('forgotForm').classList.toggle('hidden', tab !== 'forgot');
  document.getElementById('twoFAForm').classList.add('hidden');
}

async function register() {
  const user  = document.getElementById('regUser').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const pass  = document.getElementById('regPass').value;
  const role  = document.getElementById('regRole').value;
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
    body: JSON.stringify({ username: user, email, password: pass, role })
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

  if (!user || !pass) { msg.textContent = 'Fill in all fields'; return; }

  const res = await fetch(`${API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: pass })
  });
  const data = await res.json();

  if (res.ok) {
    if (data.requires2FA) {
      pendingUserId = data.userId;
      document.getElementById('loginForm').classList.add('hidden');
      document.getElementById('twoFAForm').classList.remove('hidden');
      return;
    }
    token    = data.token;
    username = data.username;
    localStorage.setItem('token', token);
    localStorage.setItem('username', username);
    localStorage.setItem('role', data.role);
    showApp();
  } else {
    msg.textContent = data.error;
  }
}

async function verify2FA() {
  const otp = document.getElementById('otpInput').value.trim();
  const msg = document.getElementById('otpMsg');

  const res = await fetch(`${API}/verify-2fa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: pendingUserId, otp })
  });
  const data = await res.json();

  if (res.ok) {
    token    = data.token;
    username = data.username;
    localStorage.setItem('token', token);
    localStorage.setItem('username', username);
    localStorage.setItem('role', data.role);
    showApp();
  } else {
    msg.style.color = 'var(--danger)';
    msg.textContent = data.error;
  }
}

async function forgotPassword() {
  const email = document.getElementById('forgotEmail').value.trim();
  const msg   = document.getElementById('forgotMsg');

  if (!email) { msg.style.color = 'var(--danger)'; msg.textContent = 'Enter your email'; return; }

  const res = await fetch(`${API}/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
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

async function logout() {
  await fetch(`${API}/logout`, { method: 'POST', headers: { 'Authorization': token } });
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  localStorage.removeItem('role');
  token = null; username = null;
  showAuth();
}

async function showProfile() {
  document.getElementById('profilePanel').classList.remove('hidden');
  document.getElementById('notesPanel').classList.add('hidden');

  const res = await fetch(`${API}/profile`, { headers: { 'Authorization': token } });
  const data = await res.json();

  document.getElementById('profileInfo').innerHTML = `
    <span style="color:var(--text)">Username:</span> ${data.username}<br>
    <span style="color:var(--text)">Email:</span> ${data.email}<br>
    <span style="color:var(--text)">Role:</span> ${data.role}<br>
    <span style="color:var(--text)">Email Verified:</span> ${data.is_verified ? '✅ Yes' : '❌ No'}<br>
    <span style="color:var(--text)">2FA Enabled:</span> ${data.two_fa_enabled ? '✅ Yes' : '❌ No'}<br>
    <span style="color:var(--text)">Member Since:</span> ${new Date(data.created_at).toLocaleDateString()}
  `;
  document.getElementById('profileUsername').value = data.username;
}

function hideProfile() {
  document.getElementById('profilePanel').classList.add('hidden');
  document.getElementById('notesPanel').classList.remove('hidden');
}

async function updateProfile() {
  const newUsername  = document.getElementById('profileUsername').value.trim();
  const newPassword  = document.getElementById('profilePassword').value;
  const msg          = document.getElementById('profileMsg');

  const res = await fetch(`${API}/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': token },
    body: JSON.stringify({ username: newUsername, newPassword })
  });
  const data = await res.json();
  if (res.ok) {
    msg.style.color = 'var(--accent)';
    msg.textContent = '✓ ' + data.message;
    username = newUsername;
    localStorage.setItem('username', newUsername);
    document.getElementById('usernameDisplay').textContent = newUsername;
  } else {
    msg.style.color = 'var(--danger)';
    msg.textContent = data.error;
  }
}

async function setup2FA() {
  const res = await fetch(`${API}/setup-2fa`, {
    method: 'POST',
    headers: { 'Authorization': token }
  });
  const data = await res.json();
  document.getElementById('qrImage').src = data.qrCode;
  document.getElementById('qrContainer').classList.remove('hidden');
}

async function enable2FA() {
  const otp = document.getElementById('confirmOtp').value.trim();
  const msg = document.getElementById('twoFAMsg');

  const res = await fetch(`${API}/enable-2fa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': token },
    body: JSON.stringify({ otp })
  });
  const data = await res.json();
  if (res.ok) {
    msg.style.color = 'var(--accent)';
    msg.textContent = '✓ ' + data.message;
    document.getElementById('qrContainer').classList.add('hidden');
  } else {
    msg.style.color = 'var(--danger)';
    msg.textContent = data.error;
  }
}

async function loadNotes() {
  const res = await fetch(`${API}/notes`, { headers: { 'Authorization': token } });
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
  document.getElementById('detailDate').textContent  = 'Created ' + new Date(note.created_at).toLocaleString();
  renderNotes();
}

async function createNote() {
  const title    = document.getElementById('noteTitle').value.trim();
  const content  = document.getElementById('noteContent').value.trim();
  const category = document.getElementById('noteCategory').value;
  const msg      = document.getElementById('noteMsg');

  if (!title || !content) {
    msg.style.color = 'var(--danger)';
    msg.textContent = 'Fill in title and content';
    return;
  }

  const res = await fetch(`${API}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': token },
    body: JSON.stringify({ title, content, category })
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

function editNote() {
  if (!selectedNoteId) return;
  const note = notes.find(n => n.id === selectedNoteId);
  if (!note) return;
  document.getElementById('noteTitle').value   = note.title;
  document.getElementById('noteContent').value = note.content;
  const btn = document.querySelector('.form-row .btn-primary');
  btn.textContent = 'Update Note';
  btn.onclick     = () => updateNote(selectedNoteId);
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

function searchNotes(query) {
  const list = document.getElementById('notesList');
  const filtered = notes.filter(n =>
    n.title.toLowerCase().includes(query.toLowerCase()) ||
    n.content.toLowerCase().includes(query.toLowerCase())
  );
  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty-notes">No notes match your search.</div>';
    return;
  }
  list.innerHTML = filtered.map(n => `
    <div class="note-item ${n.id === selectedNoteId ? 'active' : ''}" onclick="selectNote('${n.id}')">
      <div class="note-item-title">${escHtml(n.title)}</div>
      <div class="note-item-preview">${escHtml(n.content)}</div>
      <div class="note-item-date">${new Date(n.created_at).toLocaleDateString()}</div>
    </div>
  `).join('');
}

function checkStrength(password) {
  const fill  = document.getElementById('strengthFill');
  const label = document.getElementById('strengthLabel');
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (password.length === 0) { fill.style.width = '0%'; label.textContent = ''; return; }
  if (score <= 1) { fill.style.width = '33%'; fill.style.background = '#ff5f5f'; label.textContent = 'Weak'; label.style.color = '#ff5f5f'; }
  else if (score <= 3) { fill.style.width = '66%'; fill.style.background = '#f0c040'; label.textContent = 'Medium'; label.style.color = '#f0c040'; }
  else { fill.style.width = '100%'; fill.style.background = '#c8f060'; label.textContent = 'Strong'; label.style.color = '#c8f060'; }
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function loadAdminPanel() {
  const res = await fetch(`${API}/admin/users`, {
    headers: { 'Authorization': token }
  });
  if (!res.ok) return;
  const users = await res.json();

  document.getElementById('adminPanel').classList.remove('hidden');

  const rows = users.map(u => `
    <tr>
      <td>${escHtml(u.username)}</td>
      <td>${escHtml(u.email)}</td>
      <td><span class="role-tag ${u.role}">${u.role}</span></td>
      <td>${u.is_verified
        ? '<span class="verified-yes">✓ Verified</span>'
        : '<span class="verified-no">✗ Unverified</span>'}</td>
      <td>${new Date(u.created_at).toLocaleDateString()}</td>
    </tr>
  `).join('');

  document.getElementById('adminUsersList').innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Username</th>
          <th>Email</th>
          <th>Role</th>
          <th>Verified</th>
          <th>Joined</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="font-size:0.75rem;color:var(--muted);margin-top:0.8rem">${users.length} registered user${users.length !== 1 ? 's' : ''} total</p>
  `;
}

async function loadLecturerPanel() {
  const res = await fetch(`${API}/lecturer/notes`, {
    headers: { 'Authorization': token }
  });
  if (!res.ok) return;
  const allNotes = await res.json();

  document.getElementById('lecturerPanel').classList.remove('hidden');

  if (allNotes.length === 0) {
    document.getElementById('lecturerNotesList').innerHTML =
      '<p style="color:var(--muted);font-size:0.82rem">No notes have been created yet.</p>';
    return;
  }

  const rows = allNotes.map(n => `
    <tr>
      <td>${escHtml(n.username)}</td>
      <td>${escHtml(n.title)}</td>
      <td><span class="note-content-preview">${escHtml(n.content)}</span></td>
      <td><span class="category-tag">${escHtml(n.category)}</span></td>
      <td>${new Date(n.created_at).toLocaleDateString()}</td>
    </tr>
  `).join('');

  document.getElementById('lecturerNotesList').innerHTML = `
    <table class="lecturer-table">
      <thead>
        <tr>
          <th>Student</th>
          <th>Title</th>
          <th>Content</th>
          <th>Category</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="font-size:0.75rem;color:var(--muted);margin-top:0.8rem">${allNotes.length} note${allNotes.length !== 1 ? 's' : ''} total across all students</p>
  `;
}