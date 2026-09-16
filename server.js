require('dotenv').config();
const express = require('express');
const path = require('path');
const storage = require('./core/storage');
const manager = require('./core/manager');
const { getTypes, getType } = require('./core/types');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

const app = express();

let instances = [];

function sanitizeForList() {
    return instances.map((i) => ({ ...i, config: { ...i.config, token: i.config.token ? storage.maskToken(i.config.token) : '' } }));
}

function sanitizeForEdit(bot) {
    if (!bot) return null;
    return { ...bot, config: { ...bot.config, token: bot.config.token || '' } };
}

function auth(req, res, next) {
    if (!ADMIN_PASSWORD) return next();
    const key = req.headers['x-admin-key'];
    if (key === ADMIN_PASSWORD) return next();
    if (req.method === 'GET' && !req.path.startsWith('/api/')) return next();
    return res.status(401).json({ ok: false, error: 'كلمة سر اللوحة مطلوبة (admin key)' });
}

app.use(auth);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
    res.json({ ok: true, uptime: process.uptime() });
});

app.get('/api/types', (req, res) => {
    res.json({ ok: true, types: getTypes() });
});

app.get('/api/bots', async (req, res) => {
    await refreshStatus();
    res.json({ ok: true, bots: sanitizeForList() });
});

app.post('/api/bots', async (req, res) => {
    const { type, name, config } = req.body || {};
    const t = getType(type);
    if (!t) return res.status(400).json({ ok: false, error: 'نوع بوت غير معروف' });
    if (!name || !String(name).trim()) return res.status(400).json({ ok: false, error: 'اكتب اسم البوت' });
    const cfg = config || {};
    for (const f of t.fields) {
        if (f.required && !cfg[f.key]) {
            return res.status(400).json({ ok: false, error: `الحقل مطلوب: ${f.label}` });
        }
    }
    const bot = {
        id: storage.newId(),
        type,
        name: String(name).trim(),
        config: cfg,
        enabled: cfg.enabled || true,
        createdAt: new Date().toISOString(),
    };
    instances.push(bot);
    await storage.saveAll(instances);
    await manager.recompute(instances);
    res.json({ ok: true, bot: sanitizeForEdit(bot) });
});

app.put('/api/bots/:id', async (req, res) => {
    const id = req.params.id;
    const bot = instances.find((b) => b.id === id);
    if (!bot) return res.status(404).json({ ok: false, error: 'البوت غير موجود' });
    const { name, config } = req.body || {};
    if (name && String(name).trim()) bot.name = String(name).trim();
    if (config) {
        const merged = { ...bot.config, ...config };
        if (config.token === '' || String(config.token).includes('…') || String(config.token).includes('***')) {
            merged.token = bot.config.token;
        }
        bot.config = merged;
    }
    await storage.saveAll(instances);
    await manager.recompute(instances);
    res.json({ ok: true, bot: sanitizeForEdit(bot) });
});

app.delete('/api/bots/:id', async (req, res) => {
    const id = req.params.id;
    instances = instances.filter((b) => b.id !== id);
    await storage.saveAll(instances);
    await manager.recompute(instances);
    res.json({ ok: true });
});

app.post('/api/bots/:id/enable', async (req, res) => {
    const id = req.params.id;
    const bot = instances.find((b) => b.id === id);
    if (!bot) return res.status(404).json({ ok: false, error: 'البوت غير موجود' });
    bot.enabled = true;
    await storage.saveAll(instances);
    await manager.recompute(instances);
    res.json({ ok: true, bot: sanitizeForEdit(bot) });
});

app.post('/api/bots/:id/disable', async (req, res) => {
    const id = req.params.id;
    const bot = instances.find((b) => b.id === id);
    if (!bot) return res.status(404).json({ ok: false, error: 'البوت غير موجود' });
    bot.enabled = false;
    await storage.saveAll(instances);
    await manager.recompute(instances);
    res.json({ ok: true, bot: sanitizeForEdit(bot) });
});

app.get('/api/logs/:type', (req, res) => {
    res.json({ ok: true, logs: manager.runningLogs(req.params.type) });
});

app.get('/api/status', async (req, res) => {
    await refreshStatus();
    const status = {};
    for (const t of ['music', 'ticket', 'server', 'separator', 'bank', 'system']) {
        status[t] = manager.isRunning(t);
    }
    res.json({ ok: true, status });
});

async function refreshStatus() {
    return Promise.resolve();
}

function startKeepAlive() {
    const selfUrl = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || '';
    if (!selfUrl) {
        console.log('لا يوجد RENDER_EXTERNAL_URL — تخطّي إبقاء الخدمة حية.');
        return;
    }
    const ping = () => {
        const headers = ADMIN_PASSWORD ? { 'x-admin-key': ADMIN_PASSWORD } : {};
        fetch(`${selfUrl}/health`, { headers })
            .then((r) => r.json())
            .then((d) => console.log(`💓 self-ping: ok=${d.ok} ts=${Date.now()}`))
            .catch((e) => console.error('self-ping فشل:', e.message));
    };
    setInterval(ping, 5 * 60 * 1000);
    console.log(`🔁 إبقاء الخدمة حية كل 5 دقائق نحو ${selfUrl}`);
}

async function boot() {
    await storage.connectMongo(process.env.MONGODB_URI || '');
    instances = await storage.loadAll();

    const activeForCache = JSON.parse(JSON.stringify(instances));
    if (activeForCache.length) {
        console.log(`وجدنا ${activeForCache.length} بوت مسجل، نقوم بتشغيل المفعّل منها...`);
        await manager.recompute(instances);
    } else {
        console.log('لوحة جديدة: ما في بوتات مسجلة بعد. أضف أول بوت من اللوحة.');
    }

    app.listen(PORT, () => {
        console.log(`🌐 لوحة التحكم تعمل على المنفذ ${PORT}`);
    });
    startKeepAlive();
}

process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e));
process.on('uncaughtException', (e) => console.error('uncaughtException:', e));
process.on('SIGTERM', () => {
    manager.shutdown();
    process.exit(0);
});
process.on('SIGINT', () => {
    manager.shutdown();
    process.exit(0);
});

boot();