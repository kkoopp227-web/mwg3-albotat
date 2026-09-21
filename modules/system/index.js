require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    PermissionsBitField, 
    SlashCommandBuilder, 
    REST, 
    Routes,
    ChannelType,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    RoleSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    AuditLogEvent,
    OverwriteType
} = require('discord.js');

// --- إعداد خادم ويب لتشغيل البوت على Render ---
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot is online! ✅'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[WEB] Server is listening on port ${PORT}`));
// -------------------------------------------

// مخزن مؤقت لحالات الإعدادات
const settingsState = new Map();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ملف الصلاحيات
const permsPath = path.join(__dirname, 'permissions.json');
let rolePerms = {};
try {
    rolePerms = JSON.parse(fs.readFileSync(permsPath, 'utf8'));
} catch (e) {
    rolePerms = {};
}

function savePerms() {
    fs.writeFileSync(permsPath, JSON.stringify(rolePerms, null, 2));
}

// ملف الإحصائيات
const statsPath = path.join(__dirname, 'stats.json');
let userStats = {};
try {
    userStats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
} catch (e) { userStats = {}; }

function saveStats() {
    fs.writeFileSync(statsPath, JSON.stringify(userStats, null, 2));
}

function addStat(userId, type, executorTag) {
    if (!userStats[userId]) userStats[userId] = { timeout: 0, mute: 0, warn: 0, history: [] };
    if (!userStats[userId].history) userStats[userId].history = [];
    
    userStats[userId][type] = (userStats[userId][type] || 0) + 1;
    
    const typeMap = { 'timeout': 'اسكات', 'mute': 'ميوت صوتي', 'warn': 'تحذير' };
    const entry = {
        type: typeMap[type] || type,
        executor: executorTag,
        date: new Date().toLocaleString('ar-EG')
    };
    
    userStats[userId].history.unshift(entry);
    if (userStats[userId].history.length > 3) userStats[userId].history.pop();
    
    saveStats();
}



// ملف السجلات (Logs)
const logsPath = path.join(__dirname, 'logs.json');
let logChannels = {};
try {
    logChannels = JSON.parse(fs.readFileSync(logsPath, 'utf8'));
} catch (e) { logChannels = {}; }

function saveLogs() {
    fs.writeFileSync(logsPath, JSON.stringify(logChannels, null, 2));
}

// ملف إعدادات قنوات السجن
const jailConfigPath = path.join(__dirname, 'jail_config.json');
let jailChannels = {};
try {
    jailChannels = JSON.parse(fs.readFileSync(jailConfigPath, 'utf8'));
} catch (e) { jailChannels = {}; }

function saveJailConfig() {
    fs.writeFileSync(jailConfigPath, JSON.stringify(jailChannels, null, 2));
}

// ملف تخزين رتب المسجونين لاستعادتها
const jailedRolesPath = path.join(__dirname, 'jailed_roles.json');
let jailedRoles = {};
try {
    jailedRoles = JSON.parse(fs.readFileSync(jailedRolesPath, 'utf8'));
} catch (e) { jailedRoles = {}; }

function saveJailedRoles() {
    fs.writeFileSync(jailedRolesPath, JSON.stringify(jailedRoles, null, 2));
}

// ===== خيار نظامه: نظام العقوبات المخصص =====
const customSysPath = path.join(__dirname, 'custom_system.json');
let customSys = {};
try {
    customSys = JSON.parse(fs.readFileSync(customSysPath, 'utf8'));
} catch (e) { customSys = {}; }

function saveCustomSys() {
    fs.writeFileSync(customSysPath, JSON.stringify(customSys, null, 2));
}

// خيارات النظام المسموح بها (بدون التحذير)
const CS_OPTIONS = {
    jail: { label: '⛓️ السجن', category: 'jail', perm: PermissionsBitField.Flags.ManageRoles },
    kick: { label: '👞 الطرد', category: 'kick', perm: PermissionsBitField.Flags.KickMembers },
    ban: { label: '🚫 الباند', category: 'ban', perm: PermissionsBitField.Flags.BanMembers },
    mute: { label: '🎙️ الميوت الصوتي', category: 'timeout', perm: PermissionsBitField.Flags.MuteMembers }
};
const CS_ALL_OPTIONS = ['jail', 'kick', 'ban', 'mute'];

function getCustomSys(guildId) {
    return customSys[guildId] || { word: 'سجن', options: CS_ALL_OPTIONS.slice() };
}

function csPanelEmbed(guildId) {
    const cfg = getCustomSys(guildId);
    const optsList = cfg.options.map(o => CS_OPTIONS[o] ? CS_OPTIONS[o].label : o).join('، ') || 'لا توجد خيارات';
    return new EmbedBuilder()
        .setTitle('⚙️ نظام العقوبات المخصص (خيار نظامه)')
        .setDescription(
            `**الكلمة:** \`${cfg.word.toLowerCase()}\`\n` +
            `**الخيارات المفعّلة:** ${optsList}\n\n` +
            `عند كتابة **${cfg.word.toLowerCase()} + منشن العضو** في أي شات، يعرض البوت قائمة العقوبات، ومن يختار خياراً تُطبَّق العقوبة فوراً.\n` +
            `فقط الأعضاء الذين لديهم رتب الصلاحيات (المحددة في لوحة الصلاحيات) لكل نوع عقوبة يستطيعون اختياره.\n` +
            `⚠️ **التحذير غير مدرج** في خيارات النظام.`
        )
        .setColor(0x9b59b6)
        .setTimestamp();
}

function csPanelRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cs_change_word').setLabel('تغيير الكلمة').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cs_set_options').setLabel('تعديل الخيارات').setStyle(ButtonStyle.Secondary)
    );
}

async function applyCustomPunishment(guild, executorMember, target, option, dur) {
    const executorId = executorMember.id;
    if (target.id === executorId) throw new Error('لا يمكنك تطبيق العقوبة على نفسك!');
    if (target.id === guild.ownerId) throw new Error('لا يمكنك تطبيق عقوبة على مالك السيرفر!');
    if (target.roles.highest.position >= executorMember.roles.highest.position && executorId !== guild.ownerId) {
        throw new Error('لا يمكنك تطبيق عقوبة على عضو برتبة أعلى منك أو مساوية لك!');
    }
    const reason = 'عبر نظام العقوبات المخصص';

    if (option === 'jail') {
        const config = jailChannels[guild.id] || {};
        let jailRole = config.roleId ? guild.roles.cache.get(config.roleId) : guild.roles.cache.find(r => r.name.toLowerCase() === 'jail' || r.name === 'سجن' || r.name === 'Sجن');
        if (!jailRole) jailRole = await guild.roles.create({ name: 'Sجن', color: 0x34495e });
        const oldRoles = target.roles.cache.filter(r => r.name !== '@everyone' && r.id !== jailRole.id).map(r => r.id);
        jailedRoles[target.id] = oldRoles;
        saveJailedRoles();
        await target.roles.set([jailRole]);
        await target.timeout(null).catch(() => {});
        await applyJail(target);
        addStat(target.id, 'jail', executorMember.user.tag);
        punishmentExecutors[target.id] = {
            executorId,
            type: 'jail',
            expiresAt: dur ? Date.now() + (dur * 24 * 60 * 60000) : null
        };
        savePunishments();
        sendLog(guild, 'jail', createLogEmbed('⛓️ سجل سجن (نظام)', target, executorMember.user.tag, reason, dur ? `${dur} يوم` : null));
        return `⚖️ تم سجن ${target}` + (dur ? `\n**المدة:** ${dur} يوم` : '');
    }

    if (option === 'kick') {
        if (!target.kickable) throw new Error('لا يمكنني طرد هذا العضو!');
        await target.kick(reason);
        sendLog(guild, 'kick', createLogEmbed('👞 سجل طرد (نظام)', target, executorMember.user.tag, reason));
        return `👞 تم طرد ${target}`;
    }

    if (option === 'ban') {
        if (!target.bannable) throw new Error('لا يمكنني حظر هذا العضو!');
        await guild.bans.create(target.id, { reason, deleteMessageSeconds: 7 * 24 * 60 * 60 });
        sendLog(guild, 'ban', createLogEmbed('🚫 سجل حظر (نظام)', target, executorMember.user.tag, reason));
        return `🚫 تم حظر ${target}`;
    }

    if (option === 'mute') {
        if (!target.voice.channel) throw new Error('العضو يجب أن يكون في روم صوتي!');
        const freshMember = await guild.members.fetch(target.id);
        if (!freshMember.voice.channel) throw new Error('العضو يجب أن يكون في روم صوتي!');
        if (freshMember.voice.serverMute) throw new Error('هذا العضو عنده ميوت صوتي بالفعل!');
        await freshMember.voice.setMute(true);
        addStat(target.id, 'mute', executorMember.user.tag);
        if (dur) {
            setTimeout(async () => {
                try {
                    const m = await guild.members.fetch(target.id);
                    if (m && m.voice.channel) await m.voice.setMute(false).catch(() => {});
                } catch (e) {}
            }, dur * 60000);
        }
        punishmentExecutors[target.id] = {
            executorId,
            type: 'mute',
            expiresAt: dur ? Date.now() + (dur * 60000) : null
        };
        savePunishments();
        sendLog(guild, 'mute', createLogEmbed('🎙️ سجل ميوت صوتي (نظام)', target, executorMember.user.tag, reason, dur ? `${dur} دقيقة` : null));
        return `🎙️ تم الميوت الصوتي لـ ${target}` + (dur ? `\n**المدة:** ${dur} دقيقة` : '');
    }

    throw new Error('خيار عقوبة غير معروف!');
}

// ملف إعدادات السيرفر العامة
const serverSettingsPath = path.join(__dirname, 'server_settings.json');
let serverSettings = {};
try {
    serverSettings = JSON.parse(fs.readFileSync(serverSettingsPath, 'utf8'));
} catch (e) { serverSettings = {}; }

function saveServerSettings() {
    fs.writeFileSync(serverSettingsPath, JSON.stringify(serverSettings, null, 2));
}

// ملف تخزين منفذي العقوبات
const punishmentsPath = path.join(__dirname, 'punishment_executors.json');
let punishmentExecutors = {};
try {
    punishmentExecutors = JSON.parse(fs.readFileSync(punishmentsPath, 'utf8'));
} catch (e) { punishmentExecutors = {}; }

function savePunishments() {
    fs.writeFileSync(punishmentsPath, JSON.stringify(punishmentExecutors, null, 2));
}

// ملف الأسباب الجاهزة (Presets)
const presetsPath = path.join(__dirname, 'presets.json');
let moderationPresets = {};
try {
    moderationPresets = JSON.parse(fs.readFileSync(presetsPath, 'utf8'));
} catch (e) { moderationPresets = {}; }

function savePresets() {
    fs.writeFileSync(presetsPath, JSON.stringify(moderationPresets, null, 2));
}

async function sendLog(guild, type, embed) {
    const channelId = logChannels[guild.id]?.[type];
    if (!channelId) return;
    const channel = guild.channels.cache.get(channelId);
    if (channel) {
        await channel.send({ embeds: [embed] }).catch(() => {});
    }
}

// دالة إخفاء جميع الرومات عن المسجون وفتح قنوات السجن المحددة له
async function applyJail(member) {
    const config = jailChannels[member.guild.id] || {};
    const channels = member.guild.channels.cache;
    
    // إضافة رتبة السجن إذا كانت محددة
    if (config.roleId) {
        await member.roles.add(config.roleId).catch(() => {});
    }

    const promises = channels.map(channel => {
        if (!channel.permissionOverwrites) return Promise.resolve();
        
        if (channel.id === config.textId || channel.id === config.voiceId) {
            return channel.permissionOverwrites.edit(member.id, { 
                ViewChannel: true, 
                SendMessages: true, 
                Connect: true,
                Speak: true 
            }).catch(() => {});
        } else {
            return channel.permissionOverwrites.edit(member.id, { ViewChannel: false }).catch(() => {});
        }
    });
    
    await Promise.all(promises);
}

// دالة إظهار الرومات للمسجون (عند العفو)
async function removeJail(member) {
    const config = jailChannels[member.guild.id] || {};
    if (config.roleId) {
        await member.roles.remove(config.roleId).catch(() => {});
    }

    const channels = member.guild.channels.cache;
    const promises = channels.map(channel => {
        if (channel.permissionOverwrites) {
            return channel.permissionOverwrites.delete(member.id).catch(() => {});
        }
        return Promise.resolve();
    });
    await Promise.all(promises);
}

// دالة لوق أوامر السلاش
async function sendSlashLog(guild, action, executor, details) {
    const logChannelId = process.env.SLASH_LOG_CHANNEL_ID;
    if (!logChannelId || logChannelId === 'ضع_الايدي_هنا') return;
    const channel = guild.channels.cache.get(logChannelId);
    if (!channel) return;
    const embed = new EmbedBuilder()
        .setTitle(`📋 سجل السلاش — ${action}`)
        .addFields(
            { name: '👮 المسؤول:', value: `${executor}`, inline: true },
            { name: '📝 التفاصيل:', value: `${details}`, inline: false }
        )
        .setColor(0x5865f2)
        .setTimestamp();
    await channel.send({ embeds: [embed] }).catch(() => {});
}

function createLogEmbed(title, target, executor, reason, duration = null) {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .addFields(
            { name: '👤 العضو:', value: `${target}`, inline: false },
            { name: '👮 المسؤول:', value: `${executor}`, inline: true },
            { name: '📝 السبب:', value: `${reason}`, inline: true }
        )
        .setTimestamp()
        .setColor(0x2f3136);
    if (duration) embed.addFields({ name: '⏳ المدة:', value: `${duration}`, inline: true });
    return embed;
}

// دالة التحقق من الصلاحيات (إما صلاحية دسكورد أو رتبة مضافة)
function hasPermission(member, category, discordPerm) {
    if (member.permissions.has(discordPerm)) return true;
    const guildRoles = rolePerms[member.guild.id]?.[category] || [];
    return member.roles.cache.some(role => guildRoles.includes(role.id));
}

// تعريف الأوامر
const commands = [
    new SlashCommandBuilder().setName('اوامر').setDescription('لوحة التحكم في صلاحيات الرتب'),
    // ... بقية الأوامر تم تعريفها مسبقاً في REST ...
].map(command => command.toJSON());

const slashCommands = [
    new SlashCommandBuilder().setName('اوامر').setDescription('لوحة التحكم في صلاحيات الرتب'),
    new SlashCommandBuilder().setName('اعدادات').setDescription('إعدادات رومات وشاتات السيرفر'),
    new SlashCommandBuilder().setName('معلومات_كامله').setDescription('دليل شامل لاستخدام وشرح أوامر وإعدادات البوت'),
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('جاري تحديث أوامر الـ Slash...');
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: slashCommands });
        console.log('تم تحديث الأوامر بنجاح!');
    } catch (error) { console.error(error); }
})();

