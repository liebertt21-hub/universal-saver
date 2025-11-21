const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs'); 
const rateLimit = require('express-rate-limit'); // Library Anti-Spam
const helmet = require('helmet'); // Library Keamanan Header

const app = express();

// === BAGIAN INI PENTING AGAR JALAN DI RENDER ===
const PORT = process.env.PORT || 3000; 
// ===============================================

// ==========================================
//  SETTING KEAMANAN & PASSWORD
// ==========================================
const ADMIN_USER = "saya";       
const ADMIN_PASS = "rahasia123"; 

// 1. HELMET: Mengamankan Header HTTP
app.use(helmet({
    contentSecurityPolicy: false, 
    crossOriginEmbedderPolicy: false
}));

// 2. RATE LIMITER: Mencegah DDoS / Spam Klik
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 menit
    max: 100, // Maksimal 100 request per IP
    message: {
        error: "⛔ Santai dulu bang! Kamu terlalu sering request. Coba lagi nanti."
    },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

// 3. TRUST PROXY: Wajib untuk Render/Cloudflare agar IP terbaca
app.set('trust proxy', 1);

// Middleware Login Admin
app.use((req, res, next) => {
    if (req.path.endsWith('admin.html') || req.path.includes('/api/stats')) {
        const auth = { login: ADMIN_USER, password: ADMIN_PASS };
        const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
        const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
        if (login && password && login === auth.login && password === auth.password) {
            return next();
        }
        res.set('WWW-Authenticate', 'Basic realm="Area Terlarang"');
        res.status(401).send('⛔ Akses Ditolak!');
        return;
    }
    next();
});

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); 

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const STATS_FILE = 'stats.json';

// ==========================================
// 1. SISTEM STATISTIK
// ==========================================
if (!fs.existsSync(STATS_FILE)) {
    const initialData = {
        total_requests: 0,
        unique_visitors: [],
        recent_logs: [],
        platforms: { tiktok: 0, youtube: 0, instagram: 0, facebook: 0 }
    };
    fs.writeFileSync(STATS_FILE, JSON.stringify(initialData, null, 2));
}

function updateStats(platform, ip) {
    try {
        const rawData = fs.readFileSync(STATS_FILE);
        const data = JSON.parse(rawData);
        data.total_requests++;
        if (data.platforms[platform] !== undefined) data.platforms[platform]++;
        if (!data.unique_visitors.includes(ip)) data.unique_visitors.push(ip);
        const newLog = { time: new Date().toLocaleString('id-ID'), ip: ip, platform: platform };
        data.recent_logs.unshift(newLog);
        if (data.recent_logs.length > 50) data.recent_logs.pop();
        fs.writeFileSync(STATS_FILE, JSON.stringify(data, null, 2));
    } catch (e) { console.error("Error stats:", e.message); }
}

app.get('/api/stats', (req, res) => {
    try {
        if (!fs.existsSync(STATS_FILE)) {
            return res.json({ total_requests: 0, unique_visitors: [], recent_logs: [], platforms: {} });
        }
        const rawData = fs.readFileSync(STATS_FILE);
        res.json(JSON.parse(rawData));
    } catch (e) { res.status(500).json({ error: "Database Error" }); }
});

// ==========================================
// 2. HELPER FUNCTIONS (FIX GAMBAR)
// ==========================================
const FALLBACK_IMAGES = {
    tiktok: "https://cdn-icons-png.flaticon.com/512/3046/3046121.png",
    youtube: "https://cdn-icons-png.flaticon.com/512/1384/1384060.png", 
    instagram: "https://cdn-icons-png.flaticon.com/512/2111/2111463.png",
    facebook: "https://cdn-icons-png.flaticon.com/512/733/733547.png",
    default: "https://cdn-icons-png.flaticon.com/512/564/564619.png"
};

