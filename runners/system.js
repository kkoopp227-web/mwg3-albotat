const path = require('path');
const BASE = path.join(__dirname, '..');

process.env.PORT = '31008';

try {
    const payload = JSON.parse(Buffer.from(process.env.PLATFORM_PAYLOAD || '', 'base64').toString('utf8'));
    const inst = (payload.instances || [])[0];
    if (!inst) {
        console.error('لا يوجد مثيل بوت سستم مهيأ.');
        process.exit(1);
    }
    const cfg = inst.config || {};

    process.env.DISCORD_TOKEN = cfg.token;
    process.env.CLIENT_ID = cfg.clientId;
    process.env.GUILD_ID = cfg.guildId;
    if (cfg.slashChannelId) process.env.SLASH_CHANNEL_ID = cfg.slashChannelId;
    if (cfg.slashLogChannelId) process.env.SLASH_LOG_CHANNEL_ID = cfg.slashLogChannelId;
    if (cfg.slashRoleId) process.env.SLASH_ROLE_ID = cfg.slashRoleId;

    console.log(`🚀 تشغيل بوت السستم (${inst.name}) guild=${cfg.guildId}`);
    require(path.join(BASE, 'modules', 'system', 'index.js'));
} catch (e) {
    console.error('خطأ في تشغيل بوت السستم:', e.message);
    process.exit(1);
}