// دالة لفحص العقوبات المنتهية
async function checkPunishments() {
    const keys = Object.keys(punishmentExecutors);
    console.log(`[LOG] جاري فحص العقوبات المنتهية... (عدد المسجلين: ${keys.length})`);
    const now = Date.now();
    for (const targetId of keys) {
        const punishment = punishmentExecutors[targetId];
        if (!punishment.expiresAt || now <= punishment.expiresAt) continue;

        try {
            const guildId = process.env.GUILD_ID;
            const guild = client.guilds.cache.get(guildId) || client.guilds.cache.first();
            if (!guild) { console.log(`[WARN] لم يتم العثور على السيرفر`); continue; }

            const member = await guild.members.fetch(targetId).catch(() => null);

            if (punishment.type === 'timeout') {
                // فك عن طريق إزالة رتبة الإسكات
                if (member) {
                    const role = guild.roles.cache.find(r => r.name === 'إسكات');
                    if (role && member.roles.cache.has(role.id)) {
                        await member.roles.remove(role).catch(() => {});
                    }
                }
                console.log(`✅ [تلقائي] تم فك إسكات ${member?.user.tag || targetId}`);
            } else if (punishment.type === 'mute') {
                if (member?.voice.channel) await member.voice.setMute(false).catch(() => {});
                console.log(`✅ [تلقائي] تم فك ميوت ${member?.user.tag || targetId}`);
            } else if (punishment.type === 'jail') {
                if (member) {
                    await removeJail(member);
                    const rolesToRestore = jailedRoles[member.id] || [];
                    if (rolesToRestore.length > 0) await member.roles.set(rolesToRestore).catch(() => {});
                    delete jailedRoles[member.id];
                    saveJailedRoles();
                }
                console.log(`✅ [تلقائي] تم فك سجن ${member?.user.tag || targetId}`);
            }

            delete punishmentExecutors[targetId];
            savePunishments();
        } catch (e) { console.error('[ERROR] خطأ في فحص العقوبات:', e); }
    }
}

client.once('ready', () => {
    console.log(`تم تسجيل الدخول بنجاح كـ ${client.user.tag}`);
    // فحص كل دقيقة
    setInterval(checkPunishments, 60000);
    checkPunishments(); // فحص فوري عند التشغيل
});

