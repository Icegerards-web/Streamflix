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
const ensureDataDir = () => {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
            console.log(`[Server] Created data directory: ${DATA_DIR}`);
        }
        try {
            fs.chmodSync(DATA_DIR, 0o777);
            console.log(`[Server] Set permissions 777 on data directory.`);
        } catch (e) {
            console.warn(`[Server] Note: Could not chmod data directory: ${e.message}`);
        }
    } catch (err) {
        console.error(`[Server] ERROR: Could not access data directory.`, err);
    }
};
ensureDataDir();

// --- REQUEST LOGGING MIDDLEWARE ---
app.use((req, res, next) => {
    if (req.url.startsWith('/api')) {
        console.log(`[API Request] ${req.method} ${req.url}`);
    }
    next();
});

app.use(compression());
app.use(express.json({ limit: '10mb' }));

// CORS
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-upload-id, x-chunk-index, x-total-chunks");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.static(path.join(__dirname, 'dist')));

// API: Ping
app.get('/api/ping', (req, res) => {
    res.json({ status: 'pong', time: Date.now() });
});

// API: Health Check
app.get('/api/health', (req, res) => {
    try {
        const testFile = path.join(DATA_DIR, 'write_test.tmp');
        fs.writeFileSync(testFile, 'ok');
        fs.unlinkSync(testFile);
        res.json({ status: 'ok', writable: true });
    } catch (e) {
        console.error("Health Check Failed:", e);
        res.json({ status: 'error', writable: false, error: e.message });
    }
});

// API: Upload
app.post('/api/upload-chunk', express.raw({ type: 'application/octet-stream', limit: '50mb' }), async (req, res) => {
    try {
        const { id, index, total, compressed } = req.query;
        if (!id || index === undefined || !total) return res.status(400).json({ error: "Missing parameters" });

        const chunkIndex = parseInt(index);
        const totalChunks = parseInt(total);
        const isCompressed = compressed === 'true';
        const tempFileName = `temp_upload_${id}.${isCompressed ? 'gz' : 'json'}`;
        const tempFilePath = path.join(DATA_DIR, tempFileName);
        const chunkData = req.body; 

        if (chunkIndex === 0) fs.writeFileSync(tempFilePath, chunkData);
        else fs.appendFileSync(tempFilePath, chunkData);

        if (chunkIndex === totalChunks - 1) {
            console.log(`[Server] Finalizing upload ${id}...`);
            if (isCompressed) {
                try {
                    await pipeline(fs.createReadStream(tempFilePath), createGunzip(), fs.createWriteStream(DATA_FILE));
                    fs.unlinkSync(tempFilePath); 
                } catch (streamErr) {
                    return res.status(500).json({ error: "Decompression failed" });
                }
            } else {
                fs.renameSync(tempFilePath, DATA_FILE);
            }
            return res.json({ success: true, complete: true });
        }
        res.json({ success: true, chunk: chunkIndex });
    } catch (err) {
        console.error("[Server] Upload error:", err);
        res.status(500).json({ error: "Failed to process chunk." });
    }
});

app.get('/playlist.json', async (req, res) => {
    if (fs.existsSync(DATA_FILE)) {
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(DATA_FILE);
    } else {
        res.status(404).json({ error: "No playlist found." });
    }
});

app.get('*', (req, res) => {
    const index = path.join(__dirname, 'dist', 'index.html');
    if (fs.existsSync(index)) res.sendFile(index);
    else res.status(404).send('App build not found.');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`StreamFlix Server running on port ${PORT}`);
    console.log(`Data Directory: ${DATA_DIR}`);
});