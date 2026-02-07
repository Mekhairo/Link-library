const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database setup
const db = new sqlite3.Database('./links.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    initDatabase();
  }
});

// Initialize database tables
function initDatabase() {
  db.run(`
    CREATE TABLE IF NOT EXISTS links (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      notes TEXT,
      folder TEXT,
      tags TEXT,
      created TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    )
  `);
}

// API Routes

// Get all links
app.get('/api/links', (req, res) => {
  db.all('SELECT * FROM links ORDER BY created DESC', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    // Parse tags from JSON string
    const links = rows.map(row => ({
      ...row,
      tags: row.tags ? JSON.parse(row.tags) : []
    }));
    
    res.json(links);
  });
});

// Get single link
app.get('/api/links/:id', (req, res) => {
  db.get('SELECT * FROM links WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ error: 'Link not found' });
      return;
    }
    
    const link = {
      ...row,
      tags: row.tags ? JSON.parse(row.tags) : []
    };
    
    res.json(link);
  });
});

// Create new link
app.post('/api/links', (req, res) => {
  const { id, url, notes, folder, tags, created } = req.body;
  
  if (!id || !url || !created) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }
  
  const tagsJson = JSON.stringify(tags || []);
  
  db.run(
    'INSERT INTO links (id, url, notes, folder, tags, created) VALUES (?, ?, ?, ?, ?, ?)',
    [id, url, notes || '', folder || '', tagsJson, created],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.status(201).json({ 
        id,
        url,
        notes,
        folder,
        tags: tags || [],
        created
      });
    }
  );
});

// Update link
app.put('/api/links/:id', (req, res) => {
  const { url, notes, folder, tags } = req.body;
  const tagsJson = JSON.stringify(tags || []);
  
  db.run(
    'UPDATE links SET url = ?, notes = ?, folder = ?, tags = ? WHERE id = ?',
    [url, notes || '', folder || '', tagsJson, req.params.id],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      if (this.changes === 0) {
        res.status(404).json({ error: 'Link not found' });
        return;
      }
      res.json({ message: 'Link updated successfully' });
    }
  );
});

// Delete link
app.delete('/api/links/:id', (req, res) => {
  db.run('DELETE FROM links WHERE id = ?', [req.params.id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: 'Link not found' });
      return;
    }
    res.json({ message: 'Link deleted successfully' });
  });
});

// Get all folders
app.get('/api/folders', (req, res) => {
  db.all('SELECT name FROM folders ORDER BY name', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    const folders = rows.map(row => row.name);
    res.json(folders);
  });
});

// Create folder
app.post('/api/folders', (req, res) => {
  const { name } = req.body;
  
  if (!name) {
    res.status(400).json({ error: 'Folder name is required' });
    return;
  }
  
  db.run('INSERT INTO folders (name) VALUES (?)', [name], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE')) {
        res.status(409).json({ error: 'Folder already exists' });
      } else {
        res.status(500).json({ error: err.message });
      }
      return;
    }
    res.status(201).json({ name });
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    } else {
      console.log('Database connection closed');
    }
    process.exit(0);
  });
});