// منع البوت من الوقوف بسبب أخطاء غير متوقعة
client.on('error', (error) => {
    console.error('⚠️ خطأ في البوت (client error):', error.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('⚠️ unhandledRejection:', reason?.message || reason);
});

process.on('uncaughtException', (error) => {
    console.error('⚠️ uncaughtException:', error.message);
});

// معالجة تفاعلات لوحة التحكم
client.on('interactionCreate', async interaction => {
    if (!interaction.guild) return;
    const allowedGuildId = process.env.GUILD_ID;
    if (allowedGuildId && allowedGuildId !== 'ضع_ايدي_السيرفر_هنا' && interaction.guild.id !== allowedGuildId) return;

    try {

        // ✅ فحص الرول على كل التفاعلات (سلاش + قوائم + أزرار + modals)
        // ✅ فحص الرتبة العام (يسمح للمسؤولين، لرتبة السلاش، أو لأي شخص لديه صلاحية فئة معينة)
        const allowedRole = process.env.SLASH_ROLE_ID;
        const isStaff = (interaction.member && (
            interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
            (allowedRole && allowedRole !== 'ضع_الايدي_هنا' && interaction.member.roles.cache.has(allowedRole))
        ));

        // إذا لم يكن Staff، نتحقق هل لديه صلاحية في أي فئة من فئات البوت
        if (!isStaff && interaction.member) {
            const guildPerms = rolePerms[interaction.guild.id] || {};
            const hasAnyPerm = Object.values(guildPerms).some(roles => 
                interaction.member.roles.cache.some(r => roles.includes(r.id))
            );
            
            if (!hasAnyPerm) {
                if (interaction.isChatInputCommand() || interaction.isStringSelectMenu() || interaction.isButton() || interaction.isModalSubmit()) {
                    if (!interaction.replied && !interaction.deferred) {
                        return interaction.reply({ content: '❌ ليس لديك صلاحية استخدام أوامر البوت.', ephemeral: true }).catch(() => {});
                    }
                }
                return;
            }
        }

        // ✅ فحص الشات المسموح — فقط للـ Slash Commands
        if (interaction.isChatInputCommand()) {
            const allowedChannel = process.env.SLASH_CHANNEL_ID;
            if (allowedChannel && allowedChannel !== 'ضع_الايدي_هنا') {
                if (interaction.channelId !== allowedChannel) {
                    return interaction.reply({ content: `❌ أوامر السلاش تشتغل فقط في <#${allowedChannel}>`, ephemeral: true });
                }
            }
        }


        // --- لوحة الأوامر (الصلاحيات) ---
        if (interaction.isChatInputCommand() && interaction.commandName === 'اوامر') {
            if (!isStaff) {
                return interaction.reply({ content: 'يجب أن تكون مسؤولاً أو تملك رتبة السلاش المحددة لاستخدام هذا الأمر!', ephemeral: true });
            }
            const embed = new EmbedBuilder()
                .setTitle('⚙️ لوحة التحكم في الصلاحيات')
                .setDescription('اختر الفئة التي تريد إضافة رتب مسموح لها باستخدام أوامرها:')
                .setColor(0x5865f2);
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_category')
                    .setPlaceholder('اختر الفئة...')
                    .addOptions([
                        { label: 'أوامر الطرد', value: 'kick', description: 'إضافة/إزالة رتب يمكنها استخدام طرد' },
                        { label: 'أوامر الحظر (Ban)', value: 'ban', description: 'إضافة/إزالة رتب يمكنها استخدام باند' },
                        { label: 'أوامر الإسكات (ميوت)', value: 'timeout', description: 'إضافة/إزالة رتب يمكنها استخدام اسكات' },
                        { label: 'أوامر الصوت (نقل/سحب)', value: 'move', description: 'إضافة/إزالة رتب يمكنها استخدام نقل و سحب' },
                        { label: 'أوامر المسح', value: 'clear', description: 'إضافة/إزالة رتب يمكنها استخدام مسح' },
                        { label: 'أوامر السجن', value: 'jail', description: 'إضافة/إزالة رتب يمكنها استخدام سجن' },
                        { label: 'أوامر التحذير', value: 'warn', description: 'إضافة/إزالة رتب يمكنها استخدام تحذير' },
                        { label: 'رؤية الإحصائيات (cc)', value: 'stats', description: 'إضافة/إزالة رتب يمكنها استخدام أمر cc' },
                        { label: 'رؤية السجل الأخير (cr)', value: 'history', description: 'إضافة/إزالة رتب يمكنها استخدام أمر cr' },
                        { label: 'أوامر الأسماء والطلبات', value: 'nickname', description: 'إضافة/إزالة رتب يمكنها تغيير الأسماء والتحكم بالرتب' },
                        { label: 'إدارة وقفل الرومات', value: 'channels', description: 'إضافة/إزالة رتب يمكنها قفل وفتح الرومات' },
                        { label: 'خيار نظامه (قائمة العقوبات)', value: 'custom_system', description: 'تحديد كلمة النظام وخيارات السجن/طرد/باند/ميوت' },
                        { label: 'عرض معلومات الصلاحيات', value: 'show_info', description: 'عرض الرتب المضافة لكل فئة' },
                    ])
            );
            return await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }

        if (interaction.isStringSelectMenu() && interaction.customId === 'select_category') {
            const category = interaction.values[0];

            if (category === 'show_info') {
                const guildId = interaction.guild.id;
                const perms = rolePerms[guildId] || {};
                
                const categories = {
                    'kick': 'أوامر الطرد',
                    'ban': 'أوامر الحظر (باند)',
                    'timeout': 'أوامر الإسكات (ميوت)',
                    'move': 'أوامر الصوت (نقل/سحب)',
                    'clear': 'أوامر المسح',
                    'jail': 'أوامر السجن',
                    'warn': 'أوامر التحذير',
                    'stats': 'رؤية الإحصائيات (cc)',
                    'history': 'رؤية السجل الأخير (cr)',
                    'nickname': 'أوامر الأسماء'
                };

                const embed = new EmbedBuilder()
                    .setTitle('ℹ️ معلومات صلاحيات الرتب')
                    .setColor(0x5865f2)
                    .setTimestamp();

                let description = '';
                for (const [key, label] of Object.entries(categories)) {
                    const roles = perms[key] || [];
                    const rolesList = roles.length > 0 ? roles.map(id => `<@&${id}>`).join(', ') : 'لا يوجد رتب مضافة';
                    description += `**${label}:**\n${rolesList}\n\n`;
                }

                embed.setDescription(description || 'لا توجد بيانات مسجلة حالياً.');

                return await interaction.update({ embeds: [embed], components: [], content: null });
            }

            if (category === 'custom_system') {
                return await interaction.update({ embeds: [csPanelEmbed(interaction.guild.id)], components: [csPanelRow()] });
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`btn_add_${category}`).setLabel('إضافة رتب').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`btn_remove_${category}`).setLabel('إزالة رتب').setStyle(ButtonStyle.Danger)
            );
            return await interaction.update({ content: `📍 اختر الإجراء الذي تريد القيام به لفئة **${category}**:`, components: [row], embeds: [] });
        }

        if (interaction.isButton() && (interaction.customId.startsWith('btn_add_') || interaction.customId.startsWith('btn_remove_'))) {
            const isAdd = interaction.customId.startsWith('btn_add_');
            const category = interaction.customId.replace(isAdd ? 'btn_add_' : 'btn_remove_', '');
            
            const row = new ActionRowBuilder().addComponents(
                new RoleSelectMenuBuilder()
                    .setCustomId(`${isAdd ? 'add' : 'remove'}_role_${category}`)
                    .setPlaceholder(`اختر الرتب لـ ${isAdd ? 'إضافتها' : 'إزالتها'}...`)
                    .setMaxValues(10)
            );
            return await interaction.update({ content: `📍 الخطوة التالية: اختر الرتب لـ **${isAdd ? 'إضافتها إلى' : 'إزالتها من'}** فئة **${category}**:`, components: [row] });
        }

        if (interaction.isRoleSelectMenu() && (interaction.customId.startsWith('add_role_') || interaction.customId.startsWith('remove_role_'))) {
            const isAdd = interaction.customId.startsWith('add_role_');
            const category = interaction.customId.replace(isAdd ? 'add_role_' : 'remove_role_', '');
            const roleIds = interaction.values;
            const guildId = interaction.guild.id;
            
            if (!rolePerms[guildId]) rolePerms[guildId] = {};
            if (!rolePerms[guildId][category]) rolePerms[guildId][category] = [];
            
            if (isAdd) {
                roleIds.forEach(roleId => {
                    if (!rolePerms[guildId][category].includes(roleId)) rolePerms[guildId][category].push(roleId);
                });
            } else {
                rolePerms[guildId][category] = rolePerms[guildId][category].filter(id => !roleIds.includes(id));
            }
            
            savePerms();
            // لوق السلاش
            const roleNames = roleIds.map(id => `<@&${id}>`).join(', ');
            await sendSlashLog(
                interaction.guild,
                isAdd ? '➕ إضافة رتب' : '➖ إزالة رتب',
                `${interaction.user.tag}`,
                `الفئة: **${category}**\nالرتب: ${roleNames}`
            );
            return await interaction.update({ content: `✅ تم **${isAdd ? 'إضافة' : 'إزالة'}** الرتب (${roleIds.length}) بنجاح لصلاحية **${category}**!`, components: [] });
        }

        // --- خيار نظامه: تكوين النظام (كلمة + خيارات) ---
        if (interaction.isButton() && interaction.customId === 'cs_change_word') {
            if (!isStaff) return interaction.reply({ content: 'ليس لديك صلاحية للإعداد!', ephemeral: true });
            const cfg = getCustomSys(interaction.guild.id);
            const modal = new ModalBuilder()
                .setCustomId('cs_word_modal')
                .setTitle('تغيير كلمة النظام');
            const wordInput = new TextInputBuilder()
                .setCustomId('cs_word_input')
                .setLabel('اكتب كلمة النظام التي تفتح القائمة')
                .setPlaceholder('مثال: سجن')
                .setValue(cfg.word)
                .setStyle(TextInputStyle.Short)
                .setMaxLength(20)
                .setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(wordInput));
            return await interaction.showModal(modal);
        }

        if (interaction.isModalSubmit() && interaction.customId === 'cs_word_modal') {
            if (!isStaff) return interaction.reply({ content: 'ليس لديك صلاحية للإعداد!', ephemeral: true });
            const word = (interaction.fields.getTextInputValue('cs_word_input') || 'سجن').trim().slice(0, 20);
            if (!customSys[interaction.guild.id]) customSys[interaction.guild.id] = getCustomSys(interaction.guild.id);
            customSys[interaction.guild.id].word = word || 'سجن';
            saveCustomSys();
            await sendSlashLog(interaction.guild, '⚙️ تغيير كلمة النظام', interaction.user.tag, `الكلمة الجديدة: **${word}**`);
            return await interaction.reply({ embeds: [csPanelEmbed(interaction.guild.id)], components: [csPanelRow()], ephemeral: false });
        }

        if (interaction.isButton() && interaction.customId === 'cs_set_options') {
            if (!isStaff) return interaction.reply({ content: 'ليس لديك صلاحية للإعداد!', ephemeral: true });
            const cfg = getCustomSys(interaction.guild.id);
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('cs_options_sel')
                    .setPlaceholder('اختر خيارات العقوبة التي تظهر في القائمة...')
                    .setMinValues(1)
                    .setMaxValues(CS_ALL_OPTIONS.length)
                    .addOptions(CS_ALL_OPTIONS.map(o => ({
                        label: CS_OPTIONS[o].label,
                        value: o,
                        description: 'يُطبق على العضو المحدد عند اختياره',
                        default: cfg.options.includes(o)
                    })))
            );
            return await interaction.update({ content: '📍 اختر العقوبات التي ستعرضها قائمة النظام (التحذير غير متاح):', embeds: [], components: [row] });
        }

        if (interaction.isStringSelectMenu() && interaction.customId === 'cs_options_sel') {
            if (!isStaff) return interaction.reply({ content: 'ليس لديك صلاحية للإعداد!', ephemeral: true });
            if (!customSys[interaction.guild.id]) customSys[interaction.guild.id] = getCustomSys(interaction.guild.id);
            customSys[interaction.guild.id].options = interaction.values.filter(o => CS_ALL_OPTIONS.includes(o));
            saveCustomSys();
            await sendSlashLog(interaction.guild, '⚙️ تعديل خيارات النظام', interaction.user.tag, `الخيارات: ${customSys[interaction.guild.id].options.map(o => CS_OPTIONS[o].label).join('، ')}`);
            return await interaction.update({ embeds: [csPanelEmbed(interaction.guild.id)], components: [csPanelRow()], content: null });
        }

        // --- خيار نظامه: تنفيذ العقوبة المختارة من القائمة ---
        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('cs_punish_')) {
            const parts = interaction.customId.split('_');
            const targetId = parts[2];
            const dur = parseInt(parts[3]) || 0;
            const option = interaction.values[0];

            if (!CS_OPTIONS[option]) {
                return await interaction.update({ content: '❌ خيار غير معروف!', components: [] });
            }
            if (!hasPermission(interaction.member, CS_OPTIONS[option].category, CS_OPTIONS[option].perm)) {
                return await interaction.update({ content: '❌ ليس لديك صلاحية لاستخدام هذا النوع من العقوبات!', components: [] });
            }

            const cfg = getCustomSys(interaction.guild.id);
            if (!cfg.options.includes(option)) {
                return await interaction.update({ content: '❌ هذا الخيار لم يعد متاحاً في النظام!', components: [] });
            }

            const target = await interaction.guild.members.fetch(targetId).catch(() => null);
            if (!target) {
                return await interaction.update({ content: '❌ العضو المستهدف غير موجود في السيرفر!', components: [] });
            }

            try {
                const result = await applyCustomPunishment(interaction.guild, interaction.member, target, option, dur);
                await interaction.update({ content: `✅ ${result}`, components: [] });
            } catch (e) {
                console.error(e);
                await interaction.update({ content: `❌ ${e.message || 'حدث خطأ أثناء تنفيذ العقوبة!'}`, components: [] });
            }
            return;
        }

        // --- لوحة الإعدادات (الرومات) ---
        if (interaction.isChatInputCommand() && interaction.commandName === 'اعدادات') {
            if (!isStaff) {
                return interaction.reply({ content: 'يجب أن تكون مسؤولاً أو تملك رتبة السلاش المحددة لاستخدام هذا الأمر!', ephemeral: true });
            }
            const embed = new EmbedBuilder()
                .setTitle('⚙️ إعدادات الرومات والصلاحيات')
                .setDescription('اختر الإجراء الذي تريد القيام به:')
                .setColor(0x00aeef);
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('settings_action')
                    .setPlaceholder('اختر الإجراء...')
                    .addOptions([
                        { label: 'إظهار رومات لرتبة', value: 'add_access', description: 'منح رتبة صلاحية رؤية رومات محددة' },
                        { label: 'إخفاء رومات عن رتبة', value: 'remove_access', description: 'سحب صلاحية رؤية رومات محددة من رتبة' },
                        { label: 'إعدادات قنوات السجن', value: 'manage_jail', description: 'تحديد شات وروم صوتي للمسجونين' },
                        { label: 'إعدادات قنوات السجل (Log)', value: 'manage_logs', description: 'تحديد قنوات لإرسال سجلات العقوبات' },
                        { label: 'قفل/فتح الثريدز (Threads)', value: 'manage_threads', description: 'منع أو السماح بإنشاء وحذف الثريدز في السيرفر' },
                        { label: 'قفل/فتح أوامر السلاش (Slash)', value: 'manage_slash', description: 'منع أو السماح باستخدام أوامر السلاش في السيرفر' },
                    ])
            );
            return await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }

        if (interaction.isStringSelectMenu() && interaction.customId === 'preset_action_select') {
            const actionType = interaction.values[0];
            const guildId = interaction.guild.id;
            if (!moderationPresets[guildId]) moderationPresets[guildId] = {};
            if (!moderationPresets[guildId][actionType]) moderationPresets[guildId][actionType] = [];

            const embed = new EmbedBuilder()
                .setTitle(`📋 أسباب ${actionType} الجاهزة`)
                .setDescription(`إليك قائمة بالأسباب المسجلة حالياً لـ **${actionType}**:`)
                .setColor(0x00aeef);

            const presets = moderationPresets[guildId][actionType];
            let desc = '';
            if (presets.length === 0) {
                desc = 'لا يوجد أسباب مسجلة بعد.';
            } else {
                presets.forEach((p, index) => {
                    desc += `**${index + 1}. ${p.name}**\n> المدة: ${p.duration} ${p.unit}\n> السبب: ${p.reason}\n\n`;
                });
            }
            embed.setDescription(desc);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`add_preset_${actionType}`).setLabel('إضافة سبب جديد').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`remove_preset_menu_${actionType}`).setLabel('حذف سبب').setStyle(ButtonStyle.Danger).setDisabled(presets.length === 0),
                new ButtonBuilder().setCustomId('settings_back').setLabel('رجوع').setStyle(ButtonStyle.Secondary)
            );

            return await interaction.update({ embeds: [embed], components: [row] });
        }

        if (interaction.isChatInputCommand() && interaction.commandName === 'معلومات_كامله') {
            const embed = new EmbedBuilder()
                .setTitle('📚 الدليل الشامل لبوت الإدارة')
                .setDescription('مرحباً بك في دليل الاستخدام. يرجى اختيار القسم الذي تريد استكشافه من الأزرار أدناه:')
                .addFields(
                    { name: '🛠️ قسم الأوامر', value: 'شرح كافة أوامر البريفكس وكيفية تنفيذ العقوبات.', inline: true },
                    { name: '⚙️ قسم الإعدادات', value: 'شرح لوحة التحكم، الصلاحيات، ونظام السجلات.', inline: true }
                )
                .setColor(0x5865f2)
                .setThumbnail(client.user.displayAvatarURL());

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('help_commands').setLabel('شرح الأوامر').setStyle(ButtonStyle.Primary).setEmoji('🛠️'),
                new ButtonBuilder().setCustomId('help_settings').setLabel('شرح الإعدادات').setStyle(ButtonStyle.Success).setEmoji('⚙️')
            );

            return await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }

        if (interaction.isButton() && interaction.customId === 'help_commands') {
            const embed = new EmbedBuilder()
                .setTitle('🛠️ شرح أوامر الإدارة (Prefix)')
                .setColor(0x3498db)
                .setDescription('استخدم هذه الأوامر مباشرة في الشات:')
                .addFields(
                    { name: '⚖️ العقوبات', value: '`طرد @عضو`: طرد من السيرفر.\n`ban @عضو`: حظر نهائي.\n`اسكات @عضو [وقت]`: إسكات (Timeout).\n`ميوت @عضو [وقت]`: ميوت صوتي.\n`سجن @عضو`: سحب الرتب وسجنه.' },
                    { name: '🔓 الفك والعفو', value: '`تكلم @عضو`: فك الإسكات.\n`فك @عضو`: فك الميوت الصوتي.\n`عفو @عضو`: فك السجن وإعادة الرتب.' },
                    { name: '🎭 الرتب والأسماء', value: '`رول @عضو @رتبة`: إعطاء رتبة.\n`-رول @عضو @رتبة`: سحب رتبة.\n`اسم @عضو [الاسم]`: تغيير لقب العضو.' },
                    { name: '📁 الرومات والقنوات', value: '`روم_اسم [الاسم]`: تغيير اسم الروم الحالي.\n`روم_حذف`: حذف الروم الحالي فوراً.' },
                    { name: '🧹 التنظيف والإحصائيات', value: '`مسح [عدد]`: مسح الرسائل.\n`cc`: إحصائياتك.\n`cr @عضو`: سجل عقوبات العضو.' }
                );
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('help_main').setLabel('الرجوع للرئيسية').setStyle(ButtonStyle.Secondary)
            );
            return await interaction.update({ embeds: [embed], components: [row] });
        }

        if (interaction.isButton() && interaction.customId === 'help_settings') {
            const embed = new EmbedBuilder()
                .setTitle('⚙️ شرح نظام الإعدادات والسجلات')
                .setColor(0x2ecc71)
                .setDescription('كيفية تهيئة البوت للعمل في سيرفرك:')
                .addFields(
                    { name: '🔑 التحكم في الصلاحيات (`/اوامر`)', value: 'تسمح لك بإضافة رتب (مثل مساعد مدير) لتتمكن من استخدام أوامر معينة دون الحاجة لإعطائهم صلاحية Administrator.' },
                    { name: '📜 نظام السجلات (`/اعدادات`)', value: 'من هنا تحدد القنوات لكل نوع من السجلات:\n- **سجلات الرسائل:** حذف وتعديل النصوص.\n- **سجلات الوسائط:** الصور والفيديوهات المحذوفة.\n- **سجلات الرتب:** أي تغيير في رتب الأعضاء.\n- **سجلات الصوت:** دخول وخروج الرومات الصوتية.\n- **سجلات الرومات:** إنشاء أو حذف القنوات.' },
                    { name: '👤 صلاحياتك الشخصية (`خواص`)', value: 'اكتب كلمة `خواص` في أي شات ليعطيك البوت قائمة بكل الأوامر المسموح لك باستخدامها حالياً.' }
                );
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('help_main').setLabel('الرجوع للرئيسية').setStyle(ButtonStyle.Secondary)
            );
            return await interaction.update({ embeds: [embed], components: [row] });
        }

        if (interaction.isButton() && interaction.customId === 'help_main') {
            // إعادة عرض اللوحة الرئيسية
            const embed = new EmbedBuilder()
                .setTitle('📚 الدليل الشامل لبوت الإدارة')
                .setDescription('مرحباً بك في دليل الاستخدام. يرجى اختيار القسم الذي تريد استكشافه من الأزرار أدناه:')
                .setColor(0x5865f2);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('help_commands').setLabel('شرح الأوامر').setStyle(ButtonStyle.Primary).setEmoji('🛠️'),
                new ButtonBuilder().setCustomId('help_settings').setLabel('شرح الإعدادات').setStyle(ButtonStyle.Success).setEmoji('⚙️')
            );
            return await interaction.update({ embeds: [embed], components: [row] });
        }

        if (interaction.isButton() && interaction.customId === 'settings_back') {
            const embed = new EmbedBuilder()
                .setTitle('⚙️ إعدادات الرومات والصلاحيات')
                .setDescription('اختر الإجراء الذي تريد القيام به:')
                .setColor(0x00aeef);
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('settings_action')
                    .setPlaceholder('اختر الإجراء...')
                    .addOptions([
                        { label: 'إظهار رومات لرتبة', value: 'add_access', description: 'منح رتبة صلاحية رؤية رومات محددة' },
                        { label: 'إخفاء رومات عن رتبة', value: 'remove_access', description: 'سحب صلاحية رؤية رومات محددة من رتبة' },
                        { label: 'إعدادات قنوات السجن', value: 'manage_jail', description: 'تحديد شات وروم صوتي للمسجونين' },
                        { label: 'إعدادات قنوات السجل (Log)', value: 'manage_logs', description: 'تحديد قنوات لإرسال سجلات العقوبات' },
                        { label: 'قفل/فتح الثريدز (Threads)', value: 'manage_threads', description: 'منع أو السماح بإنشاء وحذف الثريدز في السيرفر' },
                    ])
            );
            return await interaction.update({ embeds: [embed], components: [row] });
        }

        // --- إدارة الأسباب الجاهزة (Presets) ---
        if (interaction.isButton() && interaction.customId.startsWith('add_preset_')) {
            const actionType = interaction.customId.replace('add_preset_', '');
            const modal = new ModalBuilder()
                .setCustomId(`add_preset_modal_${actionType}`)
                .setTitle(`إضافة سبب ${actionType} جديد`);

            const nameInput = new TextInputBuilder()
                .setCustomId('preset_name')
                .setLabel('اسم الاختصار (مثال: سب)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const durationInput = new TextInputBuilder()
                .setCustomId('preset_duration')
                .setLabel('المدة (رقم فقط)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const unitInput = new TextInputBuilder()
                .setCustomId('preset_unit')
                .setLabel('الوحدة (دقائق، ساعات، ايام)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('دقائق / ساعات / ايام')
                .setRequired(true);

            const reasonInput = new TextInputBuilder()
                .setCustomId('preset_reason')
                .setLabel('السبب الكامل الذي سيظهر في اللوق')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(nameInput),
                new ActionRowBuilder().addComponents(durationInput),
                new ActionRowBuilder().addComponents(unitInput),
                new ActionRowBuilder().addComponents(reasonInput)
            );

            return await interaction.showModal(modal);
        }

        if (interaction.isModalSubmit() && interaction.customId.startsWith('add_preset_modal_')) {
            const actionType = interaction.customId.replace('add_preset_modal_', '');
            const guildId = interaction.guild.id;
            const name = interaction.fields.getTextInputValue('preset_name');
            const duration = interaction.fields.getTextInputValue('preset_duration');
            const unit = interaction.fields.getTextInputValue('preset_unit');
            const reason = interaction.fields.getTextInputValue('preset_reason');

            if (!moderationPresets[guildId]) moderationPresets[guildId] = {};
            if (!moderationPresets[guildId][actionType]) moderationPresets[guildId][actionType] = [];

            moderationPresets[guildId][actionType].push({ name, duration, unit, reason });
            savePresets();

            return await interaction.reply({ content: `✅ تم إضافة سبب **${name}** بنجاح إلى قائمة الـ **${actionType}**!`, ephemeral: true });
        }

        if (interaction.isButton() && interaction.customId.startsWith('remove_preset_menu_')) {
            const actionType = interaction.customId.replace('remove_preset_menu_', '');
            const guildId = interaction.guild.id;
            const presets = moderationPresets[guildId]?.[actionType] || [];

            if (presets.length === 0) return interaction.reply({ content: 'لا توجد أسباب لحذفها.', ephemeral: true });

            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`remove_preset_${actionType}`)
                    .setPlaceholder('اختر السبب الذي تريد حذفه...')
                    .addOptions(presets.map((p, index) => ({
                        label: p.name,
                        value: index.toString(),
                        description: `المدة: ${p.duration} ${p.unit}`
                    })))
            );

            return await interaction.reply({ content: `🗑️ اختر السبب الذي تريد حذفه من قائمة الـ **${actionType}**:`, components: [row], ephemeral: true });
        }

        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('remove_preset_')) {
            const actionType = interaction.customId.replace('remove_preset_', '');
            const index = parseInt(interaction.values[0]);
            const guildId = interaction.guild.id;

            if (moderationPresets[guildId] && moderationPresets[guildId][actionType]) {
                const removed = moderationPresets[guildId][actionType].splice(index, 1);
                savePresets();
                return await interaction.update({ content: `✅ تم حذف السبب **${removed[0].name}** بنجاح!`, components: [] });
            }
            return await interaction.update({ content: '❌ حدث خطأ، لم يتم العثور على البيانات.', components: [] });
        }

        if (interaction.isStringSelectMenu() && interaction.customId === 'settings_action') {
            const action = interaction.values[0];

            if (action === 'manage_logs') {
                const embed = new EmbedBuilder()
                    .setTitle('📢 إعدادات قنوات السجل (Logs)')
                    .setDescription('اختر نوع الفعل الذي تريد تحديد قناة لسجله:')
                    .setColor(0x00aeef);
                
                const row = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('log_type_select')
                        .setPlaceholder('اختر نوع السجل...')
                        .addOptions([
                            { label: 'سجلات الإسكات (Timeout)', value: 'timeout' },
                            { label: 'سجلات الميوت الصوتي (Mute)', value: 'mute' },
                            { label: 'سجلات السجن (Jail)', value: 'jail' },
                            { label: 'سجلات الحظر (Ban)', value: 'ban' },
                            { label: 'سجلات الطرد (Kick)', value: 'kick' },
                            { label: 'سجلات التحذير (Warn)', value: 'warn' },
                            { label: 'سجلات الرسائل (حذف وتعديل)', value: 'message_logs' },
                            { label: 'سجلات الوسائط المحذوفة (صور وفيديو)', value: 'image_logs' },
                            { label: 'سجلات تغيير الرتب (أوامر ويدوي)', value: 'role_logs' },
                            { label: 'سجلات الرومات الصوتية', value: 'voice_logs' },
                            { label: 'سجلات إنشاء وحذف وتعديل الرومات', value: 'channel_logs' },
                        ])
                );
                return await interaction.update({ embeds: [embed], components: [row] });
            }

            if (action === 'manage_jail') {
                const embed = new EmbedBuilder()
                    .setTitle('⚖️ إعدادات قنوات السجن')
                    .setDescription('اختر القناة التي تريد تحديدها للمسجونين:')
                    .setColor(0x34495e);
                
                const row = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('jail_channel_type_select')
                        .setPlaceholder('اختر نوع القناة...')
                        .addOptions([
                            { label: 'شات السجن (Text)', value: 'textId' },
                            { label: 'روم السجن الصوتي (Voice)', value: 'voiceId' },
                            { label: 'رتبة السجن (Role)', value: 'roleId' },
                        ])
                );
                return await interaction.update({ embeds: [embed], components: [row] });
            }

            if (action === 'manage_threads') {
                const embed = new EmbedBuilder()
                    .setTitle('🧵 إعدادات الثريدز (Threads)')
                    .setDescription('اختر نطاق قفل أو فتح الثريدز:')
                    .setColor(0xf1c40f);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('threads_toggle_all').setLabel('كامل السيرفر').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('threads_toggle_channels').setLabel('قنوات محددة').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('settings_back').setLabel('رجوع').setStyle(ButtonStyle.Secondary)
                );

                return await interaction.update({ embeds: [embed], components: [row], content: null });
            }

            if (action === 'manage_slash') {
                const embed = new EmbedBuilder()
                    .setTitle('🚀 إعدادات أوامر السلاش (Slash Commands)')
                    .setDescription('اختر نطاق قفل أو فتح أوامر السلاش:')
                    .setColor(0x5865f2);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('slash_toggle_all').setLabel('كامل السيرفر').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('slash_toggle_channels').setLabel('قنوات محددة').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('settings_back').setLabel('رجوع').setStyle(ButtonStyle.Secondary)
                );

                return await interaction.update({ embeds: [embed], components: [row], content: null });
            }

            settingsState.set(interaction.user.id, { action });
            const row1 = new ActionRowBuilder().addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId('settings_channels')
                    .setPlaceholder('اختر الرومات/الشاتات...')
                    .setChannelTypes([ChannelType.GuildText, ChannelType.GuildVoice])
                    .setMaxValues(25)
            );
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('settings_select_all').setLabel('تحديد الكل').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('settings_confirm_channels').setLabel('موافق').setStyle(ButtonStyle.Success).setDisabled(true)
            );
            return await interaction.update({ 
                content: `📍 الخطوة التالية: اختر الرومات التي تريد ${action === 'add_access' ? 'إظهارها' : 'إخفاءها'}:`, 
                components: [row1, row2], 
                embeds: [] 
            });
        }

        if (interaction.isStringSelectMenu() && interaction.customId === 'jail_channel_type_select') {
            const jailType = interaction.values[0];
            settingsState.set(interaction.user.id, { action: 'set_jail_channel', jailType });
            
            if (jailType === 'roleId') {
                const row = new ActionRowBuilder().addComponents(
                    new RoleSelectMenuBuilder()
                        .setCustomId('jail_role_select')
                        .setPlaceholder('اختر رتبة السجن...')
                );
                return await interaction.update({ content: '📍 اختر الرتبة التي سيتم إعطاؤها للمسجونين:', components: [row], embeds: [] });
            }

            const row = new ActionRowBuilder().addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId('jail_channel_select')
                    .setPlaceholder(`اختر ${jailType === 'textId' ? 'شات' : 'روم'} السجن...`)
                    .setChannelTypes(jailType === 'textId' ? [ChannelType.GuildText] : [ChannelType.GuildVoice])
            );
            return await interaction.update({ content: `📍 اختر ${jailType === 'textId' ? 'الشات الكتابي' : 'الروم الصوتي'} المخصص للمسجونين:`, components: [row], embeds: [] });
        }

        if (interaction.isChannelSelectMenu() && interaction.customId === 'jail_channel_select') {
            const channelId = interaction.values[0];
            const state = settingsState.get(interaction.user.id);
            if (!state || state.action !== 'set_jail_channel') return interaction.reply({ content: 'انتهت الجلسة، ابدأ من جديد.', ephemeral: true });
            
            if (!jailChannels[interaction.guild.id]) jailChannels[interaction.guild.id] = {};
            jailChannels[interaction.guild.id][state.jailType] = channelId;
            saveJailConfig();
            // لوق السلاش
            await sendSlashLog(
                interaction.guild,
                '⚖️ تحديث قنوات السجن',
                `${interaction.user.tag}`,
                `نوع القناة: **${state.jailType === 'textId' ? 'شات كتابي' : 'روم صوتي'}**\nالقناة: <#${channelId}>`
            );
            return await interaction.update({ content: `✅ تم تعيين <#${channelId}> كـ **${state.jailType === 'textId' ? 'شات كتابي' : 'روم صوتي'}** للسجن بنجاح!`, components: [], embeds: [] });
        }

        if (interaction.isButton() && interaction.customId === 'threads_toggle_all') {
            const embed = new EmbedBuilder()
                .setTitle('🧵 قفل/فتح الثريدز - كامل السيرفر')
                .setDescription('سيتم تطبيق الإجراء على جميع القنوات الحالية والمستقبلية.')
                .setColor(0xf1c40f);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('lock_threads_all').setLabel('قفل الكل').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('unlock_threads_all').setLabel('فتح الكل').setStyle(ButtonStyle.Success)
            );
            return await interaction.update({ embeds: [embed], components: [row] });
        }

        if (interaction.isButton() && interaction.customId === 'threads_toggle_channels') {
            settingsState.set(interaction.user.id, { action: 'manage_threads_channels' });
            const row1 = new ActionRowBuilder().addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId('settings_channels')
                    .setPlaceholder('اختر القنوات...')
                    .setChannelTypes([ChannelType.GuildText, ChannelType.GuildVoice])
                    .setMaxValues(25)
            );
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('settings_select_all').setLabel('تحديد الكل').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('settings_confirm_channels').setLabel('موافق').setStyle(ButtonStyle.Success).setDisabled(true)
            );
            return await interaction.update({ content: '📍 اختر القنوات التي تريد التحكم في الثريدز الخاص بها:', components: [row1, row2], embeds: [] });
        }

        if (interaction.isButton() && interaction.customId === 'slash_toggle_all') {
            const embed = new EmbedBuilder()
                .setTitle('🚀 قفل/فتح أوامر السلاش - كامل السيرفر')
                .setDescription('سيتم تطبيق الإجراء على جميع القنوات الحالية والمستقبلية.')
                .setColor(0x5865f2);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('lock_slash_all').setLabel('قفل الكل').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('unlock_slash_all').setLabel('فتح الكل').setStyle(ButtonStyle.Success)
            );
            return await interaction.update({ embeds: [embed], components: [row] });
        }

        if (interaction.isButton() && interaction.customId === 'slash_toggle_channels') {
            settingsState.set(interaction.user.id, { action: 'manage_slash_channels' });
            const row1 = new ActionRowBuilder().addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId('settings_channels')
                    .setPlaceholder('اختر القنوات...')
                    .setChannelTypes([ChannelType.GuildText, ChannelType.GuildVoice])
                    .setMaxValues(25)
            );
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('settings_select_all').setLabel('تحديد الكل').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('settings_confirm_channels').setLabel('موافق').setStyle(ButtonStyle.Success).setDisabled(true)
            );
            return await interaction.update({ content: '📍 اختر القنوات التي تريد التحكم في أوامر السلاش الخاصة بها:', components: [row1, row2], embeds: [] });
        }

        if (interaction.isButton() && (interaction.customId === 'lock_threads_all' || interaction.customId === 'unlock_threads_all')) {
            const isLock = interaction.customId === 'lock_threads_all';
            const guild = interaction.guild;
            
            await interaction.reply({ content: `⏳ جاري ${isLock ? 'قفل' : 'فتح'} الثريدز في كل القنوات... يرجى الانتظار.`, ephemeral: true });

            try {
                if (!serverSettings[guild.id]) serverSettings[guild.id] = {};
                serverSettings[guild.id].threadsLocked = isLock;
                saveServerSettings();

                const channels = guild.channels.cache;
                let count = 0;
                
                // تحديث رتبة @everyone على مستوى السيرفر (الاختياري، القنوات أهم)
                await guild.roles.everyone.setPermissions(
                    guild.roles.everyone.permissions.remove([
                        PermissionsBitField.Flags.CreatePublicThreads,
                        PermissionsBitField.Flags.CreatePrivateThreads,
                        PermissionsBitField.Flags.ManageThreads
                    ])
                ).catch(() => {});

                for (const [id, channel] of channels) {
                    if (channel.isTextBased() || channel.type === ChannelType.GuildForum) {
                        if (channel.permissionOverwrites) {
                            await channel.permissionOverwrites.edit(guild.roles.everyone, {
                                CreatePublicThreads: isLock ? false : null,
                                CreatePrivateThreads: isLock ? false : null,
                                ManageThreads: isLock ? false : null
                            }).catch(() => {});
                            count++;
                        }
                    }
                }

                await sendSlashLog(
                    guild,
                    isLock ? '🔒 قفل الثريدز (كامل السيرفر)' : '🔓 فتح الثريدز',
                    `${interaction.user.tag}`,
                    `تم ${isLock ? 'تعطيل' : 'تفعيل'} صلاحيات الثريدز لـ @everyone في **${count}** قناة وعلى مستوى السيرفر.`
                );

                return await interaction.editReply({ content: `✅ تم بنجاح **${isLock ? 'قفل' : 'فتح'}** الثريدز في كامل السيرفر (سيتم تطبيقه أيضاً على القنوات الجديدة تلقائياً).` });
            } catch (e) {
                console.error(e);
                return await interaction.editReply({ content: '❌ حدث خطأ أثناء تعديل الصلاحيات.' });
            }
        }

        if (interaction.isButton() && (interaction.customId === 'lock_slash_all' || interaction.customId === 'unlock_slash_all')) {
            const isLock = interaction.customId === 'lock_slash_all';
            const guild = interaction.guild;
            
            await interaction.reply({ content: `⏳ جاري ${isLock ? 'قفل' : 'فتح'} أوامر السلاش في كل القنوات... يرجى الانتظار.`, ephemeral: true });

            try {
                if (!serverSettings[guild.id]) serverSettings[guild.id] = {};
                serverSettings[guild.id].slashLocked = isLock;
                saveServerSettings();

                const channels = guild.channels.cache;
                let count = 0;
                
                // تحديث رتبة @everyone على مستوى السيرفر
                await guild.roles.everyone.setPermissions(
                    guild.roles.everyone.permissions.remove([PermissionsBitField.Flags.UseApplicationCommands])
                ).catch(() => {});

                for (const [id, channel] of channels) {
                    if (channel.isTextBased() || channel.type === ChannelType.GuildVoice) {
                        if (channel.permissionOverwrites) {
                            await channel.permissionOverwrites.edit(guild.roles.everyone, {
                                UseApplicationCommands: isLock ? false : null
                            }).catch(() => {});
                            count++;
                        }
                    }
                }

                await sendSlashLog(
                    guild,
                    isLock ? '🚫 قفل أوامر السلاش (كامل السيرفر)' : '✅ فتح أوامر السلاش',
                    `${interaction.user.tag}`,
                    `تم ${isLock ? 'تعطيل' : 'تفعيل'} صلاحيات الـ Slash لـ @everyone في **${count}** قناة وعلى مستوى السيرفر.`
                );

                return await interaction.editReply({ content: `✅ تم بنجاح **${isLock ? 'قفل' : 'فتح'}** أوامر السلاش في كامل السيرفر (سيتم تطبيقه أيضاً على القنوات الجديدة تلقائياً).` });
            } catch (e) {
                console.error(e);
                return await interaction.editReply({ content: '❌ حدث خطأ أثناء تعديل الصلاحيات.' });
            }
        }

        if (interaction.isButton() && interaction.customId === 'settings_select_all') {
            const state = settingsState.get(interaction.user.id);
            if (!state) return interaction.reply({ content: 'انتهت الجلسة، ابدأ من جديد.', ephemeral: true });
            
            // جلب كل القنوات النصية والصوتية
            const allChannels = interaction.guild.channels.cache
                .filter(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildVoice)
                .map(c => c.id);
            
            state.channels = allChannels;
            console.log(`[DEBUG] Select All clicked. Action: ${state.action}`);

            if (state.action.includes('manage_threads') || state.action.includes('manage_slash')) {
                const isThreads = state.action.includes('threads');
                const embed = new EmbedBuilder()
                    .setTitle(`⚙️ التحكم في ${isThreads ? 'الثريتز' : 'أوامر السلاش'} لجميع القنوات`)
                    .setDescription(`لقد قمت بتحديد جميع القنوات (${allChannels.length}).\nماذا تريد أن تفعل؟`)
                    .setColor(0xf1c40f);
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(isThreads ? 'lock_threads_selected' : 'lock_slash_selected').setLabel(`قفل ${isThreads ? 'الثريتز' : 'السلاش'}`).setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId(isThreads ? 'unlock_threads_selected' : 'unlock_slash_selected').setLabel(`فتح ${isThreads ? 'الثريتز' : 'السلاش'}`).setStyle(ButtonStyle.Success)
                );
                return await interaction.update({ embeds: [embed], components: [row], content: null });
            }
            
            const row1 = new ActionRowBuilder().addComponents(
                new RoleSelectMenuBuilder()
                    .setCustomId('settings_roles')
                    .setPlaceholder('اختر الرتب...')
                    .setMaxValues(25)
            );
            
            return await interaction.update({ 
                content: `✅ تم تحديد جميع القنوات (${allChannels.length}).\n📍 الخطوة الأخيرة: اختر الرتب التي ستتأثر بهذا التغيير:`, 
                components: [row1] 
            });
        }

        if (interaction.isButton() && interaction.customId === 'settings_confirm_channels') {
            const state = settingsState.get(interaction.user.id);
            if (!state || !state.channels || state.channels.length === 0) return interaction.reply({ content: 'يرجى اختيار قنوات أولاً.', ephemeral: true });
            
            console.log(`[DEBUG] Confirm Channels clicked. Action: ${state.action}`);

            if (state.action.includes('manage_threads') || state.action.includes('manage_slash')) {
                const isThreads = state.action.includes('threads');
                const embed = new EmbedBuilder()
                    .setTitle(`⚙️ التحكم في ${isThreads ? 'الثريتز' : 'أوامر السلاش'} للقنوات المختارة`)
                    .setDescription(`لقد اخترت **${state.channels.length}** قناة.\nماذا تريد أن تفعل؟`)
                    .setColor(0xf1c40f);
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(isThreads ? 'lock_threads_selected' : 'lock_slash_selected').setLabel(`قفل ${isThreads ? 'الثريتز' : 'السلاش'}`).setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId(isThreads ? 'unlock_threads_selected' : 'unlock_slash_selected').setLabel(`فتح ${isThreads ? 'الثريتز' : 'السلاش'}`).setStyle(ButtonStyle.Success)
                );
                return await interaction.update({ embeds: [embed], components: [row], content: null });
            }

            const row1 = new ActionRowBuilder().addComponents(
                new RoleSelectMenuBuilder()
                    .setCustomId('settings_roles')
                    .setPlaceholder('اختر الرتب...')
                    .setMaxValues(25)
            );
            
            return await interaction.update({ content: `📍 الخطوة الأخيرة: اختر الرتب التي ستتأثر بهذا التغيير:`, components: [row1] });
        }

        if (interaction.isButton() && (interaction.customId === 'lock_threads_selected' || interaction.customId === 'unlock_threads_selected')) {
            const isLock = interaction.customId === 'lock_threads_selected';
            const state = settingsState.get(interaction.user.id);
            const guild = interaction.guild;
            
            await interaction.reply({ content: `⏳ جاري ${isLock ? 'قفل' : 'فتح'} الثريدز في القنوات المختارة...`, ephemeral: true });

            try {
                let count = 0;
                for (const channelId of state.channels) {
                    const channel = guild.channels.cache.get(channelId);
                    if (channel && channel.permissionOverwrites) {
                        await channel.permissionOverwrites.edit(guild.roles.everyone, {
                            CreatePublicThreads: isLock ? false : null,
                            CreatePrivateThreads: isLock ? false : null,
                            ManageThreads: isLock ? false : null
                        }).catch(() => {});
                        count++;
                    }
                }

                await sendSlashLog(
                    guild,
                    isLock ? '🔒 قفل ثريدز (مخصص)' : '🔓 فتح ثريدز (مخصص)',
                    `${interaction.user.tag}`,
                    `تم ${isLock ? 'تعطيل' : 'تفعيل'} صلاحيات الثريدز لـ @everyone في **${count}** قناة مختارة.`
                );

                return await interaction.editReply({ content: `✅ تم بنجاح **${isLock ? 'قفل' : 'فتح'}** الثريدز في **${count}** قناة.` });
            } catch (e) {
                console.error(e);
                return await interaction.editReply({ content: '❌ حدث خطأ أثناء تعديل الصلاحيات.' });
            }
        }

        if (interaction.isButton() && (interaction.customId === 'lock_slash_selected' || interaction.customId === 'unlock_slash_selected')) {
            const isLock = interaction.customId === 'lock_slash_selected';
            const state = settingsState.get(interaction.user.id);
            const guild = interaction.guild;
            
            await interaction.reply({ content: `⏳ جاري ${isLock ? 'قفل' : 'فتح'} أوامر السلاش في القنوات المختارة...`, ephemeral: true });

            try {
                let count = 0;
                for (const channelId of state.channels) {
                    const channel = guild.channels.cache.get(channelId);
                    if (channel && channel.permissionOverwrites) {
                        await channel.permissionOverwrites.edit(guild.roles.everyone, {
                            UseApplicationCommands: isLock ? false : null
                        }).catch(() => {});
                        count++;
                    }
                }

                await sendSlashLog(
                    guild,
                    isLock ? '🚫 قفل أوامر سلاش (مخصص)' : '✅ فتح أوامر سلاش (مخصص)',
                    `${interaction.user.tag}`,
                    `تم ${isLock ? 'تعطيل' : 'تفعيل'} صلاحيات الـ Slash لـ @everyone في **${count}** قناة مختارة.`
                );

                return await interaction.editReply({ content: `✅ تم بنجاح **${isLock ? 'قفل' : 'فتح'}** أوامر السلاش في **${count}** قناة.` });
            } catch (e) {
                console.error(e);
                return await interaction.editReply({ content: '❌ حدث خطأ أثناء تعديل الصلاحيات.' });
            }
        }

        if (interaction.isButton() && interaction.customId === 'settings_roles_select_all') {
            const state = settingsState.get(interaction.user.id);
            if (!state) return interaction.reply({ content: 'انتهت الجلسة، ابدأ من جديد.', ephemeral: true });
            
            // جلب كل الرتب (باستثناء @everyone والبوتات إذا لزم الأمر)
            const allRoles = interaction.guild.roles.cache
                .filter(r => r.name !== '@everyone' && !r.managed)
                .map(r => r.id);
            
            state.roles = allRoles;
            
            const { action, channels } = state;
            const embed = new EmbedBuilder()
                .setTitle('📝 ملخص التغييرات')
                .setDescription(`**الإجراء:** ${action === 'add_access' ? 'إظهار القنوات' : 'إخفاء القنوات'}\n**القنوات:** ${channels.length} قناة\n**الرتب:** ${allRoles.length} رتبة (الكل)`)
                .setColor(0xf1c40f);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('settings_save').setLabel('حفظ التغييرات').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('settings_cancel').setLabel('إلغاء').setStyle(ButtonStyle.Danger)
            );
            return await interaction.update({ content: '📍 يرجى مراجعة الملخص والضغط على حفظ للتنفيذ:', embeds: [embed], components: [row] });
        }

        if (interaction.isButton() && interaction.customId === 'settings_confirm_roles') {
            const state = settingsState.get(interaction.user.id);
            if (!state || !state.roles || state.roles.length === 0) return interaction.reply({ content: 'يرجى اختيار رتب أولاً.', ephemeral: true });
            
            const { action, channels, roles } = state;
            const embed = new EmbedBuilder()
                .setTitle('📝 ملخص التغييرات')
                .setDescription(`**الإجراء:** ${action === 'add_access' ? 'إظهار القنوات' : 'إخفاء القنوات'}\n**القنوات:** ${channels.length} قناة\n**الرتب:** ${roles.length} رتبة`)
                .setColor(0xf1c40f);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('settings_save').setLabel('حفظ التغييرات').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('settings_cancel').setLabel('إلغاء').setStyle(ButtonStyle.Danger)
            );
            return await interaction.update({ content: '📍 يرجى مراجعة الملخص والضغط على حفظ للتنفيذ:', embeds: [embed], components: [row] });
        }

        if (interaction.isRoleSelectMenu() && interaction.customId === 'jail_role_select') {
            const roleId = interaction.values[0];
            const state = settingsState.get(interaction.user.id);
            if (!state || state.action !== 'set_jail_channel') return interaction.reply({ content: 'انتهت الجلسة، ابدأ من جديد.', ephemeral: true });

            if (!jailChannels[interaction.guild.id]) jailChannels[interaction.guild.id] = {};
            jailChannels[interaction.guild.id]['roleId'] = roleId;
            saveJailConfig();

            await sendSlashLog(
                interaction.guild,
                '⚖️ تحديث رتبة السجن',
                `${interaction.user.tag}`,
                `الرتبة: <@&${roleId}>`
            );
            return await interaction.update({ content: `✅ تم تعيين <@&${roleId}> كرتبة للسجن بنجاح!`, components: [], embeds: [] });
        }

        if (interaction.isStringSelectMenu() && interaction.customId === 'log_type_select') {
            const logType = interaction.values[0];
            settingsState.set(interaction.user.id, { action: 'set_log_channel', logType });
            
            const row = new ActionRowBuilder().addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId('log_channel_select')
                    .setPlaceholder('اختر القناة المخصصة لهذا السجل...')
                    .setChannelTypes([ChannelType.GuildText])
            );
            return await interaction.update({ content: `📍 اختر القناة التي سيتم إرسال سجلات **${logType}** إليها:`, components: [row], embeds: [] });
        }

        if (interaction.isChannelSelectMenu() && interaction.customId === 'log_channel_select') {
            const channelId = interaction.values[0];
            const state = settingsState.get(interaction.user.id);
            if (!state || state.action !== 'set_log_channel') return interaction.reply({ content: 'انتهت الجلسة، ابدأ من جديد.', ephemeral: true });
            
            if (!logChannels[interaction.guild.id]) logChannels[interaction.guild.id] = {};
            logChannels[interaction.guild.id][state.logType] = channelId;
            saveLogs();
            // لوق السلاش
            await sendSlashLog(
                interaction.guild,
                '📢 تغيير قناة سجل',
                `${interaction.user.tag}`,
                `نوع السجل: **${state.logType}**\nالقناة: <#${channelId}>`
            );
            return await interaction.update({ content: `✅ تم تعيين <#${channelId}> كقناة لسجلات **${state.logType}** بنجاح!`, components: [], embeds: [] });
        }

        if (interaction.isChannelSelectMenu() && interaction.customId === 'settings_channels') {
            const channelIds = interaction.values;
            const state = settingsState.get(interaction.user.id);
            if (!state) return interaction.reply({ content: 'انتهت الجلسة، ابدأ من جديد.', ephemeral: true });
            state.channels = channelIds;
            
            const row1 = ActionRowBuilder.from(interaction.message.components[0]);
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('settings_select_all').setLabel('تحديد الكل').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('settings_confirm_channels').setLabel('موافق').setStyle(ButtonStyle.Success).setDisabled(false)
            );
            
            return await interaction.update({ 
                content: `📍 تم اختيار **${channelIds.length}** قناة. اضغط على موافق للاستمرار:`, 
                components: [row1, row2] 
            });
        }

        if (interaction.isRoleSelectMenu() && interaction.customId === 'settings_roles') {
            const roleIds = interaction.values;
            const state = settingsState.get(interaction.user.id);
            if (!state) return interaction.reply({ content: 'انتهت الجلسة، ابدأ من جديد.', ephemeral: true });
            state.roles = roleIds;
            
            const { action, channels } = state;
            const embed = new EmbedBuilder()
                .setTitle('📝 ملخص التغييرات')
                .setDescription(`**الإجراء:** ${action === 'add_access' ? 'إظهار القنوات' : 'إخفاء القنوات'}\n**القنوات:** ${channels.length} قناة\n**الرتب:** ${roleIds.length} رتبة`)
                .setColor(0xf1c40f);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('settings_save').setLabel('حفظ التغييرات').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('settings_cancel').setLabel('إلغاء').setStyle(ButtonStyle.Danger)
            );
            
            return await interaction.update({ 
                content: '📍 يرجى مراجعة الملخص والضغط على حفظ للتنفيذ:', 
                embeds: [embed], 
                components: [row] 
            });
        }

        if (interaction.isButton() && interaction.customId === 'settings_save') {
            const state = settingsState.get(interaction.user.id);
            if (!state) return interaction.reply({ content: 'انتهت الجلسة، ابدأ من جديد.', ephemeral: true });
            const { action, channels, roles } = state;
            const guild = interaction.guild;
            await interaction.update({ content: '⏳ جاري التنفيذ... يرجى الانتظار.', embeds: [], components: [] });
            try {
                for (const channelId of channels) {
                    const channel = guild.channels.cache.get(channelId);
                    if (!channel) continue;
                    for (const roleId of roles) {
                        const role = guild.roles.cache.get(roleId);
                        if (!role) continue;
                        if (action === 'add_access') await channel.permissionOverwrites.edit(role, { ViewChannel: true });
                        else await channel.permissionOverwrites.edit(role, { ViewChannel: false });
                    }
                }
                await interaction.editReply({ content: `✅ تم بنجاح ${action === 'add_access' ? 'إظهار' : 'إخفاء'} القنوات لـ ${roles.length} رتبة!`, embeds: [], components: [] });
                // لوق السلاش
                const chList = channels.map(id => `<#${id}>`).join(', ');
                const rList  = roles.map(id => `<@&${id}>`).join(', ');
                await sendSlashLog(
                    guild,
                    action === 'add_access' ? '👁️ إظهار قنوات' : '🙈 إخفاء قنوات',
                    `${interaction.user.tag}`,
                    `القنوات: ${chList}\nالرتب: ${rList}`
                );
            } catch (e) {
                console.error(e);
                await interaction.editReply({ content: 'حدث خطأ أثناء تعديل الصلاحيات.', embeds: [], components: [] });
            } finally {
                settingsState.delete(interaction.user.id);
            }
            return;
        }

        if (interaction.isButton() && interaction.customId === 'settings_cancel') {
            settingsState.delete(interaction.user.id);
            return await interaction.update({ content: '❌ تم إلغاء العملية.', embeds: [], components: [] });
        }

        
    } catch (error) {
        console.error('حدث خطأ في التفاعل:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'حدث خطأ أثناء معالجة طلبك.', ephemeral: true }).catch(() => {});
        }
    }
});

