import express from 'express';
import sqlite3 from 'sqlite3';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000; // Hardcoded to 3000 as per instructions
const DB_PATH = path.resolve(__dirname, 'database.sqlite');

// Database Initialization
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initDb();
    }
});

function initDb() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS app_state (
            id INTEGER PRIMARY KEY,
            data TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        console.log('Database tables initialized.');
    });
}

async function startServer() {
    // Middleware
    app.use(cors());
    app.use(bodyParser.json({ limit: '50mb' }));

    // API Routes FIRST
    app.get('/api/data', (req, res) => {
        db.get(`SELECT data FROM app_state WHERE id = 1`, (err, row: any) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: err.message });
            }
            res.json(row ? JSON.parse(row.data) : null);
        });
    });

    app.post('/api/data', (req, res) => {
        const jsonData = JSON.stringify(req.body);
        const now = new Date().toISOString();
        
        db.run(`INSERT OR REPLACE INTO app_state (id, data, updated_at) VALUES (1, ?, ?)`, [jsonData, now], function(err) {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, timestamp: now });
        });
    });

    app.get('/api/health', (req, res) => {
        res.json({ status: 'ok', message: 'Server is running' });
    });

    // Vite Middleware (Dev) or Static Files (Prod)
    if (process.env.NODE_ENV !== 'production') {
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: 'spa',
        });
        app.use(vite.middlewares);
    } else {
        // Serve static files from dist
        app.use(express.static(path.join(__dirname, 'dist')));
        
        // Handle SPA routing
        app.get('*', (req, res) => {
            res.sendFile(path.join(__dirname, 'dist', 'index.html'));
        });
    }

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
}

startServer();
