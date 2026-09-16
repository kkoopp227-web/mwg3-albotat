const path = require('path');
const BASE = path.join(__dirname, '..');

process.env.PORT = '31003';

try {
    const payload = JSON.parse(Buffer.from(process.env.PLATFORM_PAYLOAD || '', 'base64').toString('utf8'));
    const inst = (payload.instances || [])[0];
    if (!inst) {
        console.error('لا يوجد مثيل بوت سيرفر مهيأ.');
        process.exit(1);
    }
    const cfg = inst.config || {};

    process.env.DISCORD_TOKEN = cfg.token;
    process.env.DISCORD_CLIENT_ID = cfg.clientId;
    process.env.DISCORD_GUILD_ID = cfg.guildId;
    if (cfg.commandChannel) process.env.COMMAND_CHANNEL = cfg.commandChannel;
    if (cfg.allowedRole) process.env.ALLOWED_ROLE = cfg.allowedRole;
    if (cfg.mongoUri) process.env.MONGO_URI = cfg.mongoUri;
    if (cfg.welcomeChannel) process.env.WELCOME_CHANNEL = cfg.welcomeChannel;
    if (cfg.boostChannel) process.env.BOOST_CHANNEL = cfg.boostChannel;
    if (cfg.logChannel) process.env.LOG_CHANNEL = cfg.logChannel;
    if (cfg.autoRole) process.env.AUTO_ROLE = cfg.autoRole;
    if (cfg.boostRole) process.env.BOOST_ROLE = cfg.boostRole;

    console.log(`🚀 تشغيل بوت أوامر السيرفر (${inst.name}) guild=${cfg.guildId}`);
    require(path.join(BASE, 'modules', 'server', 'deploy-commands.js'));
    require(path.join(BASE, 'modules', 'server', 'index.js'));
} catch (e) {
    console.error('خطأ في تشغيل بوت السيرفر:', e.message);
    process.exit(1);
}