// معالجة الرسائل
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;
    
    // فحص السيرفر المسموح به
    const allowedGuildId = process.env.GUILD_ID;
    if (allowedGuildId && allowedGuildId !== 'ضع_ايدي_السيرفر_هنا' && message.guild.id !== allowedGuildId) return;

    if (message.system) return; // تجاهل رسائل النظام (انضمام، إلخ)

    const args = message.content.trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    const { guild, member } = message;

    const createEmbed = (title, description, color = 0x0099ff) => {
        return new EmbedBuilder()
            .setTitle(title).setDescription(description).setColor(color).setTimestamp()
            .setFooter({ text: `بواسطة: ${message.author.tag}`, iconURL: message.author.displayAvatarURL() });
    };

    try {
        // === خيار نظامه: نظام العقوبات المخصص ===
        const customCfg = getCustomSys(guild.id);
        if (customCfg.word && commandName === customCfg.word.toLowerCase()) {
            const allowed = customCfg.options.filter(o => CS_OPTIONS[o] && hasPermission(member, CS_OPTIONS[o].category, CS_OPTIONS[o].perm));
            if (allowed.length === 0) return;
            const target = message.mentions.members.first() || (args[0] ? await guild.members.fetch(args[0]).catch(() => null) : null);
            if (!target) return message.reply(`يرجى منشن العضو المستهدف! (مثال: \`${customCfg.word} @فلان\`)`);
            if (target.id === message.author.id) return message.reply('لا يمكنك تطبيق العقوبة على نفسك!');
            const durationArg = args.find(a => !isNaN(parseInt(a)) && a.length < 10);
            const dur = durationArg ? parseInt(durationArg) : 0;
            const menuRow = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`cs_punish_${target.id}_${dur}`)
                    .setPlaceholder('اختر نوع العقوبة...')
                    .addOptions(allowed.map(o => ({
                        label: CS_OPTIONS[o].label,
                        value: o,
                        description: `يُطبق على ${target.user.username}`
                    })))
            );
            return message.reply({ content: `⚙️ **${customCfg.word}** — اختر العقوبة المناسبة لـ ${target}:`, components: [menuRow] });
        }

        if (message.content === 'خواص') {
            const categories = {
                'kick': { label: 'أوامر الطرد', cmds: 'طرد', perm: PermissionsBitField.Flags.KickMembers },
                'ban': { label: 'أوامر الحظر (Ban)', cmds: 'ban، unban', perm: PermissionsBitField.Flags.BanMembers },
                'timeout': { label: 'أوامر الإسكات والميوت', cmds: 'اسكات، ميوت، تكلم، فك', perm: PermissionsBitField.Flags.ModerateMembers },
                'move': { label: 'أوامر الصوت (نقل/سحب)', cmds: 'نقل، سحب', perm: PermissionsBitField.Flags.MoveMembers },
                'clear': { label: 'أوامر المسح', cmds: 'مسح', perm: PermissionsBitField.Flags.ManageMessages },
                'jail': { label: 'أوامر السجن', cmds: 'سجن، عفو', perm: PermissionsBitField.Flags.ManageRoles },
                'warn': { label: 'أوامر التحذير', cmds: 'تحذير', perm: PermissionsBitField.Flags.ModerateMembers },
                'stats': { label: 'رؤية الإحصائيات (cc)', cmds: 'cc', perm: PermissionsBitField.Flags.ModerateMembers },
                'history': { label: 'رؤية السجل الأخير (cr)', cmds: 'cr', perm: PermissionsBitField.Flags.ModerateMembers },
                'nickname': { label: 'أوامر الرتب والأسماء', cmds: 'رول، -رول، اسم', perm: PermissionsBitField.Flags.ManageRoles },
                'channels': { label: 'إدارة وقفل الرومات', cmds: 'قفل، افتح', perm: PermissionsBitField.Flags.ManageChannels }
            };

            // جمع الخواص اللي عنده فقط
            let userKhawas = [];
            for (const [key, data] of Object.entries(categories)) {
                if (hasPermission(member, key, data.perm)) {
                    userKhawas.push(`✅ **${data.label}:** \`${data.cmds}\``);
                }
            }

            // إذا ما عنده أي خاصية — تجاهل بدون رد
            if (userKhawas.length === 0) return;

            const embed = new EmbedBuilder()
                .setTitle('👤 خواصك في السيرفر')
                .setDescription(userKhawas.join('\n'))
                .setColor(0x2ecc71)
                .setTimestamp()
                .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL() });

            return message.reply({ embeds: [embed] });
        }

        if (commandName === 'اوامر' || message.content === '-اوامر') {
            // فحص الشات
            const slashCh = process.env.SLASH_CHANNEL_ID;
            if (slashCh && slashCh !== 'ضع_الايدي_هنا' && message.channelId !== slashCh) return;
            // فحص الرول
            const slashRole = process.env.SLASH_ROLE_ID;
            if (slashRole && slashRole !== 'ضع_الايدي_هنا') {
                const hasRole = member.roles.cache.has(slashRole) || member.permissions.has(PermissionsBitField.Flags.Administrator);
                if (!hasRole) return;
            }

            const embed = new EmbedBuilder()
                .setTitle('⚙️ لوحة التحكم في الصلاحيات')
                .setDescription('اختر الفئة التي تريد إضافة رتب مسموح لها باستخدام أوامرها:')
                .setColor(0x5865f2);

            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_category')
                    .setPlaceholder('اختر الفئة...')
                    .addOptions([
                        { label: 'أوامر الطرد', value: 'kick', description: 'إضافة/إزالة رتب يمكنها استخدام طرد' },
                        { label: 'أوامر الحظر (Ban)', value: 'ban', description: 'إضافة/إزالة رتب يمكنها استخدام باند' },
                        { label: 'أوامر الإسكات (ميوت)', value: 'timeout', description: 'إضافة/إزالة رتب يمكنها استخدام اسكات' },
                        { label: 'أوامر الصوت (نقل/سحب)', value: 'move', description: 'إضافة/إزالة رتب يمكنها استخدام نقل و سحب' },
                        { label: 'أوامر المسح', value: 'clear', description: 'إضافة/إزالة رتب يمكنها استخدام مسح' },
                        { label: 'أوامر السجن', value: 'jail', description: 'إضافة/إزالة رتب يمكنها استخدام سجن' },
                        { label: 'أوامر التحذير', value: 'warn', description: 'إضافة/إزالة رتب يمكنها استخدام تحذير' },
                        { label: 'رؤية الإحصائيات (cc)', value: 'stats', description: 'إضافة/إزالة رتب يمكنها استخدام أمر cc' },
                        { label: 'رؤية السجل الأخير (cr)', value: 'history', description: 'إضافة/إزالة رتب يمكنها استخدام أمر cr' },
                        { label: 'أوامر الأسماء', value: 'nickname', description: 'إضافة/إزالة رتب يمكنها تغيير الأسماء' },
                        { label: 'خيار نظامه (قائمة العقوبات)', value: 'custom_system', description: 'تحديد كلمة النظام وخيارات السجن/طرد/باند/ميوت' },
                        { label: 'عرض معلومات الصلاحيات', value: 'show_info', description: 'عرض الرتب المضافة لكل فئة' },
                    ])
            );

            return message.channel.send({ embeds: [embed], components: [row] });
        }

        if (commandName === 'اعدادات' || message.content === '-اعدادات') {
            // فحص الشات
            const slashCh2 = process.env.SLASH_CHANNEL_ID;
            if (slashCh2 && slashCh2 !== 'ضع_الايدي_هنا' && message.channelId !== slashCh2) return;
            // فحص الرول
            const slashRole2 = process.env.SLASH_ROLE_ID;
            if (slashRole2 && slashRole2 !== 'ضع_الايدي_هنا') {
                const hasRole2 = member.roles.cache.has(slashRole2) || member.permissions.has(PermissionsBitField.Flags.Administrator);
                if (!hasRole2) return;
            }

            const embed = new EmbedBuilder()
                .setTitle('⚙️ إعدادات الرومات والصلاحيات')
                .setDescription('اختر الإجراء الذي تريد القيام به:')
                .setColor(0x00aeef);

            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('settings_action')
                    .setPlaceholder('اختر الإجراء...')
                    .addOptions([
                        { label: 'إظهار رومات لرتبة', value: 'add_access', description: 'منح رتبة صلاحية رؤية رومات محددة' },
                        { label: 'إخفاء رومات عن رتبة', value: 'remove_access', description: 'سحب صلاحية رؤية رومات محددة من رتبة' },
                        { label: 'إعدادات قنوات السجن', value: 'manage_jail', description: 'تحديد شات وروم صوتي للمسجونين' },
                        { label: 'إعدادات قنوات السجل (Log)', value: 'manage_logs', description: 'تحديد قنوات لإرسال سجلات العقوبات' },
                        { label: 'قفل/فتح الثريدز (Threads)', value: 'manage_threads', description: 'منع أو السماح بإنشاء وحذف الثريدز في السيرفر' },
                        { label: 'قفل/فتح أوامر السلاش (Slash)', value: 'manage_slash', description: 'منع أو السماح باستخدام أوامر السلاش في السيرفر' },
                    ])
            );

            return message.channel.send({ embeds: [embed], components: [row] });
        }

        if (commandName === 'باند' || commandName === 'ban') {
            if (!hasPermission(member, 'ban', PermissionsBitField.Flags.BanMembers)) return;
            
            // محاولة جلب العضو أو التعامل مع الأيدي مباشرة
            let targetId = message.mentions.users.first()?.id || args[0];
            if (!targetId) return message.reply('يرجى منشن العضو أو وضع الأيدي الخاص به!');

            if (targetId === message.author.id) return message.reply('لا يمكنك حظر نفسك!');

            const reason = args.slice(1).join(' ') || 'لا يوجد سبب محدد';

            try {
                // فحص إذا كان العضو موجوداً للتحقق من الرتب
                const targetMember = await guild.members.fetch(targetId).catch(() => null);
                if (targetMember) {
                    if (targetMember.roles.highest.position >= member.roles.highest.position && message.author.id !== guild.ownerId) {
                        return message.reply('لا يمكنك حظر عضو برتبة أعلى منك أو مساوية لك!');
                    }
                    if (!targetMember.bannable) return message.reply('لا يمكنني حظر هذا العضو (رتبته أعلى مني)!');
                }

                // تنفيذ الحظر على مستوى السيرفر (ID)
                await guild.bans.create(targetId, { reason, deleteMessageSeconds: 7 * 24 * 60 * 60 });
                
                const msg = await message.channel.send(`✅ تم حظر **${targetMember ? targetMember.user.tag : targetId}** بنجاح من السيرفر.`);
                setTimeout(() => { msg.delete().catch(() => {}); message.delete().catch(() => {}); }, 4000);

                const logEmbed = createLogEmbed('🚫 سجل حظر', targetMember || { user: { tag: targetId, id: targetId }, displayAvatarURL: () => null }, message.author.tag, reason);
                sendLog(guild, 'ban', logEmbed);
            } catch (e) {
                console.error(e);
                message.reply('حدث خطأ أثناء محاولة الحظر! تأكد من صلاحيات البوت وأن الأيدي صحيح.');
            }
        }

        if (commandName === 'unban') {
            if (!hasPermission(member, 'ban', PermissionsBitField.Flags.BanMembers)) return;
            const targetId = args[0];
            if (!targetId) return message.reply('يرجى وضع الأيدي (ID) الخاص بالعضو لفك حظره!');

            try {
                await guild.members.unban(targetId);
                const msg = await message.channel.send(`✅ تم فك حظر العضو صاحب الأيدي \`${targetId}\` بنجاح.`);
                setTimeout(() => { msg.delete().catch(() => {}); message.delete().catch(() => {}); }, 4000);
                
                const logEmbed = createLogEmbed('🔓 سجل فك حظر', { user: { tag: targetId, id: targetId }, displayAvatarURL: () => null }, message.author.tag, 'تم فك الحظر يدوياً');
                sendLog(guild, 'unmod', logEmbed);
            } catch (e) {
                console.error(e);
                if (e.code === 10026) {
                    message.reply('❌ هذا العضو **ليس محظوراً** في السيرفر حالياً!');
                } else if (e.code === 50013) {
                    message.reply('❌ البوت **لا يملك صلاحية** فك الحظر! تأكد من إعطاء البوت صلاحية `Ban Members`.');
                } else {
                    message.reply('❌ حدث خطأ غير متوقع، تأكد من صحة الأيدي.');
                }
            }
        }

        else if (commandName === 'طرد') {
            if (!hasPermission(member, 'kick', PermissionsBitField.Flags.KickMembers)) return;
            const target = message.mentions.members.first() || (args[0] ? await guild.members.fetch(args[0]).catch(() => null) : null);
            if (!target) return message.reply('يرجى منشن العضو أو وضع الأيدي الخاص به!');
            if (target.id === message.author.id) return message.reply('لا يمكنك طرد نفسك!');
            if (target.roles.highest.position >= member.roles.highest.position && message.author.id !== guild.ownerId) {
                return message.reply('لا يمكنك طرد عضو برتبة أعلى منك أو مساوية لك!');
            }
            const reason = args.slice(1).join(' ') || 'لا يوجد سبب محدد';

            if (!target.kickable) return message.reply('لا يمكنني طرد هذا العضو!');
            await target.kick(reason || 'لا يوجد سبب محدد');
            const msg = await message.channel.send(`✅ تم طرد ${target}`);
            setTimeout(() => {
                msg.delete().catch(() => {});
                message.delete().catch(() => {});
            }, 1000);

            const logEmbed = createLogEmbed('👞 سجل طرد', target, message.author.tag, reason || 'لا يوجد سبب محدد');
            sendLog(guild, 'kick', logEmbed);
        }



        else if (commandName === 'اسكات' || commandName === 'اسكت' || commandName === 'timeout') {
            if (!hasPermission(member, 'timeout', PermissionsBitField.Flags.ModerateMembers)) return;
            const target = message.mentions.members.first() || (args[0] ? await guild.members.fetch(args[0]).catch(() => null) : null);
            if (!target) return message.reply('يرجى منشن العضو أو وضع الأيدي الخاص به!');
            if (target.id === message.author.id) return message.reply('لا يمكنك إسكات نفسك!');
            if (target.roles.highest.position >= member.roles.highest.position && message.author.id !== guild.ownerId) {
                return message.reply('لا يمكنك إسكات عضو برتبة أعلى منك أو مساوية لك!');
            }

            // جلب أو إنشاء رتبة الإسكات
            let muteRole = guild.roles.cache.find(r => r.name === 'إسكات');
            if (!muteRole) {
                try { muteRole = await guild.roles.create({ name: 'إسكات', color: '#818386', reason: 'رتبة الإسكات التلقائية' }); }
                catch (e) { return message.reply('فشل إنشاء رتبة الإسكات!'); }
            }

            // فحص إذا عنده إسكات بالفعل
            if (target.roles.cache.has(muteRole.id)) {
                return message.reply(`⚠️ ${target} **عنده إسكات بالفعل!**`);
            }

            const durationArg = args.find(a => !isNaN(parseInt(a)) && a.length < 10);
            const duration = durationArg ? parseInt(durationArg) : 15;
            const reason = args.filter(a => isNaN(parseInt(a)) && !a.includes('<@')).join(' ') || 'لا يوجد سبب محدد';


            try {
                // ضع الصلاحية على الرتبة (لا على العضو) في القنوات النصية فقط
                const textChannels = guild.channels.cache.filter(c => c.isTextBased());
                for (const [id, ch] of textChannels) {
                    if (ch.permissionOverwrites) {
                        await ch.permissionOverwrites.edit(muteRole, { SendMessages: false }).catch(() => {});
                    }
                }

                await target.roles.add(muteRole);
                await message.react('✅').catch(() => {});
                addStat(target.id, 'timeout', message.author.tag);

                const logEmbed = createLogEmbed('🔇 سجل إسكات', target, message.author.tag, reason, duration ? `${duration} دقيقة` : 'دائم');
                sendLog(guild, 'timeout', logEmbed);

                punishmentExecutors[target.id] = {
                    executorId: message.author.id,
                    type: 'timeout',
                    expiresAt: duration ? Date.now() + (duration * 60000) : null
                };
                savePunishments();
            } catch (e) {
                console.error(e);
                message.reply('❌ حدث خطأ! تأكد من أن رتبة البوت أعلى من رتبة العضو.');
            }
        }

        else if (commandName === 'ميوت') {
            if (!hasPermission(member, 'timeout', PermissionsBitField.Flags.MuteMembers)) return;
            const target = message.mentions.members.first() || (args[0] ? await guild.members.fetch(args[0]).catch(() => null) : null);
            if (!target) return message.reply('يرجى منشن العضو أو وضع الأيدي الخاص به!');
            if (target.id === message.author.id) return message.reply('لا يمكنك عمل ميوت لنفسك!');
            if (target.roles.highest.position >= member.roles.highest.position && message.author.id !== guild.ownerId) {
                return message.reply('لا يمكنك ميوت عضو برتبة أعلى منك أو مساوية لك!');
            }
            if (!target.voice.channel) return message.reply('العضو يجب أن يكون في روم صوتي!');

            // ❌ فحص: هل الشخص عنده ميوت صوتي بالفعل؟
            if (target.voice.serverMute) {
                const warnMsg = await message.reply(`⚠️ ${target} **عنده ميوت صوتي بالفعل!** لا يمكن إعطاؤه ميوت مرة ثانية.`);
                setTimeout(() => { warnMsg.delete().catch(() => {}); message.delete().catch(() => {}); }, 4000);
                return;
            }
            
            const durationArg = args.find(a => !isNaN(parseInt(a)) && a.length < 10);
            const duration = durationArg ? parseInt(durationArg) : 15;


            try {
                const freshMember = await guild.members.fetch(target.id);
                console.log(`محاولة عمل ميوت لـ ${freshMember.user.tag} في سيرفر ${guild.name}`);
                
                if (!freshMember.voice.channel) {
                    console.log('فشل: العضو ليس في روم صوتي');
                    return message.reply('❌ العضو يجب أن يكون في روم صوتي!');
                }
                
                await freshMember.voice.setMute(true);
                console.log('نجاح: تم تنفيذ الميوت في ديسكورد');
                addStat(target.id, 'mute', message.author.tag);
                
                let response = `تم الميوت الصوتي 🎙️❌ لـ ${target}`;
                if (duration) {
                    response += `\n**المدة:** ${duration} دقيقة`;
                    setTimeout(async () => {
                        try {
                            const m = await guild.members.fetch(target.id);
                            if (m && m.voice.channel) await m.voice.setMute(false).catch(() => {});
                        } catch (e) {}
                    }, duration * 60 * 1000);
                }
                await message.react('✅').catch(() => {});

                const reason = args.filter(a => isNaN(parseInt(a)) && !a.includes('<@')).join(' ') || 'لا يوجد سبب محدد';
                const logEmbed = createLogEmbed('🎙️ سجل ميوت صوتي', target, message.author.tag, reason, duration ? `${duration} دقيقة` : null);
                sendLog(guild, 'mute', logEmbed);

                punishmentExecutors[target.id] = { 
                    executorId: message.author.id, 
                    type: 'mute',
                    expiresAt: duration ? Date.now() + (duration * 60000) : null 
                };
                savePunishments();
            } catch (e) {
                console.error(e);
                if (e.code === 50013) {
                    message.reply('❌ ليس لدي صلاحية لعمل ميوت لهذا الشخص (تأكد من رتبة البوت)!');
                } else {
                    message.reply('❌ حدث خطأ! تأكد أن العضو موجود في روم صوتي حالياً.');
                }
            }
        }

        else if (commandName === 'تكلم') {
            if (!hasPermission(member, 'timeout', PermissionsBitField.Flags.ModerateMembers)) return;
            const target = message.mentions.members.first() || (args[0] ? await guild.members.fetch(args[0]).catch(() => null) : null);
            if (!target) return message.reply('يرجى منشن العضو أو وضع الأيدي الخاص به!');

            // تحقق من المنفذ
            if (punishmentExecutors[target.id] && punishmentExecutors[target.id].executorId !== message.author.id && message.author.id !== guild.ownerId) {
                return message.reply('❌ لا يمكنك فك الإسكات عن هذا الشخص لأنك لست من أعطاه الإسكات!');
            }

            const muteRole = guild.roles.cache.find(r => r.name === 'إسكات');
            if (!muteRole || !target.roles.cache.has(muteRole.id)) {
                return message.reply('هذا العضو ليس لديه إسكات حالياً!');
            }

            try {
                await target.roles.remove(muteRole);
                await message.react('✅').catch(() => {});

                delete punishmentExecutors[target.id];
                savePunishments();

                const logEmbed = createLogEmbed('🔊 سجل فك إسكات', target, message.author.tag, 'تم فك الإسكات يدوياً');
                sendLog(guild, 'unmod', logEmbed);
            } catch (e) {
                console.error(e);
                message.reply('حدث خطأ أثناء محاولة فك الإسكات!');
            }
        }

        else if (commandName === 'فك') {
            if (!hasPermission(member, 'timeout', PermissionsBitField.Flags.MuteMembers)) return;
            const target = message.mentions.members.first() || (args[0] ? await guild.members.fetch(args[0]).catch(() => null) : null);
            if (!target) return message.reply('يرجى منشن العضو أو وضع الأيدي الخاص به!');
            
            // تحقق من المنفذ
            if (punishmentExecutors[target.id] && punishmentExecutors[target.id].executorId !== message.author.id && message.author.id !== guild.ownerId) {
                return message.reply('❌ لا يمكنك فك الميوت عن هذا الشخص لأنك لست من أعطاه الميوت!');
            }

            if (!target.voice.channel || !target.voice.serverMute) {
                return message.reply('هذا العضو ليس لديه ميوت صوتي حالياً!');
            }

            try {
                await target.voice.setMute(false).catch(() => {});
                await target.timeout(null).catch(() => {});
                await message.react('✅').catch(() => {});

                const logEmbed = createLogEmbed('🔊 سجل فك ميوت صوتي', target, message.author.tag, 'تم فك الميوت يدوياً');
                sendLog(guild, 'unmod', logEmbed);
            } catch (e) {
                console.error(e);
                message.reply('حدث خطأ أثناء محاولة فك الميوت!');
            }
        }

        else if (commandName === 'نقل' || commandName === 'سحب') {
            if (!hasPermission(member, 'move', PermissionsBitField.Flags.MoveMembers)) return;
            const target = message.mentions.members.first() || (args[0] ? await guild.members.fetch(args[0]).catch(() => null) : null);
            if (!target) return message.reply('يرجى منشن العضو أو وضع الأيدي الخاص به!');
            
            let channel;
            if (commandName === 'نقل') {
                const channelId = args.find(a => a.includes('<#'))?.replace(/[<#>]/g, '') || args.find(a => guild.channels.cache.has(a));
                channel = guild.channels.cache.get(channelId);
            } else {
                channel = member.voice.channel;
            }

            if (!channel || !target.voice.channel) return message.reply('تأكد من وجود العضو في روم صوتي!');
            await target.voice.setChannel(channel);
            await message.channel.send({ embeds: [createEmbed(`تم ${commandName === 'نقل' ? 'النقل' : 'السحب'} بنجاح`, `**العضو:** ${target}\n**إلى:** ${channel}`, 0x00ff00)] });
        }

        else if (commandName === 'سجن') {
            if (!hasPermission(member, 'jail', PermissionsBitField.Flags.ManageRoles)) return;
            const target = message.mentions.members.first() || (args[0] ? await guild.members.fetch(args[0]).catch(() => null) : null);
            if (!target) return message.reply('يرجى منشن العضو أو وضع الأيدي الخاص به!');
            if (target.id === message.author.id) return message.reply('لا يمكنك سجن نفسك!');
            if (target.roles.highest.position >= member.roles.highest.position && message.author.id !== guild.ownerId) {
                return message.reply('لا يمكنك سجن عضو برتبة أعلى منك أو مساوية لك!');
            }

            // ❌ فحص: هل الشخص في السجن بالفعل؟
            const jailRoleCheck = guild.roles.cache.find(r => r.name === 'S-JAIL' || r.name === 'سجن' || r.name === 'Sجن' || r.name.toLowerCase() === 'jail');
            if (jailRoleCheck && target.roles.cache.has(jailRoleCheck.id)) {
                const warnMsg = await message.reply(`⚠️ ${target} **في السجن بالفعل!** لا يمكن سجنه مرة ثانية.`);
                setTimeout(() => { warnMsg.delete().catch(() => {}); message.delete().catch(() => {}); }, 4000);
                return;
            }

            const durationArg = args.find(a => !isNaN(parseInt(a)) && a.length < 10);
            let days = durationArg ? parseInt(durationArg) : 3;
            if (days < 1) days = 1;
            if (days > 90) days = 90;
            const duration = days * 24 * 60; // Convert days to minutes
            const reason = args.filter(a => isNaN(parseInt(a)) && !a.includes('<@')).join(' ') || 'سجن قسري';

            const config = jailChannels[guild.id] || {};
            let jailRole = config.roleId ? guild.roles.cache.get(config.roleId) : guild.roles.cache.find(r => r.name.toLowerCase() === 'jail' || r.name === 'سجن' || r.name === 'Sجن');
            if (!jailRole) jailRole = await guild.roles.create({ name: 'Sجن', color: 0x34495e });
            
            try {
                // حفظ الرتب القديمة قبل السجن القسري
                const oldRoles = target.roles.cache.filter(r => r.name !== '@everyone' && r.id !== jailRole.id).map(r => r.id);
                jailedRoles[target.id] = oldRoles;
                saveJailedRoles();

                await target.roles.set([jailRole]);
                await target.timeout(null).catch(() => {}); // 🔓 فك أي تايم أوت قديم فوراً
                await applyJail(target); // 🔒 إخفاء الرومات وفتح قنوات السجن
                addStat(target.id, 'jail', message.author.tag);
                const msg = await message.channel.send(`⚖️ تم سجن ${target}\n**المدة:** ${days} يوم/أيام`);
                setTimeout(() => {
                    msg.delete().catch(() => {});
                    message.delete().catch(() => {});
                }, 1000);

                const logEmbed = createLogEmbed('⛓️ سجل سجن', target, message.author.tag, reason, `${days} يوم/أيام`);
                sendLog(guild, 'jail', logEmbed);

                // تسجيل المنفذ مع وقت الانتهاء
                punishmentExecutors[target.id] = { 
                    executorId: message.author.id, 
                    type: 'jail',
                    expiresAt: Date.now() + (duration * 60000)
                };
                savePunishments();
            } catch (e) {
                console.error(e);
                const errSuffix = e.code === 50013 ? '\n⚠️ **السبب:** رتبة البوت أقل من رتبة العضو أو رتبة السجن!' : '';
                const errMsg = await message.reply(`❌ حدث خطأ أثناء محاولة السجن!${errSuffix}`);
                setTimeout(() => {
                    errMsg.delete().catch(() => {});
                    message.delete().catch(() => {});
                }, 5000);
            }
        }

        else if (commandName === 'عفو' || commandName === 'فك_سجن' || commandName === 'سس') {
            if (!hasPermission(member, 'jail', PermissionsBitField.Flags.ManageRoles)) return;
            const target = message.mentions.members.first() || (args[0] ? await guild.members.fetch(args[0]).catch(() => null) : null);
            if (!target) return message.reply('يرجى منشن العضو أو وضع الأيدي الخاص به!');

            // تحقق من المنفذ
            if (punishmentExecutors[target.id] && punishmentExecutors[target.id].executorId !== message.author.id && message.author.id !== guild.ownerId) {
                return message.reply('❌ لا يمكنك العفو عن هذا الشخص لأنك لست من سجنه!');
            }

            const config = jailChannels[guild.id] || {};
            const jailRole = config.roleId ? guild.roles.cache.get(config.roleId) : guild.roles.cache.find(r => r.name === 'S-JAIL' || r.name === 'سجن' || r.name === 'Sجن' || r.name.toLowerCase() === 'jail');
            if (jailRole && target.roles.cache.has(jailRole.id)) {
                try {
                    // استعادة الرتب من التخزين
                    const rolesToRestore = jailedRoles[target.id] || [];
                    await target.roles.set(rolesToRestore).catch(async () => {
                        // إذا فشل الـ set (بسبب رتبة أعلى)، نحاول الـ remove للـ jail فقط
                        await target.roles.remove(jailRole).catch(() => {});
                    });
                    
                    delete jailedRoles[target.id];
                    saveJailedRoles();
                    delete punishmentExecutors[target.id];
                    savePunishments();

                    await removeJail(target); // 🔓 إظهار الرومات
                    const msg = await message.channel.send(`✅ تم العفو عن ${target} وإعادة صلاحياته.`);
                    setTimeout(() => {
                        msg.delete().catch(() => {});
                        message.delete().catch(() => {});
                    }, 4000);

                    const logEmbed = createLogEmbed('🔓 سجل عفو', target, message.author.tag, 'تم العفو يدوياً');
                    sendLog(guild, 'unmod', logEmbed);
                } catch (e) {
                    console.error(e);
                    message.reply('حدث خطأ أثناء محاولة فك السجن!');
                }
            } else {
                message.reply('هذا العضو ليس في السجن!');
            }
        }

        else if (commandName === 'تحذير' || commandName === 'warn') {
            if (!hasPermission(member, 'warn', PermissionsBitField.Flags.ModerateMembers)) return;
            const target = message.mentions.members.first() || (args[0] ? await guild.members.fetch(args[0]).catch(() => null) : null);
            if (!target) return message.reply('يرجى منشن العضو أو وضع الأيدي الخاص به!');
            if (target.id === message.author.id) return message.reply('لا يمكنك تحذير نفسك!');
            if (target.roles.highest.position >= member.roles.highest.position && message.author.id !== guild.ownerId) {
                return message.reply('لا يمكنك تحذير عضو برتبة أعلى منك أو مساوية لك!');
            }
            
            const reason = args.slice(1).join(' ');
            

            const finalReason = reason || 'لا يوجد سبب محدد';
            
            const warnEmbed = new EmbedBuilder()
                .setTitle('⚠️ تحذير رسمي')
                .setDescription(`لقد تلقيت تحذيراً في سيرفر **${guild.name}**`)
                .addFields(
                    { name: 'بواسطة:', value: `${message.author.tag}`, inline: true },
                    { name: 'السبب:', value: `${reason}`, inline: true }
                )
                .setColor(0xffcc00)
                .setTimestamp();

            try {
                await target.send({ embeds: [warnEmbed] });
                addStat(target.id, 'warn', message.author.tag);
                const msg = await message.channel.send(`✅ تم تحذير ${target}`);
                setTimeout(() => {
                    msg.delete().catch(() => {});
                    message.delete().catch(() => {});
                }, 1000);

                const logEmbed = createLogEmbed('⚠️ سجل تحذير', target, message.author.tag, finalReason);
                sendLog(guild, 'warn', logEmbed);
            } catch (e) {
                addStat(target.id, 'warn', message.author.tag);
                const msg = await message.channel.send(`✅ تم تحذير ${target} (الخاص مغلق)`);
                setTimeout(() => {
                    msg.delete().catch(() => {});
                    message.delete().catch(() => {});
                }, 1000);

                const logEmbed = createLogEmbed('⚠️ سجل تحذير (الخاص مغلق)', target, message.author.tag, finalReason);
                sendLog(guild, 'warn', logEmbed);
            }
        }

        else if (commandName === 'cr' || commandName === 'Cr') {
            if (!hasPermission(member, 'history', PermissionsBitField.Flags.ModerateMembers)) return;
            
            let targetUser = message.mentions.users.first();
            const userId = args[0] || (targetUser ? targetUser.id : null);
            
            if (!userId) return message.reply('يرجى منشن العضو أو وضع الأيدي الخاص به!');
            
            if (!targetUser) {
                try {
                    targetUser = await client.users.fetch(userId);
                } catch (e) {
                    return message.reply('لم يتم العثور على هذا العضو!');
                }
            }

            const stats = userStats[targetUser.id] || { history: [] };
            const history = stats.history || [];
            
            const historyEmbed = new EmbedBuilder()
                .setTitle(`📜 آخر العقوبات: ${targetUser.tag}`)
                .setThumbnail(targetUser.displayAvatarURL())
                .setColor(0xe74c3c)
                .setTimestamp();

            if (history.length === 0) {
                historyEmbed.setDescription('لا يوجد سجل عقوبات مسجل لهذا العضو حالياً.');
            } else {
                let desc = '';
                history.forEach((entry, index) => {
                    desc += `**${index + 1}. [${entry.type}]**\n> 👤 بواسطة: ${entry.executor}\n> 📅 التاريخ: ${entry.date}\n\n`;
                });
                historyEmbed.setDescription(desc);
            }

            const msg = await message.channel.send({ embeds: [historyEmbed] });
            setTimeout(() => {
                msg.delete().catch(() => {});
                message.delete().catch(() => {});
            }, 1000);
        }

        else if (commandName === 'cc' || commandName === 'Cc') {
            if (!hasPermission(member, 'stats', PermissionsBitField.Flags.ModerateMembers)) return;
            
            let targetUser = message.mentions.users.first();
            const userId = args[0] || (targetUser ? targetUser.id : null);
            
            if (!userId) return message.reply('يرجى منشن العضو أو وضع الأيدي الخاص به!');
            
            if (!targetUser) {
                try {
                    targetUser = await client.users.fetch(userId);
                } catch (e) {
                    return message.reply('لم يتم العثور على هذا العضو، تأكد من الأيدي!');
                }
            }

            const stats = userStats[targetUser.id] || { timeout: 0, mute: 0, warn: 0 };
            
            const statsEmbed = new EmbedBuilder()
                .setTitle(`📊 إحصائيات العقوبات: ${targetUser.tag}`)
                .setThumbnail(targetUser.displayAvatarURL())
                .addFields(
                    { name: '🔇 عدد الإسكاتات (الشات):', value: `\`${stats.timeout || 0}\``, inline: false },
                    { name: '🎙️ عدد الميوتات (الصوت):', value: `\`${stats.mute || 0}\``, inline: false },
                    { name: '⚠️ عدد التحذيرات:', value: `\`${stats.warn || 0}\``, inline: false }
                )
                .setColor(0x3498db)
                .setTimestamp()
                .setFooter({ text: `طلب بواسطة: ${message.author.tag}` });

            const msg = await message.channel.send({ embeds: [statsEmbed] });
            setTimeout(() => {
                msg.delete().catch(() => {});
                message.delete().catch(() => {});
            }, 5000); // تركتها 5 ثواني هنا ليقرأ الإحصائيات، إذا أردت ثانية واحدة غيرها
        }

        else if (commandName === 'اسم' || commandName === 'لقب') {
            if (!hasPermission(member, 'nickname', PermissionsBitField.Flags.ManageNicknames)) return;
            const target = message.mentions.members.first();
            if (!target) return message.reply('يرجى منشن العضو!');
            
            const newName = args.slice(1).join(' ');
            if (!newName) return message.reply('يرجى كتابة الاسم الجديد!');

            try {
                if (target.roles.highest.position >= member.roles.highest.position && message.author.id !== guild.ownerId) {
                    return message.reply('لا يمكنك تغيير اسم عضو برتبة أعلى منك أو مساوية لك!');
                }
                await target.setNickname(newName);
                const msg = await message.channel.send(`✅ تم تغيير اسم ${target}`);
                setTimeout(() => {
                    msg.delete().catch(() => {});
                    message.delete().catch(() => {});
                }, 1000);
            } catch (e) {
                console.error(e);
                message.reply('حدث خطأ أثناء محاولة تغيير الاسم، تأكد من صلاحيات البوت!');
            }
        }


        else if (commandName === 'مسح' || commandName === 'clear') {
            if (!hasPermission(member, 'clear', PermissionsBitField.Flags.ManageMessages)) return;
            const target = message.mentions.users.first();
            let amount = 100;
            for (const arg of args) { const num = parseInt(arg); if (!isNaN(num)) { amount = num; break; } }
            const finalAmount = Math.min(amount, 100);
            await message.delete().catch(() => {});
            if (target) {
                const messages = await message.channel.messages.fetch({ limit: 100 });
                const userMessages = messages.filter(m => m.author.id === target.id).first(finalAmount);
                if (userMessages.length > 0) {
                    await message.channel.bulkDelete(userMessages, true);
                    const reply = await message.channel.send(`تم مسح ${userMessages.length} رسالة من ${target} ✅`);
                    setTimeout(() => reply.delete().catch(() => {}), 1000);
                }
            } else {
                await message.channel.bulkDelete(finalAmount, true);
                const reply = await message.channel.send(`تم مسح ${finalAmount} رسالة ✅`);
                setTimeout(() => reply.delete().catch(() => {}), 1000);
            }
        }

        else if (commandName === 'رول' || commandName === '-رول') {
            if (!hasPermission(member, 'nickname', PermissionsBitField.Flags.ManageRoles)) return;
            
            const isAdd = commandName === 'رول';
            const target = message.mentions.members.first() || (args[0] ? await guild.members.fetch(args[0]).catch(() => null) : null);
            if (!target) return message.reply('يرجى منشن العضو أو وضع الأيدي الخاص به!');

            // جلب الرتبة (منشن، أيدي، أو اسم)
            const roleInput = args.slice(1).join(' ').replace(/[<@&>]/g, '');
            const role = message.mentions.roles.first() || guild.roles.cache.get(roleInput) || guild.roles.cache.find(r => r.name.toLowerCase() === args.slice(1).join(' ').toLowerCase());
            
            if (!role) return message.reply('لم يتم العثور على هذه الرتبة! تأكد من الاسم أو المنشن أو الأيدي.');

            // فحص الصلاحيات
            if (role.position >= member.roles.highest.position && message.author.id !== guild.ownerId) {
                return message.reply('لا يمكنك إعطاء أو سحب رتبة أعلى من رتبتك أو مساوية لها!');
            }

            try {
                if (isAdd) {
                    if (target.roles.cache.has(role.id)) return message.reply('العضو يملك هذه الرتبة بالفعل!');
                    await target.roles.add(role);
                    await message.react('✅').catch(() => {});
                } else {
                    if (!target.roles.cache.has(role.id)) return message.reply('العضو لا يملك هذه الرتبة في الأصل!');
                    await target.roles.remove(role);
                    await message.react('✅').catch(() => {});
                }

                const logEmbed = createLogEmbed(isAdd ? '➕ سجل إضافة رتبة' : '➖ سجل سحب رتبة', target, message.author.tag, `الرتبة: ${role.name}`);
                sendLog(guild, 'role_logs', logEmbed);
            } catch (e) {
                console.error(e);
                message.reply('حدث خطأ أثناء محاولة تعديل الرتب! (تأكد من رتبة البوت)');
            }
        }

        else if (commandName === 'قفل' || commandName === 'lock') {
            if (!hasPermission(member, 'channels', PermissionsBitField.Flags.ManageChannels)) return;
            try {
                console.log(`[DEBUG] Locking channel: ${message.channel.name} by ${message.author.tag}`);
                // 1. قفل لـ @everyone
                await message.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
                
                // 2. السماح للمنفذ نفسه (عضو) لضمان قدرته على الكلام دائماً
                await message.channel.permissionOverwrites.edit(member, { SendMessages: true });

                // 3. السماح للرتب التي هي بنفس مستواك أو أعلى
                const myHighestPos = member.roles.highest.position;
                const roles = guild.roles.cache.filter(r => r.position >= myHighestPos && r.name !== '@everyone' && !r.managed);
                
                console.log(`[DEBUG] Allowing ${roles.size} roles higher/equal to position ${myHighestPos}`);
                for (const [id, role] of roles) {
                    await message.channel.permissionOverwrites.edit(role, { SendMessages: true }).catch(() => {});
                }

                await message.react('✅').catch(() => {});
            } catch (e) { 
                console.error(e);
                message.reply('حدث خطأ أثناء قفل الروم!'); 
            }
        }

        else if (commandName === 'افتح' || commandName === 'unlock') {
            if (!hasPermission(member, 'channels', PermissionsBitField.Flags.ManageChannels)) return;
            try {
                console.log(`[DEBUG] Attempting to unlock channel: ${message.channel.name}`);
                
                // 1. فتح لـ @everyone (ننفذها أولاً وبشكل منفصل)
                await message.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
                
                // 2. تصفير استثناءات الرتب والأعضاء بشكل متوازي لتسريع العملية
                const overwrites = message.channel.permissionOverwrites.cache;
                const promises = [];
                
                for (const [id, overwrite] of overwrites) {
                    if (id !== guild.roles.everyone.id) {
                        promises.push(
                            message.channel.permissionOverwrites.edit(id, { SendMessages: null })
                                .catch(err => console.error(`[ERROR] Failed to reset overwrite for ${id}: ${err}`))
                        );
                    }
                }

                if (promises.length > 0) {
                    await Promise.all(promises);
                    console.log(`[DEBUG] Reset ${promises.length} overwrites.`);
                }

                await message.react('✅').catch(err => console.error(`[ERROR] Failed to react: ${err}`));
                console.log(`[DEBUG] Successfully unlocked and reacted in: ${message.channel.name}`);
            } catch (e) { 
                console.error(e);
                message.reply('حدث خطأ أثناء فتح الروم!'); 
            }
        }
    } catch (e) { console.error(e); }
});

