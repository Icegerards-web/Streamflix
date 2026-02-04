import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import compression from 'compression';
import http from 'http';
import https from 'https';
import dns from 'dns';
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

// --- PERFORMANCE OPTIMIZATION: DNS CACHE ---
// Eliminates repeated DNS lookups for every video segment (saving 50-200ms per request)
const dnsCache = new Map();
const cachedLookup = (hostname, options, callback) => {
    const key = hostname;
    if (dnsCache.has(key)) {
        const { address, family } = dnsCache.get(key);
        return callback(null, address, family);
    }
    // Force IPv4 for speed and stability
    dns.lookup(hostname, { family: 4 }, (err, address, family) => {
        if (!err) dnsCache.set(key, { address, family });
        callback(err, address, family);
    });
};

// --- OPTIMIZED AGENTS ---
// Keep connections alive to reduce handshake overhead
const agentConfig = {
    keepAlive: true, 
    keepAliveMsecs: 1000,
    maxSockets: 100, // Allow high parallelism for segments
    maxFreeSockets: 10,
    timeout: 30000,
    lookup: cachedLookup // Use our DNS cache
};

const httpAgent = new http.Agent(agentConfig);
const httpsAgent = new https.Agent({ 
    ...agentConfig,
    rejectUnauthorized: false 
});

// --- SMART PROXY ---
app.get('/api/proxy', (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') return res.status(400).send('Url required');

    // Handle redirects recursively
    const doRequest = (currentUrl, redirectCount) => {
        if (redirectCount > 5) {
             if (!res.headersSent) res.status(502).send('Too many redirects');
             return;
        }

        try {
            const target = new URL(currentUrl);
            const isHttps = target.protocol === 'https:';
            const requestModule = isHttps ? https : http;
            const agent = isHttps ? httpsAgent : httpAgent;
            
            const headers = {
                // Mimic a dedicated player to avoid some browser throttling logic on upstream
                'User-Agent': 'IPTVSmartersPro/1.1.1 (iPad; iOS 14.4.2; Scale/2.00)',
                'Accept': '*/*',
                'Connection': 'keep-alive'
            };

            // Forward Range header (Critical for seeking/fast start)
            if (req.headers.range) {
                headers['Range'] = req.headers.range;
            }

            const options = {
                headers,
                agent,
                family: 4 // Force IPv4
            };

            const proxyReq = requestModule.get(currentUrl, options, (proxyRes) => {
                // Follow Redirects
                if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
                    proxyRes.resume(); 
                    let newLocation = proxyRes.headers.location;
                    if (!newLocation.startsWith('http')) {
                        try { newLocation = new URL(newLocation, currentUrl).toString(); } catch(e){}
                    }
                    return doRequest(newLocation, redirectCount + 1);
                }

                // Prepare Response Headers
                res.status(proxyRes.statusCode || 200);

                const forwardHeaders = [
                    'content-type', 'content-length', 'content-range', 'accept-ranges', 
                    'last-modified', 'etag'
                ];
                
                forwardHeaders.forEach(h => {
                    if (proxyRes.headers[h]) res.setHeader(h, proxyRes.headers[h]);
                });

                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

                const contentType = proxyRes.headers['content-type'] || '';
                const isM3U8 = contentType.includes('mpegurl') || contentType.includes('m3u8') || currentUrl.includes('.m3u8');

                if (isM3U8) {
                    // M3U8 Rewriting
                    const chunks = [];
                    proxyRes.on('data', c => chunks.push(c));
                    proxyRes.on('end', () => {
                        try {
                            const buffer = Buffer.concat(chunks);
                            const text = buffer.toString('utf8');
                            if (text.trim().startsWith('#EXTM3U')) {
                                 const baseUrl = currentUrl.substring(0, currentUrl.lastIndexOf('/') + 1);
                                 const rewritten = text.replace(/^(?!#)(?!\s)(.+)$/gm, (match) => {
                                    let line = match.trim();
                                    if (!line.startsWith('http')) {
                                        try { line = new URL(line, baseUrl).toString(); } catch(e){}
                                    }
                                    return `/api/proxy?url=${encodeURIComponent(line)}`;
                                 });
                                 res.setHeader('Content-Length', Buffer.byteLength(rewritten));
                                 res.send(rewritten);
                            } else {
                                res.write(buffer);
                                res.end();
                            }
                        } catch (e) {
                             if (!res.headersSent) res.end();
                        }
                    });
                } else {
                    // Binary Stream (MP4/MKV)
                    proxyRes.pipe(res);
                }
            });

            // CRITICAL OPTIMIZATION: Disable Nagle's algorithm
            // Forces packets to be sent immediately without buffering.
            proxyReq.on('socket', (socket) => {
                socket.setNoDelay(true);
            });

            proxyReq.on('error', (err) => {
                 if (err.code !== 'ECONNRESET' && !res.headersSent) {
                     res.status(502).send('Gateway Error');
                 }
            });
            
            req.on('close', () => {
                if (!proxyReq.destroyed) proxyReq.destroy();
            });

        } catch (e) {
             if (!res.headersSent) res.status(400).send('Invalid URL');
        }
    };

    doRequest(url, 0);
});

// API: Upload Chunk
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