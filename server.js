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

// Gzip responses
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

// API: Smart Stream Proxy (Bypasses CORS/Mixed Content & Rewrites HLS)
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

        if (!response.ok) {
            return res.status(response.status).send(`Upstream Error: ${response.statusText}`);
        }

        // Forward important headers
        const forwardHeaders = ['content-type', 'content-length', 'accept-ranges', 'content-range', 'access-control-allow-origin'];
        forwardHeaders.forEach(h => {
            const val = response.headers.get(h);
            if (val) res.setHeader(h, val);
        });

        const contentType = response.headers.get('content-type') || '';
        
        // --- SMART HLS REWRITE ---
        // If it's an M3U8 playlist, we must rewrite internal URLs to use the proxy
        // otherwise the browser will try to fetch http:// segments directly and fail (Mixed Content).
        if (contentType.includes('mpegurl') || contentType.includes('m3u8') || url.endsWith('.m3u8')) {
            let text = await response.text();
            
            // Determine base URL for resolving relative paths
            // If url is http://site.com/folder/list.m3u8, base is http://site.com/folder/
            const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
            const myHost = req.get('host');
            const protocol = req.protocol;

            // Rewrite every line that is a URL (does not start with #)
            text = text.replace(/^(?!#)(?!\s)(.+)$/gm, (match) => {
                let target = match.trim();
                
                // Resolve relative URLs to absolute
                try {
                    if (!target.startsWith('http')) {
                        target = new URL(target, baseUrl).toString();
                    }
                } catch (e) {
                    // Fallback if URL resolution fails, use original logic or keep as is
                }

                // Wrap in proxy
                return `${protocol}://${myHost}/api/proxy?url=${encodeURIComponent(target)}`;
            });

            res.send(text);
            return;
        }

        // --- DIRECT STREAMING ---
        // For TS chunks, MP4s, etc., just pipe the binary data
        if (!response.body) return res.end();
        
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
        
        const chunkFileName = `upload_${id}_part_${chunkIndex}`;
        const chunkFilePath = path.join(DATA_DIR, chunkFileName);
        
        fs.writeFileSync(chunkFilePath, req.body);
        
        if (chunkIndex === totalChunks - 1) {
            console.log(`[Server] Received final chunk for ${id}. Merging...`);
            
            for (let i = 0; i < totalChunks; i++) {
                if (!fs.existsSync(path.join(DATA_DIR, `upload_${id}_part_${i}`))) {
                    return res.status(400).json({ error: `Missing part ${i}` });
                }
            }

            const tempCompleteFile = path.join(DATA_DIR, `upload_${id}_complete.tmp`);
            if (fs.existsSync(tempCompleteFile)) fs.unlinkSync(tempCompleteFile);

            try {
                for (let i = 0; i < totalChunks; i++) {
                    const data = fs.readFileSync(path.join(DATA_DIR, `upload_${id}_part_${i}`));
                    fs.appendFileSync(tempCompleteFile, data);
                }
            } catch (mergeErr) {
                return res.status(500).json({ error: "Merge failed." });
            }

            try {
                if (fs.existsSync(DATA_FILE)) {
                    fs.rmSync(DATA_FILE, { recursive: true, force: true });
                }
                fs.renameSync(tempCompleteFile, DATA_FILE);
            } catch (renameErr) {
                return res.status(500).json({ error: "Save failed: " + renameErr.message });
            }

            try {
                for (let i = 0; i < totalChunks; i++) {
                    fs.unlinkSync(path.join(DATA_DIR, `upload_${id}_part_${i}`));
                }
            } catch (e) {}

            return res.json({ success: true, complete: true });
        }

        res.json({ success: true, chunk: chunkIndex });
    } catch (err) {
        console.error("[Server] Upload error:", err);
        res.status(500).json({ error: err.message });
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
});