// سجلات إنشاء وحذف وتعديل الرومات
client.on('channelCreate', async channel => {
    if (!channel.guild) return;
    const logChannelId = logChannels[channel.guild.id]?.['channel_logs'];
    if (!logChannelId) return;
    const logChannel = channel.guild.channels.cache.get(logChannelId);
    if (!logChannel) return;

    // محاولة جلب الشخص الذي أنشأ الروم من الـ Audit Logs
    const auditLogs = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelCreate }).catch(() => null);
    const entry = auditLogs?.entries.first();
    const executor = entry ? entry.executor.tag : 'غير معروف';

    const embed = new EmbedBuilder()
        .setTitle('🆕 إنشاء روم جديد')
        .setColor(0x2ecc71)
        .addFields(
            { name: '👤 بواسطة:', value: `${executor}`, inline: true },
            { name: '📍 الروم:', value: `${channel.name} (\`${channel.id}\`)`, inline: true },
            { name: '📁 النوع:', value: `${channel.type}`, inline: true }
        )
        .setTimestamp();
    await logChannel.send({ embeds: [embed] }).catch(() => {});
});

client.on('channelDelete', async channel => {
    if (!channel.guild) return;
    const logChannelId = logChannels[channel.guild.id]?.['channel_logs'];
    if (!logChannelId) return;
    const logChannel = channel.guild.channels.cache.get(logChannelId);
    if (!logChannel) return;

    const auditLogs = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelDelete }).catch(() => null);
    const entry = auditLogs?.entries.first();
    const executor = entry ? entry.executor.tag : 'غير معروف';

    const embed = new EmbedBuilder()
        .setTitle('🗑️ حذف روم')
        .setColor(0xff0000)
        .addFields(
            { name: '👤 بواسطة:', value: `${executor}`, inline: true },
            { name: '📍 الروم المحذوف:', value: `${channel.name}`, inline: true },
            { name: '🆔 الأيدي:', value: `\`${channel.id}\``, inline: true }
        )
        .setTimestamp();
    await logChannel.send({ embeds: [embed] }).catch(() => {});
});

