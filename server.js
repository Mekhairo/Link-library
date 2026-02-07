const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database setup - Railway automatically provides DATABASE_URL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Initialize database tables
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS links (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        notes TEXT,
        folder TEXT,
        tags TEXT,
        created TEXT NOT NULL
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS folders (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL
      )
    `);
    
    console.log('Database tables initialized');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
}

initDatabase();

// API Routes

// Get all links
app.get('/api/links', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM links ORDER BY created DESC');
    
    // Parse tags from JSON string
    const links = result.rows.map(row => ({
      ...row,
      tags: row.tags ? JSON.parse(row.tags) : []
    }));
    
    res.json(links);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single link
app.get('/api/links/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM links WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Link not found' });
      return;
    }
    
    const link = {
      ...result.rows[0],
      tags: result.rows[0].tags ? JSON.parse(result.rows[0].tags) : []
    };
    
    res.json(link);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new link
app.post('/api/links', async (req, res) => {
  try {
    const { id, url, notes, folder, tags, created } = req.body;
    
    if (!id || !url || !created) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }
    
    const tagsJson = JSON.stringify(tags || []);
    
    await pool.query(
      'INSERT INTO links (id, url, notes, folder, tags, created) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, url, notes || '', folder || '', tagsJson, created]
    );
    
    res.status(201).json({ 
      id,
      url,
      notes,
      folder,
      tags: tags || [],
      created
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update link
app.put('/api/links/:id', async (req, res) => {
  try {
    const { url, notes, folder, tags } = req.body;
    const tagsJson = JSON.stringify(tags || []);
    
    const result = await pool.query(
      'UPDATE links SET url = $1, notes = $2, folder = $3, tags = $4 WHERE id = $5',
      [url, notes || '', folder || '', tagsJson, req.params.id]
    );
    
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Link not found' });
      return;
    }
    
    res.json({ message: 'Link updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete link
app.delete('/api/links/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM links WHERE id = $1', [req.params.id]);
    
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Link not found' });
      return;
    }
    
    res.json({ message: 'Link deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all folders
app.get('/api/folders', async (req, res) => {
  try {
    const result = await pool.query('SELECT name FROM folders ORDER BY name');
    const folders = result.rows.map(row => row.name);
    res.json(folders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create folder
app.post('/api/folders', async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name) {
      res.status(400).json({ error: 'Folder name is required' });
      return;
    }
    
    try {
      await pool.query('INSERT INTO folders (name) VALUES ($1)', [name]);
      res.status(201).json({ name });
    } catch (err) {
      if (err.code === '23505') { // Unique constraint violation
        res.status(409).json({ error: 'Folder already exists' });
      } else {
        throw err;
      }
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
process.on('SIGINT', async () => {
  await pool.end();
  console.log('Database connection closed');
  process.exit(0);
});
