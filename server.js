const express = require('express');
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

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
      id         VARCHAR(36)  PRIMARY KEY,
      username   VARCHAR(100) NOT NULL UNIQUE,
      email      VARCHAR(255) NOT NULL UNIQUE,
      password   VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  console.log('✅ Database & tables ready');
}

async function requireAuth(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  const [rows] = await db.execute(
    'SELECT user_id FROM sessions WHERE token = ?', [token]
  );
  if (rows.length === 0) return res.status(401).json({ error: 'Invalid or expired session' });

  req.userId = rows[0].user_id;
  next();
}

app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'Username, email and password are required' });

  try {
    const id = uuidv4();
    await db.execute(
      'INSERT INTO users (id, username, email, password) VALUES (?, ?, ?, ?)',
      [id, username, email, password]
    );
    res.json({ message: 'Account created! Please log in.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      if (err.message.includes('email'))
        return res.status(400).json({ error: 'Email already registered' });
      return res.status(400).json({ error: 'Username already taken' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  const [rows] = await db.execute(
    'SELECT id FROM users WHERE username = ? AND password = ?',
    [username, password]
  );
  if (rows.length === 0)
    return res.status(401).json({ error: 'Invalid username or password' });

  const token = uuidv4();
  await db.execute(
    'INSERT INTO sessions (token, user_id) VALUES (?, ?)',
    [token, rows[0].id]
  );

  res.json({ token, username });
});

app.post('/api/logout', requireAuth, async (req, res) => {
  const token = req.headers['authorization'];
  await db.execute('DELETE FROM sessions WHERE token = ?', [token]);
  res.json({ message: 'Logged out' });
});

app.get('/api/notes', requireAuth, async (req, res) => {
  const [rows] = await db.execute(
    'SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC',
    [req.userId]
  );
  res.json(rows);
});

app.post('/api/notes', requireAuth, async (req, res) => {
  const { title, content } = req.body;
  if (!title || !content)
    return res.status(400).json({ error: 'Title and content required' });

  const id = uuidv4();
  await db.execute(
    'INSERT INTO notes (id, user_id, title, content) VALUES (?, ?, ?, ?)',
    [id, req.userId, title, content]
  );
  res.json({ message: 'Note saved!', id });
});

app.delete('/api/notes/:id', requireAuth, async (req, res) => {
  await db.execute(
    'DELETE FROM notes WHERE id = ? AND user_id = ?',
    [req.params.id, req.userId]
  );
  res.json({ message: 'Note deleted' });
});

initDB().then(() => {
  app.listen(3000, () => {
    console.log('🚀 Server running at http://localhost:3000');
  });
}).catch(err => {
  console.error('❌ Failed to connect to MySQL:', err.message);
  process.exit(1);
});

app.put('/api/notes/:id', requireAuth, async (req, res) => {
  const { title, content } = req.body;
  if (!title || !content)
    return res.status(400).json({ error: 'Title and content required' });

  await db.execute(
    'UPDATE notes SET title = ?, content = ? WHERE id = ? AND user_id = ?',
    [title, content, req.params.id, req.userId]
  );
  res.json({ message: 'Note updated!' });
});