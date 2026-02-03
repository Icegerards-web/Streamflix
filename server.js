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
        }
    } catch (err) {
        console.error(`[Server] ERROR: Could not access data directory.`, err);
    }
};
ensureDataDir();

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
        res.json({ status: 'error', writable: false, error: e.message });
    }
});

// --- ADVANCED PROXY ---
// Fixes Mixed Content, Masquerades as VLC, and Handles HLS Rewriting
app.get('/api/proxy', async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') return res.status(400).send('Url required');

    try {
        // 1. Masquerade as VLC to prevent blocking/throttling by IPTV providers
        const headers = {
            'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
            'Accept': '*/*',
            'Connection': 'keep-alive'
        };
        
        // Forward Range header for seeking
        if (req.headers.range) {
            headers['Range'] = req.headers.range;
        }

        const controller = new AbortController();
        // 30s timeout for initial connection
        const timeout = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(url, { 
            headers, 
            signal: controller.signal,
            redirect: 'follow' // Follow redirects to get the final URL for relative path resolution
        });
        
        clearTimeout(timeout);

        if (!response.ok) {
            return res.status(response.status).send(`Upstream Error: ${response.statusText}`);
        }

        // 2. Header Sanitization
        // We do NOT forward Content-Encoding or Content-Length blindly. 
        // Node's pipe handles chunked encoding automatically. 
        // Forwarding them often causes ERR_HTTP2_PROTOCOL_ERROR or broken downloads.
        const safeHeaders = ['content-type', 'accept-ranges', 'last-modified', 'etag'];
        safeHeaders.forEach(h => {
            const val = response.headers.get(h);
            if (val) res.setHeader(h, val);
        });

        // 3. Content Sniffing & HLS Rewrite
        const contentType = response.headers.get('content-type') || '';
        const isM3U8 = contentType.includes('mpegurl') || 
                       contentType.includes('m3u8') || 
                       url.endsWith('.m3u8');

        // Check buffer for #EXTM3U to be sure it's a playlist, not a TS stream labeled incorrectly
        if (isM3U8) {
            const buffer = await response.arrayBuffer();
            const text = new TextDecoder().decode(buffer);

            // Double check: Does it look like a playlist?
            if (text.trim().startsWith('#EXTM3U')) {
                // Resolution Base: Use response.url (final URL after redirects)
                const baseUrl = response.url.substring(0, response.url.lastIndexOf('/') + 1);
                const myHost = req.get('host');
                const protocol = req.protocol;

                // Rewrite Logic:
                // Find lines that are NOT comments (#) and are NOT empty.
                const rewritten = text.replace(/^(?!#)(?!\s)(.+)$/gm, (match) => {
                    let target = match.trim();
                    
                    // Resolve relative URLs
                    try {
                        if (!target.startsWith('http')) {
                            target = new URL(target, baseUrl).toString();
                        }
                    } catch (e) { /* keep original on error */ }

                    // Recursive Proxy: Point back to this proxy
                    return `${protocol}://${myHost}/api/proxy?url=${encodeURIComponent(target)}`;
                });

                res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
                res.send(rewritten);
                return;
            } else {
                // It was labeled m3u8 but isn't text? Send as binary.
                res.setHeader('Content-Type', 'video/mp2t'); // Force TS content type
                // @ts-ignore
                Readable.fromWeb(new ReadableStream({
                    start(controller) {
                        controller.enqueue(new Uint8Array(buffer));
                        controller.close();
                    }
                })).pipe(res);
                return;
            }
        }

        // 4. Binary Stream (MP4, MKV, TS Chunks)
        if (!response.body) return res.end();
        
        // @ts-ignore
        Readable.fromWeb(response.body).pipe(res);

    } catch (e) {
        if (e.name !== 'AbortError') {
             console.error(`[Proxy Error] ${url}:`, e.message);
        }
        if (!res.headersSent) res.status(500).send('Stream Unavailable');
    }
});

// API: Robust Chunked Upload (Keep existing logic)
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