client.on('channelUpdate', async (oldChannel, newChannel) => {
    if (!newChannel.guild) return;
    const logChannelId = logChannels[newChannel.guild.id]?.['channel_logs'];
    if (!logChannelId) return;
    const logChannel = newChannel.guild.channels.cache.get(logChannelId);
    if (!logChannel) return;

    let changes = [];
    if (oldChannel.name !== newChannel.name) changes.push(`**الاسم:** ${oldChannel.name} ➡️ ${newChannel.name}`);
    if (oldChannel.parentId !== newChannel.parentId) changes.push(`**التصنيف:** <#${oldChannel.parentId}> ➡️ <#${newChannel.parentId}>`);
    

    if (changes.length > 0) {
        const auditLogs = await newChannel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelUpdate }).catch(() => null);
        const entry = auditLogs?.entries.first();
        
        // إذا كان المنفذ هو البوت نفسه، نتجاهل السجل لمنع السبام أثناء القفل والفتح
        if (entry && entry.executor.id === client.user.id) return;

        const executor = entry ? entry.executor.tag : 'غير معروف';

        const embed = new EmbedBuilder()
            .setTitle('📝 تعديل في القناة')
            .setColor(0x3498db)
            .setDescription(`**القناة:** ${newChannel}\n**المسؤول:** ${executor}\n\n**التغييرات:**\n${changes.join('\n')}`)
            .setTimestamp();
        await logChannel.send({ embeds: [embed] }).catch(() => {});
    }
});