function findBestImage(obj, platform) {
    const isValid = (s) => typeof s === 'string' && s.length > 10 && (s.startsWith('http') || s.startsWith('//'));

    // Cek Struktur Array
    if (Array.isArray(obj.result) && obj.result[0]) {
        if (isValid(obj.result[0].thumbnail)) return obj.result[0].thumbnail;
        if (isValid(obj.result[0].thumb)) return obj.result[0].thumb;
        if (isValid(obj.result[0].cover)) return obj.result[0].cover;
        if (isValid(obj.result[0].image)) return obj.result[0].image;
    }
    if (Array.isArray(obj.data) && obj.data[0]) {
        if (isValid(obj.data[0].thumbnail)) return obj.data[0].thumbnail;
        if (isValid(obj.data[0].thumb)) return obj.data[0].thumb;
        if (isValid(obj.data[0].cover)) return obj.data[0].cover;
        if (isValid(obj.data[0].image)) return obj.data[0].image;
    }

    // Cek Struktur Object
    if (obj.result && typeof obj.result === 'object') {
        if (isValid(obj.result.thumbnail)) return obj.result.thumbnail;
        if (isValid(obj.result.thumb)) return obj.result.thumb;
        if (isValid(obj.result.cover)) return obj.result.cover;
        if (isValid(obj.result.image)) return obj.result.image;
    }
    if (obj.data && typeof obj.data === 'object') {
        if (isValid(obj.data.cover)) return obj.data.cover;
        if (isValid(obj.data.thumbnail)) return obj.data.thumbnail;
        if (isValid(obj.data.thumb)) return obj.data.thumb;
    }

    // Cek Root Level
    if (isValid(obj.thumbnail)) return obj.thumbnail;
    if (isValid(obj.thumb)) return obj.thumb;
    if (isValid(obj.cover)) return obj.cover;
    if (isValid(obj.image)) return obj.image;
    if (isValid(obj.picture)) return obj.picture;
    if (isValid(obj.preview)) return obj.preview;
    
    if (obj.video) {
        if (isValid(obj.video.thumb)) return obj.video.thumb;
        if (isValid(obj.video.thumbnail)) return obj.video.thumbnail;
    }

    if (platform.includes('tiktok')) return FALLBACK_IMAGES.tiktok;
    if (platform.includes('youtu')) return FALLBACK_IMAGES.youtube;
    if (platform.includes('instagram')) return FALLBACK_IMAGES.instagram;
    if (platform.includes('facebook')) return FALLBACK_IMAGES.facebook;
    return FALLBACK_IMAGES.default;
}

async function getYouTubeAudio(url) {
    try {
        const res = await axios.get(`https://api.ryzendesu.vip/api/downloader/ytmp3?url=${url}`);
        if (res.data.url) return res.data.url;
    } catch (e) {}
    return null;
}

function scanForVideoUrl(data) {
    if (!data) return null;
    if (data.result && data.result.hd) return data.result.hd;
    if (data.result && data.result.sd) return data.result.sd;
    if (Array.isArray(data.data)) { 
        let best = data.data.find(x => x.quality && (x.quality.includes('720') || x.quality.includes('HD')));
        if (!best) best = data.data.find(x => x.url);
        if (best && best.url) return best.url;
    }
    if (Array.isArray(data.result)) { 
        let best = data.result.find(x => x.url && x.url.includes('mp4'));
        if (best) return best.url;
        if (data.result[0] && data.result[0].url) return data.result[0].url;
    }
    if (data.url && data.url.startsWith('http')) return data.url;
    if (data.result && data.result.url) return data.result.url;
    return null;
}

// ==========================================
// 3. DOWNLOADERS
// ==========================================

async function downloadTikTok(url, ip) {
    try {
        const response = await axios.get(`https://www.tikwm.com/api/?url=${url}`);
        const data = response.data;
        if (data.code === 0) {
            updateStats('tiktok', ip);
            return {
                success: true, platform: 'tiktok', type: 'video',
                title: data.data.title, cover: data.data.cover,
                video_sd: data.data.play, video_hd: data.data.hdplay,
                music_url: data.data.music, images: data.data.images || []
            };
        }
    } catch (e) {}
    return null;
}

