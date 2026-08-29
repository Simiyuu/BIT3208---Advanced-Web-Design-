const express = require('express');
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'chandlermxtere@gmail.com',
    pass: 'ztmussavbbovrweb'
  }
});

const DB_CONFIG = {
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: '',
  database: 'notes_app',
  multipleStatements: true
};

let db;

async function initDB() {
  const tempConn = await mysql.createConnection({
    host: DB_CONFIG.host,
    port: DB_CONFIG.port,
    user: DB_CONFIG.user,
    password: DB_CONFIG.password
  });

  await tempConn.execute(`CREATE DATABASE IF NOT EXISTS \`${DB_CONFIG.database}\``);
  await tempConn.end();

  db = await mysql.createPool(DB_CONFIG);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id                VARCHAR(36)  PRIMARY KEY,
      username          VARCHAR(100) NOT NULL UNIQUE,
      email             VARCHAR(255) NOT NULL UNIQUE,
      password          VARCHAR(100) NOT NULL,
      role              VARCHAR(20)  DEFAULT 'student',
      is_verified       TINYINT(1)   DEFAULT 0,
      verify_token      VARCHAR(100) DEFAULT NULL,
      reset_token       VARCHAR(100) DEFAULT NULL,
      reset_expires     DATETIME     DEFAULT NULL,
      two_fa_secret     VARCHAR(100) DEFAULT NULL,
      two_fa_enabled    TINYINT(1)   DEFAULT 0,
      created_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      token      VARCHAR(36) PRIMARY KEY,
      user_id    VARCHAR(36) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS notes (
      id         VARCHAR(36)  PRIMARY KEY,
      user_id    VARCHAR(36)  NOT NULL,
      title      VARCHAR(255) NOT NULL,
      content    TEXT         NOT NULL,
      category   VARCHAR(100) DEFAULT 'General',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  console.log('✅ Database & tables ready');
}

async function requireAuth(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  const [rows] = await db.execute('SELECT user_id FROM sessions WHERE token = ?', [token]);
  if (rows.length === 0) return res.status(401).json({ error: 'Invalid or expired session' });
  req.userId = rows[0].user_id;
  next();
}

app.post('/api/register', async (req, res) => {
  const { username, email, password, role } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'Username, email and password are required' });

  try {
    const id = uuidv4();
    const verifyToken = uuidv4();
    await db.execute(
      'INSERT INTO users (id, username, email, password, role, verify_token) VALUES (?, ?, ?, ?, ?, ?)',
      [id, username, email, password, role || 'student', verifyToken]
    );

    await transporter.sendMail({
      from: 'chandlermxtere@gmail.com',
      to: email,
      subject: 'NoteKeeper — Verify Your Email',
      html: `<h2>Welcome to NoteKeeper, ${username}!</h2>
       <p>Click below to verify your email:</p>
       <a href="http://127.0.0.1:3000/api/verify/${verifyToken}" 
                style="background:#c8f060;color:#0e0e0e;padding:10px 20px;border-radius:4px;text-decoration:none;font-weight:bold;">
               Verify Email
             </a>`
    });

    res.json({ message: 'Account created! Please check your email to verify your account.' });
  } catch (err) {
    console.error('REGISTER ERROR:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      if (err.message.includes('email'))
        return res.status(400).json({ error: 'Email already registered' });
      return res.status(400).json({ error: 'Username already taken' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/verify/:token', async (req, res) => {
  const [rows] = await db.execute('SELECT id FROM users WHERE verify_token = ?', [req.params.token]);
  if (rows.length === 0) return res.send('<h2>Invalid or expired verification link.</h2>');
  await db.execute('UPDATE users SET is_verified = 1, verify_token = NULL WHERE verify_token = ?', [req.params.token]);
  res.send('<h2 style="font-family:sans-serif">✅ Email verified! <a href="http://127.0.0.1:3000">Click here to login</a></h2>');
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const [rows] = await db.execute(
    'SELECT id, role, is_verified, two_fa_enabled FROM users WHERE username = ? AND password = ?',
    [username, password]
  );
  if (rows.length === 0) return res.status(401).json({ error: 'Invalid username or password' });
  if (!rows[0].is_verified) return res.status(401).json({ error: 'Please verify your email before logging in' });
  if (rows[0].two_fa_enabled) return res.json({ requires2FA: true, userId: rows[0].id });

  const token = uuidv4();
  await db.execute('INSERT INTO sessions (token, user_id) VALUES (?, ?)', [token, rows[0].id]);
  res.json({ token, username, role: rows[0].role });
});

app.post('/api/verify-2fa', async (req, res) => {
  const { userId, otp } = req.body;
  const [rows] = await db.execute('SELECT id, username, role, two_fa_secret FROM users WHERE id = ?', [userId]);
  if (rows.length === 0) return res.status(400).json({ error: 'User not found' });

  const verified = speakeasy.totp.verify({
    secret: rows[0].two_fa_secret,
    encoding: 'base32',
    token: otp,
    window: 2 
  });
  if (!verified) return res.status(401).json({ error: 'Invalid OTP code' });

  const token = uuidv4();
  await db.execute('INSERT INTO sessions (token, user_id) VALUES (?, ?)', [token, rows[0].id]);
  res.json({ token, username: rows[0].username, role: rows[0].role });
});

app.post('/api/logout', requireAuth, async (req, res) => {
  await db.execute('DELETE FROM sessions WHERE token = ?', [req.headers['authorization']]);
  res.json({ message: 'Logged out' });
});

app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });
  const [rows] = await db.execute('SELECT id, username FROM users WHERE email = ?', [email]);
  if (rows.length === 0) return res.status(400).json({ error: 'No account found with that email' });

  const resetToken = uuidv4();
  const expires = new Date(Date.now() + 3600000);
  await db.execute('UPDATE users SET reset_token = ?, reset_expires = ? WHERE email = ?', [resetToken, expires, email]);

  await transporter.sendMail({
    from: 'chandlermxtere@gmail.com',
    to: email,
    subject: 'NoteKeeper — Password Reset',
    html: `<h2>Password Reset</h2>
       <p>Hi ${rows[0].username}, click below to reset your password:</p>
       <a href="http://127.0.0.1:3000/reset-password.html?token=${resetToken}"
              style="background:#c8f060;color:#0e0e0e;padding:10px 20px;border-radius:4px;text-decoration:none;font-weight:bold;">
             Reset Password
           </a>
           <p>This link expires in 1 hour.</p>`
  });
  res.json({ message: 'Password reset link sent to your email' });
});

