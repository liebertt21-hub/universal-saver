const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs'); 
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_USER = "saya";       
const ADMIN_PASS = "rahasia123"; 

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
const limiter = rateLimit({ windowMs: 15*60*1000, max: 200 });
app.use(limiter);
app.set('trust proxy', 1);

// Middleware Admin
app.use((req, res, next) => {
    if (req.path.endsWith('admin.html') || req.path.includes('/api/stats')) {
        const auth = { login: ADMIN_USER, password: ADMIN_PASS };
        const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
        const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
        if (login && password && login === auth.login && password === auth.password) return next();
        res.set('WWW-Authenticate', 'Basic realm="Area Terlarang"');
        res.status(401).send('⛔ Akses Ditolak!');
        return;
    }
    next();
});

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); 

const STATS_FILE = 'stats.json';
if (!fs.existsSync(STATS_FILE)) {
    fs.writeFileSync(STATS_FILE, JSON.stringify({ total_requests: 0, unique_visitors: [], recent_logs: [], platforms: { tiktok: 0, youtube: 0, instagram: 0, facebook: 0 } }, null, 2));
}

function updateStats(platform, ip) {
    try {
        const data = JSON.parse(fs.readFileSync(STATS_FILE));
        data.total_requests++;
        if (data.platforms[platform] !== undefined) data.platforms[platform]++;
        if (!data.unique_visitors.includes(ip)) data.unique_visitors.push(ip);
        data.recent_logs.unshift({ time: new Date().toLocaleString('id-ID'), ip, platform });
        if (data.recent_logs.length > 50) data.recent_logs.pop();
        fs.writeFileSync(STATS_FILE, JSON.stringify(data, null, 2));
    } catch (e) {}
}

app.get('/api/stats', (req, res) => {
    try { res.json(JSON.parse(fs.readFileSync(STATS_FILE))); } 
    catch (e) { res.status(500).json({ error: "DB Error" }); }
});

// ==========================================
// MESIN DOWNLOADER: MULTI-INSTANCE COBALT
// ==========================================
const COBALT_INSTANCES = [
    'https://api.cobalt.tools',          // Instance 1 (Cadangan)
    'https://cobalt.api.kmn.my.id',      // Instance 2 (Community)
    'https://cobalt.kwiatekmiki.com',    // Instance 3 (Community)
    'https://co.wuk.sh'                  // Instance 4 (Official - Sering limit)
];

async function tryCobalt(url) {
    // Loop semua server yang ada
    for (let instance of COBALT_INSTANCES) {
        try {
            console.log(`[COBALT] Mencoba server: ${instance} untuk ${url}`);
            const response = await axios.post(`${instance}/api/json`, {
                url: url,
                vQuality: '720',
                filenamePattern: 'basic',
                isAudioOnly: false
            }, {
                headers: { 
                    'Accept': 'application/json', 
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 15000 
            });

            // Cek hasil
            if (response.data) {
                if (response.data.url) return { url: response.data.url };
                if (response.data.picker && response.data.picker[0]) return { url: response.data.picker[0].url };
            }
        } catch (e) {
            console.log(`❌ Gagal di ${instance}: ${e.message}`);
            // Lanjut ke server berikutnya di list...
        }
    }
    return null; // Semua server nyerah
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function downloadBackup(url, platform) {
    let apis = [];
    if (platform === 'tiktok') apis.push(`https://www.tikwm.com/api/?url=${url}`);
    else if (platform === 'youtube') apis.push(`https://api.ryzendesu.vip/api/downloader/ytmp4?url=${url}`);
    
    for (let apiUrl of apis) {
        try {
            const res = await axios.get(apiUrl, { headers: { 'User-Agent': USER_AGENT }, timeout: 10000 });
            const d = res.data;
            let videoUrl = null;
            let cover = null;
            if (d.data && d.data.play) { videoUrl = d.data.play; cover = d.data.cover; }
            else if (d.result && d.result.url) { videoUrl = d.result.url; cover = d.result.thumbnail; }
            if (videoUrl) return { url: videoUrl, cover: cover || "https://cdn-icons-png.flaticon.com/512/564/564619.png" };
        } catch (e) {}
    }
    return null;
}

app.get('/api/download', async (req, res) => {
    const { url } = req.query;
    const ip = req.ip;
    if (!url) return res.status(400).json({ error: 'URL Kosong' });

    let platform = 'other';
    if (url.includes('tiktok')) platform = 'tiktok';
    else if (url.includes('youtu')) platform = 'youtube';
    else if (url.includes('instagram')) platform = 'instagram';
    else if (url.includes('fb') || url.includes('facebook')) platform = 'facebook';

    // UTAMAKAN COBALT (MULTI-SERVER) UNTUK FB/IG
    let result = await tryCobalt(url);
    
    if (!result && (platform === 'tiktok' || platform === 'youtube')) {
        result = await downloadBackup(url, platform);
    }

    if (result) {
        updateStats(platform, ip);
        res.json({
            success: true,
            platform: platform,
            title: "Video Downloaded",
            cover: result.cover || "https://cdn-icons-png.flaticon.com/512/564/564619.png",
            video_hd: result.url,
            video_sd: result.url,
            music_url: null,
            images: []
        });
    } else {
        res.status(500).json({ error: 'Gagal. Server Render diblokir semua provider.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server MULTI-COBALT Ready di Port ${PORT}`);
});