async function downloadYouTube(url, ip) {
    try {
        const apis = [`https://widipe.com/download/ytdl?url=${url}`, `https://api.ryzendesu.vip/api/downloader/ytmp4?url=${url}`];
        for (let apiUrl of apis) {
            try {
                const res = await axios.get(apiUrl, { headers: { 'User-Agent': USER_AGENT } });
                const d = res.data;
                let videoUrl = null, musicUrl = null;
                if (d.result && d.result.mp4) { videoUrl = d.result.mp4; musicUrl = d.result.mp3; }
                else if (d.url) videoUrl = d.url;
                
                if (!musicUrl) musicUrl = await getYouTubeAudio(url);
                
                if (videoUrl) {
                    updateStats('youtube', ip);
                    return {
                        success: true, platform: 'youtube', type: 'video',
                        title: d.title || "YouTube Video", cover: findBestImage(d, 'youtube'),
                        video_hd: videoUrl, video_sd: null,
                        music_url: musicUrl, images: []
                    };
                }
            } catch (e) {}
        }
    } catch (e) {}
    return null;
}

async function downloadIgFb(url, ip) {
    let finalUrl = url;
    if (finalUrl.includes('?')) finalUrl = finalUrl.split('?')[0];

    const platform = (finalUrl.includes('facebook') || finalUrl.includes('fb.watch') || finalUrl.includes('fb.com') || finalUrl.includes('share')) ? 'facebook' : 'instagram';
    
    const apis = [];
    if (platform === 'facebook') {
        apis.push(`https://api.ryzendesu.vip/api/downloader/snapsave?url=${finalUrl}`);
        apis.push(`https://widipe.com/download/facebook?url=${finalUrl}`);
        apis.push(`https://api.ryzendesu.vip/api/downloader/fbdl?url=${finalUrl}`);
        apis.push(`https://aemt.me/download/fbdl?url=${finalUrl}`);
        apis.push(`https://api.tiklydown.eu.org/api/download?url=${finalUrl}`);
    } else {
        apis.push(`https://api.ryzendesu.vip/api/downloader/igdl?url=${finalUrl}`);
        apis.push(`https://widipe.com/download/igdl?url=${finalUrl}`);
    }

    for (let apiUrl of apis) {
        try {
            console.log(`[${platform}] Coba API: ${apiUrl}`);
            const res = await axios.get(apiUrl, { headers: { 'User-Agent': USER_AGENT }, timeout: 12000 });
            const videoUrl = scanForVideoUrl(res.data);

            if (videoUrl) {
                console.log("✅ SUKSES!");
                updateStats(platform, ip);
                
                let title = res.data.caption || res.data.title || `Video ${platform}`;
                if (res.data.data && res.data.data.title) title = res.data.data.title;
                let coverImg = findBestImage(res.data, platform);

                return {
                    success: true, platform: platform, type: 'video',
                    title: title, cover: coverImg,
                    video_hd: videoUrl, video_sd: videoUrl, music_url: null, images: []
                };
            }
        } catch (e) { console.log(`❌ Gagal API: ${e.message}`); }
    }
    return null;
}

app.get('/api/download', async (req, res) => {
    const { url } = req.query;
    let userIp = req.ip || req.connection.remoteAddress;
    if (userIp.substr(0, 7) == "::ffff:") userIp = userIp.substr(7);

    if (!url) return res.status(400).json({ error: 'URL kosong' });

    let result = null;
    if (url.includes('tiktok.com')) result = await downloadTikTok(url, userIp);
    else if (url.includes('youtu')) result = await downloadYouTube(url, userIp);
    else if (url.includes('instagram.com') || url.includes('facebook.com') || url.includes('fb.watch') || url.includes('fb.com') || url.includes('/share/')) result = await downloadIgFb(url, userIp);
    
    if (result) {
        if (result.images && result.images.length > 0) result.type = 'image';
        res.json(result);
    } else {
        res.status(500).json({ error: 'Gagal download.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server AMAN SIAP di PORT ${PORT}`);
});