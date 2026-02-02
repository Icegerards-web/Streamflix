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
try {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        console.log(`[Server] Created data directory: ${DATA_DIR}`);
    }
    // Attempt to loosen permissions to ensure Docker/Host compatibility
    try {
        fs.chmodSync(DATA_DIR, 0o777);
        console.log(`[Server] Set permissions 777 on data directory.`);
    } catch (e) {
        console.warn(`[Server] Could not chmod data directory (might be Windows or restricted):`, e.message);
    }
} catch (err) {
    console.error(`[Server] CRITICAL ERROR: Could not create or access data directory.`, err);
}

app.use(compression());
app.use(express.json({ limit: '10mb' }));

// CORS Middleware
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

// API: Health / Write Check
app.get('/api/health', (req, res) => {
    try {
        const testFile = path.join(DATA_DIR, 'write_test.tmp');
        fs.writeFileSync(testFile, 'ok');
        fs.unlinkSync(testFile);
        res.json({ status: 'ok', writable: true });
    } catch (e) {
        console.error("Health Check Failed:", e);
        res.status(500).json({ status: 'error', error: 'Storage not writable', details: e.message });
    }
});

// API: Chunked Upload Handler (Synchronous Version for Reliability)
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
        const chunkData = req.body; // Buffer

        // Use Synchronous operations to prevent Event Loop hangs on simple file IO
        if (chunkIndex === 0) {
            fs.writeFileSync(tempFilePath, chunkData);
        } else {
            fs.appendFileSync(tempFilePath, chunkData);
        }

        console.log(`[Server] Processed chunk ${chunkIndex + 1}/${totalChunks} (ID: ${id})`);

        if (chunkIndex === totalChunks - 1) {
            console.log(`[Server] Finalizing upload ${id}...`);
            
            if (isCompressed) {
                // Decompression still needs streams, but we wrap in try/catch block carefully
                try {
                    await pipeline(
                        fs.createReadStream(tempFilePath),
                        createGunzip(),
                        fs.createWriteStream(DATA_FILE)
                    );
                    fs.unlinkSync(tempFilePath); // Sync unlink
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