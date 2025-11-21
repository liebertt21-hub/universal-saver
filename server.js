const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs'); 
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
//  SETTING
// ==========================================
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
// MESIN BARU: COBALT ENGINE (Paling Kuat)
// ==========================================
async function tryCobalt(url) {
    try {
        console.log(`[COBALT] Mencoba download: ${url}`);
        const response = await axios.post('https://co.wuk.sh/api/json', {
            url: url,
            vQuality: '720',
            filenamePattern: 'basic',
            isAudioOnly: false
        }, {
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            timeout: 20000 // Kasih waktu lebih lama (20 detik)
        });

        if (response.data && response.data.url) {
            return { url: response.data.url };
        }
        if (response.data && response.data.picker) {
            return { url: response.data.picker[0].url };
        }
    } catch (e) {
        console.log(`[COBALT] Gagal: ${e.message}`);
    }
    return null;
}

// ==========================================
// CADANGAN (Backup jika Cobalt sibuk)
// ==========================================
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function downloadBackup(url, platform) {
    let apis = [];
    
    // HAPUS API YANG MATI/BLOKIR, SISAKAN YANG KUAT
    if (platform === 'tiktok') apis.push(`https://www.tikwm.com/api/?url=${url}`);
    else if (platform === 'youtube') apis.push(`https://api.ryzendesu.vip/api/downloader/ytmp4?url=${url}`); // YT Ryzen biasanya masih oke
    else if (platform === 'facebook' || platform === 'instagram') {
        // Kita coba SnapSave lagi tapi dengan header berbeda nanti
        apis.push(`https://api.ryzendesu.vip/api/downloader/snapsave?url=${url}`);
        apis.push(`https://api.ryzendesu.vip/api/downloader/fbdl?url=${url}`);
    }

    for (let apiUrl of apis) {
        try {
            console.log(`[BACKUP] Hit: ${apiUrl}`);
            const res = await axios.get(apiUrl, { headers: { 'User-Agent': USER_AGENT }, timeout: 10000 });
            const d = res.data;
            
            let videoUrl = null;
            let cover = null;

            if (d.data && d.data.play) { videoUrl = d.data.play; cover = d.data.cover; } // TikWM
            else if (d.result && d.result.hd) { videoUrl = d.result.hd; cover = d.result.thumbnail; } // Ryzen
            else if (d.result && d.result.url) { videoUrl = d.result.url; cover = d.result.thumbnail; }
            else if (d.url) videoUrl = d.url;

            if (videoUrl) return { url: videoUrl, cover: cover || "https://cdn-icons-png.flaticon.com/512/564/564619.png" };
        } catch (e) { console.log(`[BACKUP] Gagal: ${e.message}`); }
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

    // 1. COBA COBALT DULU (JALUR UTAMA)
    let result = await tryCobalt(url);
    let finalResult = null;

    if (result) {
        console.log("✅ SUKSES via Cobalt!");
        finalResult = {
            success: true, platform: platform, title: "Video Downloaded",
            cover: "https://cdn-icons-png.flaticon.com/512/564/564619.png",
            video_hd: result.url, video_sd: result.url, music_url: null, images: []
        };
    } else {
        // 2. KALAU GAGAL, BARU PAKE CADANGAN
        console.log("⚠️ Cobalt gagal, mencoba backup...");
        let backup = await downloadBackup(url, platform);
        if (backup) {
            console.log("✅ SUKSES via Backup!");
            finalResult = {
                success: true, platform: platform, title: "Video Downloaded (Backup)",
                cover: backup.cover, video_hd: backup.url, video_sd: backup.url,
                music_url: null, images: []
            };
        }
    }

    if (finalResult) {
        updateStats(platform, ip);
        res.json(finalResult);
    } else {
        // Pesan error jujur
        res.status(500).json({ error: 'Gagal. Server Render diblokir oleh Facebook/IG.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server COBALT Ready di Port ${PORT}`);
});
