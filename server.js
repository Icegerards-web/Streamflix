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
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
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

// API: Robust Chunked Upload
app.post('/api/upload-chunk', express.raw({ type: 'application/octet-stream', limit: '50mb' }), async (req, res) => {
    try {
        const { id, index, total, compressed } = req.query;
        if (!id || index === undefined || !total) return res.status(400).json({ error: "Missing parameters" });

        const chunkIndex = parseInt(index);
        const totalChunks = parseInt(total);
        const isCompressed = compressed === 'true';
        
        // Save chunk as a separate file: "upload_ID_part_INDEX"
        const chunkFileName = `upload_${id}_part_${chunkIndex}`;
        const chunkFilePath = path.join(DATA_DIR, chunkFileName);
        
        fs.writeFileSync(chunkFilePath, req.body);
        
        // If this is the last chunk, perform the merge
        if (chunkIndex === totalChunks - 1) {
            console.log(`[Server] Received final chunk for ${id}. Starting merge of ${totalChunks} parts...`);
            
            // 1. Verify all parts exist
            for (let i = 0; i < totalChunks; i++) {
                if (!fs.existsSync(path.join(DATA_DIR, `upload_${id}_part_${i}`))) {
                    return res.status(400).json({ error: `Missing part ${i}` });
                }
            }

            // 2. Merge parts into one temp file
            const tempCompleteFile = path.join(DATA_DIR, `upload_${id}_complete.tmp`);
            const writeStream = fs.createWriteStream(tempCompleteFile);

            for (let i = 0; i < totalChunks; i++) {
                const partPath = path.join(DATA_DIR, `upload_${id}_part_${i}`);
                const data = fs.readFileSync(partPath);
                writeStream.write(data);
                fs.unlinkSync(partPath); // Delete part after merging
            }
            writeStream.end();

            await new Promise((resolve, reject) => {
                writeStream.on('finish', resolve);
                writeStream.on('error', reject);
            });

            // 3. Decompress or Rename to final playlist.json
            if (isCompressed) {
                console.log(`[Server] Decompressing ${id}...`);
                try {
                    await pipeline(
                        fs.createReadStream(tempCompleteFile),
                        createGunzip(),
                        fs.createWriteStream(DATA_FILE)
                    );
                    fs.unlinkSync(tempCompleteFile);
                } catch (err) {
                    console.error("Decompression failed:", err);
                    if(fs.existsSync(tempCompleteFile)) fs.unlinkSync(tempCompleteFile);
                    return res.status(500).json({ error: "Decompression failed on server" });
                }
            } else {
                console.log(`[Server] Renaming ${id} to playlist.json...`);
                if (fs.existsSync(DATA_FILE)) fs.unlinkSync(DATA_FILE);
                fs.renameSync(tempCompleteFile, DATA_FILE);
            }

            console.log(`[Server] Upload ${id} complete.`);
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