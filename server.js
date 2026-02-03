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

// CRITICAL FIX: Gzip messes up Video Streaming (Content-Length/Ranges). 
// Disable it for the proxy endpoint or video content types.
app.use(compression({
    filter: (req, res) => {
        if (req.path.startsWith('/api/proxy')) return false;
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
    }
}));

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

// --- SMART STREAM PROXY ---
app.get('/api/proxy', async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') return res.status(400).send('Url required');

    try {
        // Standard Browser User-Agent to avoid blocking
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Connection': 'keep-alive',
            'Cache-Control': 'no-cache'
        };
        
        // Forward Range headers for seeking in VODs (Critical for MKV/MP4 buffering)
        if (req.headers.range) {
            headers['Range'] = req.headers.range;
        }

        const controller = new AbortController();
        
        // 60s timeout for initial connection
        const timeout = setTimeout(() => controller.abort(), 60000);

        const response = await fetch(url, { 
            headers, 
            signal: controller.signal,
            redirect: 'follow' 
        });
        
        clearTimeout(timeout);

        if (!response.ok) {
            if (response.status === 416) return res.sendStatus(416);
            return res.status(response.status).send(`Upstream Error: ${response.statusText}`);
        }

        // --- HEADER SANITIZATION ---
        const safeHeaders = [
            'content-type', 
            'content-length', 
            'accept-ranges', 
            'content-range', 
            'last-modified', 
            'etag'
        ];
        
        safeHeaders.forEach(h => {
            const val = response.headers.get(h);
            if (val) res.setHeader(h, val);
        });

        // Set status code (important for 206 Partial Content)
        res.status(response.status);

        // FORCE NO-CACHE
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        // Content Type Detection
        let contentType = response.headers.get('content-type') || '';
        const lowerUrl = url.toLowerCase();
        
        if (lowerUrl.includes('.mkv') && (contentType === 'application/octet-stream' || !contentType)) {
            contentType = 'video/webm';
            res.setHeader('Content-Type', 'video/webm');
        }

        const isM3U8 = contentType.includes('mpegurl') || 
                       contentType.includes('m3u8') || 
                       lowerUrl.includes('.m3u8');

        if (isM3U8) {
            // Text based processing for M3U8
            try {
                req.on('close', () => controller.abort());

                const buffer = await response.arrayBuffer();
                const text = new TextDecoder().decode(buffer);

                if (text.trim().startsWith('#EXTM3U')) {
                    const baseUrl = response.url.substring(0, response.url.lastIndexOf('/') + 1);
                    const rewritten = text.replace(/^(?!#)(?!\s)(.+)$/gm, (match) => {
                        let target = match.trim();
                        try {
                            if (!target.startsWith('http')) {
                                target = new URL(target, baseUrl).toString();
                            }
                        } catch (e) { }
                        return `/api/proxy?url=${encodeURIComponent(target)}`;
                    });

                    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
                    res.setHeader('Content-Length', Buffer.byteLength(rewritten));
                    res.send(rewritten);
                    return;
                } else {
                    res.setHeader('Content-Type', 'video/mp2t'); 
                    res.write(new Uint8Array(buffer));
                    res.end();
                    return;
                }
            } catch (err) {
                 if (!res.headersSent) res.status(500).send("Playlist Error");
                 return;
            }
        }

        // --- BINARY STREAM (TS, MP4, MKV) ---
        if (!response.body) return res.end();
        
        // CRITICAL PERFORMANCE: 
        // Use a huge High Water Mark (10MB) to pull data from upstream aggressively.
        // This effectively moves buffering from the client's browser to the server's RAM,
        // preventing stuttering if the provider is slightly unstable.
        const stream = Readable.fromWeb(response.body, { highWaterMark: 10 * 1024 * 1024 }); 
        
        // Cleanup: If client disconnects, we abort upstream.
        req.on('close', () => {
             controller.abort();
             if (!stream.destroyed) {
                 try { stream.destroy(); } catch (e) {}
             }
        });

        // Suppress errors during piping (e.g., client disconnects early)
        stream.on('error', (err) => {
            if (err.name !== 'AbortError') {
               // Silent fail on stream errors is preferred for proxy media to avoid crashing server
            }
        });

        res.on('error', (err) => {
            controller.abort();
            stream.destroy();
        });

        stream.pipe(res);

    } catch (e) {
        if (e.name !== 'AbortError') {
             // console.error(`[Proxy Error] ${url}:`, e.message);
             if (!res.headersSent) res.status(500).send('Stream Unavailable');
        }
    }
});

// API: Upload Chunk (Keep existing)
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

            for (let i = 0; i < totalChunks; i++) {
                const data = fs.readFileSync(path.join(DATA_DIR, `upload_${id}_part_${i}`));
                fs.appendFileSync(tempCompleteFile, data);
                fs.unlinkSync(path.join(DATA_DIR, `upload_${id}_part_${i}`));
            }

            if (fs.existsSync(DATA_FILE)) fs.rmSync(DATA_FILE, { recursive: true, force: true });
            fs.renameSync(tempCompleteFile, DATA_FILE);

            return res.json({ success: true, complete: true });
        }
        res.json({ success: true, chunk: chunkIndex });
    } catch (err) {
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