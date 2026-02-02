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
// Increase payload limit for large playlists (500mb) to avoid 413 Errors
app.use(express.json({ limit: '500mb' }));

// CORS Middleware to allow dev server requests
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Serve Static Assets (The React App)
app.use(express.static(path.join(__dirname, 'dist')));

// API: Save Playlist (Async)
app.post('/api/upload', async (req, res) => {
    try {
        const data = req.body;
        if (!Array.isArray(data)) {
            return res.status(400).json({ error: "Invalid data format. Expected array." });
        }
        
        await fs.promises.writeFile(DATA_FILE, JSON.stringify(data));
        console.log(`[Server] Saved ${data.length} channels to ${DATA_FILE}`);
        res.json({ success: true, count: data.length });
    } catch (err) {
        console.error("[Server] Save error:", err);
        res.status(500).json({ error: "Failed to save file." });
    }
});

// API: Get Playlist
app.get('/playlist.json', async (req, res) => {
    try {
        // Check if file exists asynchronously
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

// SPA Fallback: Serve index.html for any unknown route
app.get('*', (req, res) => {
    const index = path.join(__dirname, 'dist', 'index.html');
    if (fs.existsSync(index)) {
        res.sendFile(index);
    } else {
        res.status(404).send('App build not found. Please run build.');
    }
});

// Listen on 0.0.0.0 to accept connections from outside the container
app.listen(PORT, '0.0.0.0', () => {
    console.log(`StreamFlix Server running on port ${PORT}`);
    console.log(`Data Storage: ${DATA_FILE}`);
});