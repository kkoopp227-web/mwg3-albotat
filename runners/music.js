const path = require('path');
const BASE = path.join(__dirname, '..');

process.env.PORT = '31001';

const { createMusicBot, ensureYtdlp } = require(path.join(BASE, 'modules', 'music', 'musicBot.js'));

function buildAliases(name) {
    const stripped = String(name || '').replace(/^[#@]+/, '').toLowerCase().trim();
    const set = new Set();
    if (name) set.add(String(name).toLowerCase());
    if (stripped) {
        set.add(stripped);
        set.add('#' + stripped);
        set.add('@' + stripped);
    }
    return [...set];
}

const handles = [];

async function main(payload) {
    const { instances } = payload;
    const ok = await ensureYtdlp();
    if (!ok) console.error('تحذير: فشل تحضير yt-dlp — الأغاني لن تعمل على هذا الجهاز.');

    for (let i = 0; i < instances.length; i++) {
        const inst = instances[i];
        const cfg = inst.config || {};
        const label = (cfg.label && String(cfg.label).trim())
            ? String(cfg.label).replace(/^[#@]+/, '').trim()
            : (inst.name || 'بوت أغاني');
        if (!label) { console.error(`[${inst.name}] اختصار فارغ — تم تجاهله.`); continue; }
        const allowedGuildIds = (cfg.guildId || process.env.ALLOWED_GUILD_ID || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        const allowedRoleId = cfg.allowedRoleId || process.env.CONTROL_ROLE_ID || '1548382659586166804';
        try {
            const handle = createMusicBot({
                label,
                voiceGroup: `music-${inst.id || i}`,
                aliases: buildAliases(label),
                token: cfg.token,
                stay247: cfg.stay247 !== false,
                forceChannelId: cfg.roomId,
                allowedGuildIds,
                allowedRoleId,
            });
            await handle.client.login(cfg.token);
            handles.push(handle);
            console.log(`[${label}] تسجيل الدخول ناجح ✅ (room=${cfg.roomId})`);
        } catch (e) {
            console.error(`[${label}] فشل التسجيل: ${e.message}`);
        }
    }
}

process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e));
process.on('uncaughtException', (e) => console.error('uncaughtException:', e));
process.on('SIGTERM', () => {
    for (const h of handles) {
        try { h.destroy(); } catch (e) { /* تجاهل */ }
    }
    process.exit(0);
});

try {
    const payload = JSON.parse(Buffer.from(process.env.PLATFORM_PAYLOAD || '', 'base64').toString('utf8'));
    main(payload);
} catch (e) {
    console.error('خطأ في تحليل البيانات:', e.message);
    process.exit(1);
}
