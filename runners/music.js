const { spawn } = require('child_process');
const path = require('path');
const SINGLE = path.join(__dirname, 'music-instance.js');
const CWD = path.join(__dirname, '..');

let payload;
try {
    payload = JSON.parse(Buffer.from(process.env.PLATFORM_PAYLOAD || '', 'base64').toString('utf8'));
} catch (e) {
    console.error('خطأ في تحليل البيانات:', e.message);
    process.exit(1);
}

const instances = payload.instances || [];
const children = new Map();

function spawnInstance(inst) {
    const cfg = inst.config || {};
    const label = (cfg.label && String(cfg.label).trim())
        ? String(cfg.label).replace(/^[#@]+/, '').trim()
        : (inst.name || inst.id);
    const onePayload = Buffer.from(JSON.stringify({ instances: [inst] })).toString('base64');
    const env = { ...process.env, PLATFORM_PAYLOAD: onePayload };
    if (cfg.port) env.PORT = String(cfg.port);
    const child = spawn(process.execPath, [SINGLE], {
        cwd: CWD,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    });
    children.set(inst.id, { child, inst, label });
    const prefix = `[${label}]`;
    child.stdout.on('data', (d) => {
        const lines = String(d).split('\n');
        for (const l of lines) {
            if (l.trim()) process.stdout.write(`${prefix} ${l}\n`);
        }
    });
    child.stderr.on('data', (d) => {
        const lines = String(d).split('\n');
        for (const l of lines) {
            if (l.trim()) process.stderr.write(`${prefix} ${l}\n`);
        }
    });
    child.on('exit', (code, signal) => {
        console.error(`${prefix} ⛔ توقف (code=${code} signal=${signal || ''})`);
        children.delete(inst.id);
        if (inst.enabled && code !== 0 && code !== null) {
            console.log(`${prefix} 🔄 إعادة تشغيل تلقائية بعد 5 ثواني...`);
            setTimeout(() => spawnInstance(inst), 5000);
        }
    });
    child.on('error', (e) => {
        console.error(`${prefix} ❌ فشل التشغيل: ${e.message}`);
    });
    console.log(`${prefix} 🚀 تشغيل بوت أغاني في عملية منفصلة`);
}

for (const inst of instances) {
    spawnInstance(inst);
}

console.log(`🚀 تشغيل بوتات النوع (music) — ${instances.length} مثيل (${instances.length} عمليات منفصلة)`);

process.on('SIGTERM', () => {
    for (const [, { child, label }] of children) {
        console.log(`[${label}] ⏹️ إيقاف...`);
        try { child.kill('SIGTERM'); } catch (e) { /* تجاهل */ }
    }
    setTimeout(() => process.exit(0), 1000);
});
