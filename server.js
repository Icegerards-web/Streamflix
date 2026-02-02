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
// Increase payload limit for large playlists (50mb)
app.use(express.json({ limit: '50mb' }));

// Serve Static Assets (The React App)
app.use(express.static(path.join(__dirname, 'dist')));

// API: Save Playlist
app.post('/api/upload', (req, res) => {
    try {
        const data = req.body;
        if (!Array.isArray(data)) {
            return res.status(400).json({ error: "Invalid data format. Expected array." });
        }
        fs.writeFileSync(DATA_FILE, JSON.stringify(data));
        console.log(`[Server] Saved ${data.length} channels to ${DATA_FILE}`);
        res.json({ success: true, count: data.length });
    } catch (err) {
        console.error("[Server] Save error:", err);
        res.status(500).json({ error: "Failed to save file." });
    }
});

// API: Get Playlist
// We serve this via API so the frontend can fetch it cleanly
app.get('/playlist.json', (req, res) => {
    if (fs.existsSync(DATA_FILE)) {
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(DATA_FILE);
    } else {
        res.status(404).json({ error: "No playlist found." });
    }
});

// SPA Fallback: Serve index.html for any unknown route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`StreamFlix Server running on port ${PORT}`);
    console.log(`Data Storage: ${DATA_FILE}`);
});