const path = require('path');
const BASE = path.join(__dirname, '..');

process.env.PORT = '31002';

try {
    const payload = JSON.parse(Buffer.from(process.env.PLATFORM_PAYLOAD || '', 'base64').toString('utf8'));
    const inst = (payload.instances || [])[0];
    if (!inst) {
        console.error('لا يوجد مثيل تذاكر مهيأ.');
        process.exit(1);
    }
    const cfg = inst.config || {};

    process.env.TOKEN = cfg.token;
    process.env.GUILD_ID = cfg.guildId;
    if (cfg.mongoUri) process.env.MONGODB_URI = cfg.mongoUri;
    if (cfg.adminRoleId) process.env.ADMIN_ROLE_ID = cfg.adminRoleId;
    if (cfg.supportRoles) process.env.SUPPORT_ROLES = cfg.supportRoles;
    if (cfg.panelChannelId) process.env.PANEL_CHANNEL_ID = cfg.panelChannelId;
    if (cfg.logsChannelId) process.env.LOGS_CHANNEL_ID = cfg.logsChannelId;
    if (cfg.receiveChannelId) process.env.RECEIVE_CHANNEL_ID = cfg.receiveChannelId;
    if (cfg.categoryId) process.env.CATEGORY_ID = cfg.categoryId;

    console.log(`🚀 تشغيل بوت التذاكر (${inst.name || cfg.token}) guild=${cfg.guildId}`);
    require(path.join(BASE, 'modules', 'ticket', 'index.js'));
} catch (e) {
    console.error('خطأ في تشغيل بوت التذاكر:', e.message);
    process.exit(1);
}