import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import compression from 'compression';
import http from 'http';
import https from 'https';
import { URL } from 'url';

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

// Disable compression for proxy to avoid buffering/content-length issues
app.use(compression({
    filter: (req, res) => {
        if (req.path.startsWith('/api/proxy')) return false;
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
    }
}));

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

// --- NATIVE STREAM PROXY ---
// Uses native http/https modules for lowest latency and proper Range support
app.get('/api/proxy', (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') return res.status(400).send('Url required');

    try {
        const targetUrl = new URL(url);
        const isHttps = targetUrl.protocol === 'https:';
        const client = isHttps ? https : http;

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Connection': 'keep-alive'
        };

        // CRITICAL: Forward Range header. 
        // This tells upstream we only want a specific chunk (e.g., bytes=0-1024).
        // Without this, upstream sends the whole file, causing the "downloading forever" issue.
        if (req.headers.range) {
            headers['Range'] = req.headers.range;
        }

        const proxyReq = client.get(url, { headers }, (proxyRes) => {
            // Forward Status Code (200 or 206 Partial Content)
            res.status(proxyRes.statusCode || 200);

            // Forward Headers
            Object.keys(proxyRes.headers).forEach(key => {
                // Skip content-encoding to avoid double compression issues
                if (key === 'content-encoding') return;
                // Forward everything else (Content-Type, Content-Length, Content-Range, etc.)
                res.setHeader(key, proxyRes.headers[key]);
            });

            // Ensure no-cache for live streams
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

            const contentType = proxyRes.headers['content-type'] || '';
            const isM3U8 = contentType.includes('mpegurl') || contentType.includes('m3u8') || url.includes('.m3u8');

            if (isM3U8) {
                 // --- M3U8 PROCESSING (BUFFERED) ---
                 // M3U8 files are small text files. We must buffer them to rewrite the URLs inside.
                 let data = [];
                 proxyRes.on('data', chunk => data.push(chunk));
                 proxyRes.on('end', () => {
                     try {
                         const buffer = Buffer.concat(data);
                         const text = buffer.toString('utf8');
                         
                         if (text.trim().startsWith('#EXTM3U')) {
                             const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
                             const rewritten = text.replace(/^(?!#)(?!\s)(.+)$/gm, (match) => {
                                let target = match.trim();
                                if (!target.startsWith('http')) {
                                    try { target = new URL(target, baseUrl).toString(); } catch(e){}
                                }
                                return `/api/proxy?url=${encodeURIComponent(target)}`;
                             });
                             
                             // Update length because content changed
                             res.setHeader('Content-Length', Buffer.byteLength(rewritten));
                             res.send(rewritten);
                         } else {
                             // Fallback if not actually M3U8 text
                             res.write(buffer);
                             res.end();
                         }
                     } catch (e) {
                         res.end();
                     }
                 });
            } else {
                // --- BINARY STREAM (PIPED) ---
                // For MP4, MKV, TS, etc. we pipe directly.
                // This ensures backpressure is handled and bytes flow immediately.
                proxyRes.pipe(res);
            }
        });

        proxyReq.on('error', (e) => {
            if (!res.headersSent) res.sendStatus(502);
            // console.error("Proxy Error:", e.message);
        });

        // Cleanup: If browser cancels request (closes player), destroy upstream connection
        req.on('close', () => {
            proxyReq.destroy();
        });

    } catch (e) {
        if (!res.headersSent) res.status(400).send("Invalid URL");
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