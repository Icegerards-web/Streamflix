import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import compression from 'compression';
import { Readable } from 'stream';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 1402;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'playlist.json');

// --- ROBUST STARTUP ---
const ensureDataDir = () => {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
            console.log(`[Server] Created data directory: ${DATA_DIR}`);
        }
        try {
            fs.chmodSync(DATA_DIR, 0o777);
        } catch (e) {
            console.warn(`[Server] Note: Could not chmod data directory: ${e.message}`);
        }
    } catch (err) {
        console.error(`[Server] ERROR: Could not access data directory.`, err);
    }
};
ensureDataDir();

app.use((req, res, next) => {
    if (req.url.startsWith('/api') && !req.url.startsWith('/api/proxy')) {
        console.log(`[API Request] ${req.method} ${req.url}`);
    }
    next();
});

// Gzip responses (downloading), but we handle upload manually
app.use(compression());
// Increase JSON limit
app.use(express.json({ limit: '50mb' }));

// CORS
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Range");
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

// API: Stream Proxy (Bypasses CORS/Mixed Content)
app.get('/api/proxy', async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') return res.status(400).send('Url required');

    try {
        // Forward Range header for video seeking
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        };
        if (req.headers.range) {
            headers['Range'] = req.headers.range;
        }

        const response = await fetch(url, { headers });

        // Forward status
        res.status(response.status);

        // Forward important headers
        const forwardHeaders = ['content-type', 'content-length', 'accept-ranges', 'content-range', 'access-control-allow-origin'];
        forwardHeaders.forEach(h => {
            const val = response.headers.get(h);
            if (val) res.setHeader(h, val);
        });

        // Handle Body
        if (!response.body) return res.end();

        // Convert Web Stream to Node Stream and pipe
        // @ts-ignore
        Readable.fromWeb(response.body).pipe(res);
        
    } catch (e) {
        console.error(`[Proxy Error] ${url}:`, e.message);
        if (!res.headersSent) res.status(500).send('Proxy Request Failed');
    }
});

// API: Robust Chunked Upload
app.post('/api/upload-chunk', express.raw({ type: 'application/octet-stream', limit: '50mb' }), async (req, res) => {
    try {
        const { id, index, total } = req.query;
        if (!id || index === undefined || !total) return res.status(400).json({ error: "Missing parameters" });

        const chunkIndex = parseInt(index);
        const totalChunks = parseInt(total);
        
        // Save chunk as a separate file
        const chunkFileName = `upload_${id}_part_${chunkIndex}`;
        const chunkFilePath = path.join(DATA_DIR, chunkFileName);
        
        // Write the chunk synchronously to ensure it exists before we move on
        fs.writeFileSync(chunkFilePath, req.body);
        
        // If this is the last chunk, perform the merge
        if (chunkIndex === totalChunks - 1) {
            console.log(`[Server] Received final chunk for ${id} (${totalChunks} parts). Starting merge...`);
            
            // 1. Verify all parts exist BEFORE starting merge
            for (let i = 0; i < totalChunks; i++) {
                const partPath = path.join(DATA_DIR, `upload_${id}_part_${i}`);
                if (!fs.existsSync(partPath)) {
                    console.error(`[Server] Merge failed. Missing part ${i}`);
                    return res.status(400).json({ error: `Missing part ${i}` });
                }
            }

            // 2. Merge parts using appendFileSync for absolute safety (prevents race conditions)
            const tempCompleteFile = path.join(DATA_DIR, `upload_${id}_complete.tmp`);
            
            // Clear temp file if exists from previous failed attempt
            if (fs.existsSync(tempCompleteFile)) fs.unlinkSync(tempCompleteFile);

            try {
                for (let i = 0; i < totalChunks; i++) {
                    const partPath = path.join(DATA_DIR, `upload_${id}_part_${i}`);
                    const data = fs.readFileSync(partPath);
                    fs.appendFileSync(tempCompleteFile, data);
                    // CRITICAL: Do NOT delete parts yet. If merge fails later, we need them for retry.
                }
            } catch (mergeErr) {
                console.error("[Server] Merge IO Error:", mergeErr);
                return res.status(500).json({ error: "Server file merge failed." });
            }

            // 3. Rename to playlist.json (Atomic operation)
            console.log(`[Server] Renaming ${id} to playlist.json...`);
            try {
                // Remove existing file. Use rmSync to handle if it's accidentally a directory (EISDIR fix).
                if (fs.existsSync(DATA_FILE)) {
                    fs.rmSync(DATA_FILE, { recursive: true, force: true });
                }
                fs.renameSync(tempCompleteFile, DATA_FILE);
            } catch (renameErr) {
                console.error("[Server] Rename Error:", renameErr);
                // If rename fails, we still have parts. Client can retry.
                return res.status(500).json({ error: "Could not save final playlist file: " + renameErr.message });
            }

            // 4. Cleanup parts ONLY after successful rename
            console.log(`[Server] Cleanup parts for ${id}...`);
            try {
                for (let i = 0; i < totalChunks; i++) {
                    const partPath = path.join(DATA_DIR, `upload_${id}_part_${i}`);
                    if (fs.existsSync(partPath)) fs.unlinkSync(partPath);
                }
            } catch (cleanupErr) {
                console.warn("[Server] Cleanup warning (non-fatal):", cleanupErr.message);
            }

            console.log(`[Server] Upload ${id} complete.`);
            return res.json({ success: true, complete: true });
        }

        res.json({ success: true, chunk: chunkIndex });
    } catch (err) {
        console.error("[Server] Upload error:", err);
        res.status(500).json({ error: "Failed to process chunk: " + err.message });
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