// تطبيق قفل الثريدز وأوامر السلاش التلقائي على القنوات الجديدة
client.on('channelCreate', async channel => {
    if (!channel.guild) return;
    const settings = serverSettings[channel.guild.id];
    if (settings) {
        const overrides = {};
        if (settings.threadsLocked) {
            overrides.CreatePublicThreads = false;
            overrides.CreatePrivateThreads = false;
            overrides.ManageThreads = false;
        }
        if (settings.slashLocked) {
            overrides.UseApplicationCommands = false;
        }

        if (Object.keys(overrides).length > 0) {
            if (channel.isTextBased() || channel.type === ChannelType.GuildForum || channel.type === ChannelType.GuildVoice) {
                await channel.permissionOverwrites.edit(channel.guild.roles.everyone, overrides).catch(() => {});
            }
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
// سجل حذف الرسائل والصور
client.on('messageDelete', async message => {
    if (message.partial || message.author?.bot || !message.guild) return;

    const hasMedia = message.attachments.some(a => a.contentType?.startsWith('image/') || a.contentType?.startsWith('video/'));
    
    // تحديد القناة بناءً على وجود وسائط
    const category = hasMedia ? 'image_logs' : 'message_logs';
    const logChannelId = logChannels[message.guild.id]?.[category];
    if (!logChannelId) return;

    const channel = message.guild.channels.cache.get(logChannelId);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setTitle(hasMedia ? '📁 سجل حذف وسائط (صورة/فيديو)' : '🗑️ سجل حذف رسالة')
        .setColor(hasMedia ? 0xff0000 : 0xffa500)
        .addFields(
            { name: '👤 كاتب الرسالة:', value: `${message.author} (\`${message.author.id}\`)`, inline: false },
            { name: '📍 القناة:', value: `${message.channel}`, inline: true },
            { name: '🆔 أيدي الرسالة:', value: `\`${message.id}\``, inline: true },
            { name: '📄 المحتوى:', value: message.content || (hasMedia ? '*تحتوي على وسائط فقط*' : '*لا يوجد محتوى نصي*'), inline: false }
        )
        .setTimestamp();

    const attachment = hasMedia ? message.attachments.first() : null;
    const isVideo = attachment?.contentType?.startsWith('video/');

    if (hasMedia) {
        if (attachment.contentType?.startsWith('image/')) {
            embed.setImage(attachment.proxyURL);
        }
        embed.addFields({ name: '📎 نوع الوسائط:', value: attachment.contentType || 'غير معروف' });
    }

    // إرسال الـ Embed ومع إعادة رفع الملف ليظهر كمشغل فيديو حقيقي
    const sendOptions = { embeds: [embed] };
    
    if (hasMedia) {
        // إعادة إرفاق الملف ليتم رفعه في قناة السجل
        sendOptions.files = [{
            attachment: attachment.proxyURL,
            name: attachment.name
        }];
    }

    await channel.send(sendOptions).catch(err => {
        console.error('خطأ أثناء إرسال سجل الوسائط:', err);
    });
});

// سجل تعديل الرسائل
client.on('messageUpdate', async (oldMessage, newMessage) => {
    if (oldMessage.partial || oldMessage.author?.bot || !oldMessage.guild) return;
    if (oldMessage.content === newMessage.content) return;

    // استخدام نفس قناة الرسائل المحذوفة
    const logChannelId = logChannels[oldMessage.guild.id]?.['message_logs'];
    if (!logChannelId) return;

    const channel = oldMessage.guild.channels.cache.get(logChannelId);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setTitle('📝 سجل تعديل رسالة')
        .setColor(0x3498db)
        .addFields(
            { name: '👤 كاتب الرسالة:', value: `${oldMessage.author} (\`${oldMessage.author.id}\`)`, inline: false },
            { name: '📍 القناة:', value: `${oldMessage.channel}`, inline: true },
            { name: '🆔 أيدي الرسالة:', value: `\`${oldMessage.id}\``, inline: true },
            { name: '⬅️ قبل التعديل:', value: oldMessage.content || '*لا يوجد محتوى نصي*', inline: false },
            { name: '➡️ بعد التعديل:', value: newMessage.content || '*لا يوجد محتوى نصي*', inline: false }
        )
        .setTimestamp();

    await channel.send({ embeds: [embed] }).catch(() => {});
});
// سجل تغيير الرتب (تلقائي ويدوي)
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;

    const logChannelId = logChannels[newMember.guild.id]?.['role_logs'];
    if (!logChannelId) return;

    const channel = newMember.guild.channels.cache.get(logChannelId);
    if (!channel) return;

    // رتب أضيفت
    const addedRoles = newRoles.filter(role => !oldRoles.has(role.id));
    addedRoles.forEach(async role => {
        const embed = new EmbedBuilder()
            .setTitle('➕ رتبة مضافة (تغيير خارجي)')
            .setColor(0x2ecc71)
            .addFields(
                { name: '👤 العضو:', value: `${newMember} (\`${newMember.id}\`)`, inline: false },
                { name: '🛡️ الرتبة المضافة:', value: `${role.name} (\`${role.id}\`)`, inline: false }
            )
            .setTimestamp();
        await channel.send({ embeds: [embed] }).catch(() => {});
    });

    // رتب سحبت
    const removedRoles = oldRoles.filter(role => !newRoles.has(role.id));
    removedRoles.forEach(async role => {
        const embed = new EmbedBuilder()
            .setTitle('➖ رتبة مسحوبة (تغيير خارجي)')
            .setColor(0xe74c3c)
            .addFields(
                { name: '👤 العضو:', value: `${newMember} (\`${newMember.id}\`)`, inline: false },
                { name: '🛡️ الرتبة المسحوبة:', value: `${role.name} (\`${role.id}\`)`, inline: false }
            )
            .setTimestamp();
        await channel.send({ embeds: [embed] }).catch(() => {});
    });
});

// سجلات الرومات الصوتية
client.on('voiceStateUpdate', async (oldState, newState) => {
    const logChannelId = logChannels[newState.guild.id]?.['voice_logs'];
    if (!logChannelId) return;

    const channel = newState.guild.channels.cache.get(logChannelId);
    if (!channel) return;

    const member = newState.member;
    if (!member || member.user.bot) return;

    let embed = new EmbedBuilder().setTimestamp().setFooter({ text: member.user.tag, iconURL: member.user.displayAvatarURL() });

    // دخول روم
    if (!oldState.channelId && newState.channelId) {
        embed.setTitle('📥 دخول روم صوتي')
             .setColor(0x2ecc71)
             .setDescription(`👤 **العضو:** ${member}\n📍 **الروم:** ${newState.channel}`);
        await channel.send({ embeds: [embed] }).catch(() => {});
    }
    // خروج من روم
    else if (oldState.channelId && !newState.channelId) {
        embed.setTitle('📤 خروج من روم صوتي')
             .setColor(0xe74c3c)
             .setDescription(`👤 **العضو:** ${member}\n📍 **الروم اللي خرج منه:** ${oldState.channel}`);
        await channel.send({ embeds: [embed] }).catch(() => {});
    }
    // انتقال بين رومات
    else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        embed.setTitle('🔄 انتقال بين الرومات')
             .setColor(0x3498db)
             .setDescription(`👤 **العضو:** ${member}\n⬅️ **من:** ${oldState.channel}\n➡️ **إلى:** ${newState.channel}`);
        await channel.send({ embeds: [embed] }).catch(() => {});
    }
});

