import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import compression from 'compression';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 1402;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'playlist.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

app.use(compression());

// CORS Middleware
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Serve Static Assets
app.use(express.static(path.join(__dirname, 'dist')));

// API: Save Playlist - OPTIMIZED
// We use express.raw to get the buffer directly. 
// This avoids parsing 500MB of JSON into an object and back to string (which causes timeouts).
app.post('/api/upload', express.raw({ type: 'application/json', limit: '500mb' }), async (req, res) => {
    try {
        const buffer = req.body;
        
        if (!buffer || buffer.length === 0) {
            return res.status(400).json({ error: "Empty body" });
        }
        
        // Write the buffer directly to disk
        await fs.promises.writeFile(DATA_FILE, buffer);
        
        console.log(`[Server] Saved playlist (${(buffer.length / 1024 / 1024).toFixed(2)} MB) to ${DATA_FILE}`);
        res.json({ success: true, size: buffer.length });
    } catch (err) {
        console.error("[Server] Save error:", err);
        res.status(500).json({ error: "Failed to save file." });
    }
});

// API: Get Playlist
app.get('/playlist.json', async (req, res) => {
    try {
        try {
            await fs.promises.access(DATA_FILE);
        } catch {
             return res.status(404).json({ error: "No playlist found." });
        }

        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(DATA_FILE);
    } catch (e) {
        res.status(500).json({ error: "Server error reading playlist." });
    }
});

// SPA Fallback
app.get('*', (req, res) => {
    const index = path.join(__dirname, 'dist', 'index.html');
    if (fs.existsSync(index)) {
        res.sendFile(index);
    } else {
        res.status(404).send('App build not found. Please run build.');
    }
});

// Listen with extended timeout
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`StreamFlix Server running on port ${PORT}`);
    console.log(`Data Storage: ${DATA_FILE}`);
});

// Set server timeout to 5 minutes (300,000 ms) to match Nginx
server.setTimeout(300000);
server.keepAliveTimeout = 300000;
server.headersTimeout = 301000;