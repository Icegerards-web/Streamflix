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

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

app.use(compression());
// Keep json support for other potential endpoints
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

// Serve Static Assets
app.use(express.static(path.join(__dirname, 'dist')));

// API: Chunked Upload Handler
// Accepts raw binary data for each chunk
app.post('/api/upload-chunk', express.raw({ type: 'application/octet-stream', limit: '50mb' }), async (req, res) => {
    try {
        const { id, index, total, compressed } = req.query;
        
        if (!id || index === undefined || !total) {
            return res.status(400).json({ error: "Missing upload parameters (id, index, total)" });
        }

        const chunkIndex = parseInt(index as string);
        const totalChunks = parseInt(total as string);
        const isCompressed = compressed === 'true';
        
        // We use a different temp file extension depending on if it's compressed or not
        const tempFileName = `temp_upload_${id}.${isCompressed ? 'gz' : 'json'}`;
        const tempFilePath = path.join(DATA_DIR, tempFileName);
        
        // chunk data is in req.body because of express.raw()
        const chunkData = req.body;

        if (chunkIndex === 0) {
            // First chunk: Create/Overwrite the temp file
            await fs.promises.writeFile(tempFilePath, chunkData);
        } else {
            // Subsequent chunks: Append
            await fs.promises.appendFile(tempFilePath, chunkData);
        }

        console.log(`[Server] Processed chunk ${chunkIndex + 1}/${totalChunks} for upload ${id} (Compressed: ${isCompressed})`);

        // Check if finished
        if (chunkIndex === totalChunks - 1) {
            console.log(`[Server] Upload ${id} transfer complete. Processing...`);
            
            if (isCompressed) {
                // Decompress the file
                console.log(`[Server] Decompressing...`);
                await pipeline(
                    fs.createReadStream(tempFilePath),
                    createGunzip(),
                    fs.createWriteStream(DATA_FILE)
                );
                // Clean up the temp GZ file
                await fs.promises.unlink(tempFilePath).catch(() => {});
            } else {
                // Just rename the temp file to the final file
                await fs.promises.rename(tempFilePath, DATA_FILE);
            }
            
            console.log(`[Server] Playlist updated successfully.`);
            return res.json({ success: true, complete: true });
        }

        res.json({ success: true, chunk: chunkIndex });
    } catch (err) {
        console.error("[Server] Upload error:", err);
        res.status(500).json({ error: "Failed to process chunk." });
    }
});

// API: Get Playlist
app.get('/playlist.json', async (req, res) => {
    try {
        try {
            await fs.promises.access(DATA_FILE);
        } catch {
             return res.status(404).json({ error: "No playlist found." });
        }

        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(DATA_FILE);
    } catch (e) {
        res.status(500).json({ error: "Server error reading playlist." });
    }
});

// SPA Fallback
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
    console.log(`Data Storage: ${DATA_FILE}`);
});