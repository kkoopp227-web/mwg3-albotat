const path = require('path');
const BASE = path.join(__dirname, '..');

process.env.PORT = '31005';

try {
    const payload = JSON.parse(Buffer.from(process.env.PLATFORM_PAYLOAD || '', 'base64').toString('utf8'));
    const inst = (payload.instances || [])[0];
    if (!inst) {
        console.error('لا يوجد مثيل بوت بنك مهيأ.');
        process.exit(1);
    }
    const cfg = inst.config || {};

    process.env.TOKEN = cfg.token;
    if (cfg.guildId) process.env.GUILD_ID = cfg.guildId;
    if (cfg.channelId) process.env.CHANNEL_ID = cfg.channelId;
    if (cfg.adminRoleId) process.env.ADMIN_ROLE_ID = cfg.adminRoleId;
    if (cfg.logChannelId) process.env.LOG_CHANNEL_ID = cfg.logChannelId;
    if (cfg.mongoUri) process.env.MONGO_URI = cfg.mongoUri;
    if (cfg.vipRoleId) process.env.VIP_ROLE_ID = cfg.vipRoleId;
    if (cfg.prefix) process.env.PREFIX = cfg.prefix;

    console.log(`🚀 تشغيل بوت البنك (${inst.name}) guild=${cfg.guildId || '-'}`);
    require(path.join(BASE, 'modules', 'bank', 'index.js'));
} catch (e) {
    console.error('خطأ في تشغيل بوت البنك:', e.message);
    process.exit(1);
}