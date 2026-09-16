const path = require('path');
const BASE = path.join(__dirname, '..');

process.env.PORT = '31004';

try {
    const payload = JSON.parse(Buffer.from(process.env.PLATFORM_PAYLOAD || '', 'base64').toString('utf8'));
    const inst = (payload.instances || [])[0];
    if (!inst) {
        console.error('لا يوجد مثيل بوت فواصل مهيأ.');
        process.exit(1);
    }
    const cfg = inst.config || {};

    process.env.DISCORD_TOKEN = cfg.token;
    process.env.GUILD_ID = cfg.guildId;
    if (cfg.mongoUri) process.env.MONGO_URI = cfg.mongoUri;
    if (cfg.adminChannelId) process.env.ADMIN_CHANNEL_ID = cfg.adminChannelId;
    if (cfg.adminRoleId) process.env.ADMIN_ROLE_ID = cfg.adminRoleId;
    if (cfg.prefix) process.env.PREFIX = cfg.prefix;

    console.log(`🚀 تشغيل بوت الفواصل (${inst.name}) guild=${cfg.guildId}`);
    require(path.join(BASE, 'modules', 'separator', 'index.js'));
} catch (e) {
    console.error('خطأ في تشغيل بوت الفواصل:', e.message);
    process.exit(1);
}