app.post('/api/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  const [rows] = await db.execute(
    'SELECT id FROM users WHERE reset_token = ? AND reset_expires > NOW()', [token]
  );
  if (rows.length === 0) return res.status(400).json({ error: 'Invalid or expired reset link' });
  await db.execute(
    'UPDATE users SET password = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?',
    [newPassword, rows[0].id]
  );
  res.json({ message: 'Password reset successfully! Please log in.' });
});

app.post('/api/setup-2fa', requireAuth, async (req, res) => {
  const [rows] = await db.execute('SELECT username, two_fa_enabled FROM users WHERE id = ?', [req.userId]);
  
  if (rows[0].two_fa_enabled) {
    return res.status(400).json({ error: '2FA is already enabled for this account.' });
  }

  const secret = speakeasy.generateSecret({ name: `NoteKeeper (${rows[0].username})` });
  await db.execute('UPDATE users SET two_fa_secret = ? WHERE id = ?', [secret.base32, req.userId]);
  const qrCode = await QRCode.toDataURL(secret.otpauth_url);
  res.json({ qrCode, secret: secret.base32 });
});

app.post('/api/enable-2fa', requireAuth, async (req, res) => {
  const { otp } = req.body;
  const [rows] = await db.execute('SELECT two_fa_secret FROM users WHERE id = ?', [req.userId]);
  const verified = speakeasy.totp.verify({
    secret: rows[0].two_fa_secret,
    encoding: 'base32',
    token: otp,
    window: 2
  });
  if (!verified) return res.status(400).json({ error: 'Invalid OTP. Try again.' });
  await db.execute('UPDATE users SET two_fa_enabled = 1 WHERE id = ?', [req.userId]);
  res.json({ message: '2FA enabled successfully!' });
});

app.get('/api/profile', requireAuth, async (req, res) => {
  const [rows] = await db.execute(
    'SELECT username, email, role, is_verified, two_fa_enabled, created_at FROM users WHERE id = ?',
    [req.userId]
  );
  res.json(rows[0]);
});

app.put('/api/profile', requireAuth, async (req, res) => {
  const { username, newPassword } = req.body;
  if (!username) return res.status(400).json({ error: 'Username is required' });
  if (newPassword) {
    await db.execute('UPDATE users SET username = ?, password = ? WHERE id = ?', [username, newPassword, req.userId]);
  } else {
    await db.execute('UPDATE users SET username = ? WHERE id = ?', [username, req.userId]);
  }
  res.json({ message: 'Profile updated successfully!' });
});

app.get('/api/lecturer/notes', requireAuth, async (req, res) => {
  const [role] = await db.execute(
    'SELECT role FROM users WHERE id = ?', [req.userId]
  );
  if (role[0].role !== 'lecturer')
    return res.status(403).json({ error: 'Lecturer access only' });

  const [rows] = await db.execute(`
    SELECT notes.id, notes.title, notes.content, notes.category, 
           notes.created_at, users.username
    FROM notes
    JOIN users ON notes.user_id = users.id
    ORDER BY notes.created_at DESC
  `);
  res.json(rows);
});

app.get('/api/admin/users', requireAuth, async (req, res) => {
  const [userRows] = await db.execute(
    'SELECT id FROM users WHERE id = ?', [req.userId]
  );
  if (userRows.length === 0) return res.status(403).json({ error: 'Access denied' });

  const [role] = await db.execute(
    'SELECT role FROM users WHERE id = ?', [req.userId]
  );
  if (role[0].role !== 'administrator')
    return res.status(403).json({ error: 'Admin access only' });

  const [rows] = await db.execute(
    'SELECT username, email, role, is_verified, created_at FROM users ORDER BY created_at DESC'
  );
  res.json(rows);
});


app.get('/api/notes', requireAuth, async (req, res) => {
  const [rows] = await db.execute(
    'SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC', [req.userId]
  );
  res.json(rows);
});

app.post('/api/notes', requireAuth, async (req, res) => {
  const { title, content, category } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Title and content required' });
  const id = uuidv4();
  await db.execute(
    'INSERT INTO notes (id, user_id, title, content, category) VALUES (?, ?, ?, ?, ?)',
    [id, req.userId, title, content, category || 'General']
  );
  res.json({ message: 'Note saved!', id });
});

app.put('/api/notes/:id', requireAuth, async (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Title and content required' });
  await db.execute(
    'UPDATE notes SET title = ?, content = ? WHERE id = ? AND user_id = ?',
    [title, content, req.params.id, req.userId]
  );
  res.json({ message: 'Note updated!' });
});

app.delete('/api/notes/:id', requireAuth, async (req, res) => {
  await db.execute('DELETE FROM notes WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
  res.json({ message: 'Note deleted' });
});

initDB().then(() => {
  app.listen(3000, () => console.log('🚀 Server running at http://localhost:3000'));
}).catch(err => {
  console.error('❌ Failed to connect to MySQL:', err.message);
  process.exit(1);
});