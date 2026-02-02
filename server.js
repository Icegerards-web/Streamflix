import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import compression from 'compression';
import { createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 1402;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'playlist.json');

// --- ROBUST STARTUP & PERMISSIONS ---
// We wraps this in a function to not block main execution flow critically
const ensureDataDir = () => {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
            console.log(`[Server] Created data directory: ${DATA_DIR}`);
        }
        // Attempt to loosen permissions (0o777)
        try {
            fs.chmodSync(DATA_DIR, 0o777);
            console.log(`[Server] Set permissions 777 on data directory.`);
        } catch (e) {
            console.warn(`[Server] Note: Could not chmod data directory (OS restriction?): ${e.message}`);
        }
    } catch (err) {
        console.error(`[Server] ERROR: Could not access data directory. Uploads may fail.`, err);
    }
};
ensureDataDir();

app.use(compression());
app.use(express.json({ limit: '10mb' }));

// CORS Middleware (Very Permissive)
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-upload-id, x-chunk-index, x-total-chunks");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.static(path.join(__dirname, 'dist')));

// API: Simple Ping (No Disk I/O) - checks if server is reachable
app.get('/api/ping', (req, res) => {
    res.json({ status: 'pong' });
});

// API: Health / Write Check - checks if server can write to disk
app.get('/api/health', (req, res) => {
    try {
        const testFile = path.join(DATA_DIR, 'write_test.tmp');
        fs.writeFileSync(testFile, 'ok');
        fs.unlinkSync(testFile);
        res.json({ status: 'ok', writable: true });
    } catch (e) {
        console.error("Health Check Failed:", e);
        // We return 200 but with writable: false so the UI knows it's connected but broken
        res.json({ status: 'error', writable: false, error: e.message });
    }
});

// API: Chunked Upload Handler
app.post('/api/upload-chunk', express.raw({ type: 'application/octet-stream', limit: '50mb' }), async (req, res) => {
    try {
        const { id, index, total, compressed } = req.query;
        
        if (!id || index === undefined || !total) {
            return res.status(400).json({ error: "Missing upload parameters" });
        }

        const chunkIndex = parseInt(index);
        const totalChunks = parseInt(total);
        const isCompressed = compressed === 'true';
        const tempFileName = `temp_upload_${id}.${isCompressed ? 'gz' : 'json'}`;
        const tempFilePath = path.join(DATA_DIR, tempFileName);
        const chunkData = req.body; 

        if (chunkIndex === 0) {
            fs.writeFileSync(tempFilePath, chunkData);
        } else {
            fs.appendFileSync(tempFilePath, chunkData);
        }

        console.log(`[Server] Processed chunk ${chunkIndex + 1}/${totalChunks} (ID: ${id})`);

        if (chunkIndex === totalChunks - 1) {
            console.log(`[Server] Finalizing upload ${id}...`);
            
            if (isCompressed) {
                try {
                    await pipeline(
                        fs.createReadStream(tempFilePath),
                        createGunzip(),
                        fs.createWriteStream(DATA_FILE)
                    );
                    fs.unlinkSync(tempFilePath); 
                } catch (streamErr) {
                    console.error("Decompression failed:", streamErr);
                    return res.status(500).json({ error: "Decompression failed on server" });
                }
            } else {
                fs.renameSync(tempFilePath, DATA_FILE);
            }
            
            console.log(`[Server] Playlist updated.`);
            return res.json({ success: true, complete: true });
        }

        res.json({ success: true, chunk: chunkIndex });
    } catch (err) {
        console.error("[Server] Upload error:", err);
        res.status(500).json({ error: "Failed to process chunk." });
    }
});

app.get('/playlist.json', async (req, res) => {
    try {
        if (fs.existsSync(DATA_FILE)) {
            res.setHeader('Cache-Control', 'no-cache');
            res.sendFile(DATA_FILE);
        } else {
            res.status(404).json({ error: "No playlist found." });
        }
    } catch (e) {
        res.status(500).json({ error: "Server error reading playlist." });
    }
});

app.get('*', (req, res) => {
    const index = path.join(__dirname, 'dist', 'index.html');
    if (fs.existsSync(index)) {
        res.sendFile(index);
    } else {
        res.status(404).send('App build not found. Please run build.');
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`StreamFlix Server running on port ${PORT}`);
    console.log(`Data Directory: ${DATA_DIR}`);
});