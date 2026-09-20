require('dotenv').config();
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(port, () => console.log(`Dummy server listening at http://localhost:${port}`));

const {
    Client, GatewayIntentBits, EmbedBuilder, REST, Routes,
    ChannelSelectMenuBuilder, StringSelectMenuBuilder, RoleSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType,
    SlashCommandBuilder, PermissionsBitField
} = require('discord.js');
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./database');
const { createLevelCard } = require('./levelCard');
const { createLeaderboardCard } = require('./leaderboardCard');

const IMAGES_DIR = path.join(__dirname, 'images');
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif'];

function imageBaseFor(url) {
    return path.join(IMAGES_DIR, crypto.createHash('md5').update(String(url)).digest('hex'));
}

function findCached(url) {
    const base = imageBaseFor(url);
    for (const ext of IMAGE_EXTS) {
        const p = base + '.' + ext;
        if (fs.existsSync(p)) return p;
    }
    return null;
}

function sniffExt(buf) {
    if (!buf || buf.length < 12) return 'png';
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif';
    if (buf.subarray(0, 4).toString('ascii') === 'RIFF') return 'webp';
    if (buf[0] === 0x42 && buf[1] === 0x4d) return 'bmp';
    return 'png';
}

async function localizeImage(url) {
    if (!/^https?:\/\//i.test(url)) return null;
    const cached = findCached(url);
    if (cached) return cached;
    try {
        const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!res.ok) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        if (!buf.length) return null;
        const finalPath = imageBaseFor(url) + '.' + sniffExt(buf);
        await fs.promises.mkdir(IMAGES_DIR, { recursive: true });
        await fs.promises.writeFile(finalPath, buf);
        return finalPath;
    } catch (e) {
        console.error('separator image cache failed:', e.message);
        return null;
    }
}

// Keep the process alive: never let a silent error kill the bot
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:');
    console.error(reason);
});
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:');
    console.error(error);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

const PREFIX = process.env.PREFIX || '-';

// Automatic voice-level role rewards
const VOICE_ROLE_REWARDS = [
    { level: 4, roleId: '1548148472815951932' },
    { level: 11, roleId: '1548148469393395732' },
    { level: 35, roleId: '1548148465647747102' },
    { level: 70, roleId: '1548148462036586626' },
];
const VOICE_LEVEL_POINTS = 5000;

async function checkVoiceRoleRewards(guild, member) {
    if (!guild || !member || member.user.bot) return;
    const stats = await db.getLevelStats(guild.id, member.id).catch(() => null);
    if (!stats) return;
    const vLevel = Math.min(150, Math.floor((stats.voice_points || 0) / VOICE_LEVEL_POINTS));
    for (const reward of VOICE_ROLE_REWARDS) {
        if (vLevel >= reward.level && !member.roles.cache.has(reward.roleId)) {
            try {
                await member.roles.add(reward.roleId);
                const roleName = (guild.roles.cache.get(reward.roleId) || {}).name || 'رول';
                await member.send(
                    `🎉 مبروك وصلت للفل ${reward.level}!\n` +
                    `واخذت رول: **${roleName}**\n` +
                    `هاذا رول تفاعلي 🎧`
                ).catch(() => {});
            } catch (error) {
                console.error('Voice role reward error:', error.message);
            }
        }
    }
}

// Leaderboard navigation buttons row
function topNavRow(page, totalPages) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('top_goto_' + (page - 1))
            .setLabel('◀ السابق')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 1),
        new ButtonBuilder()
            .setCustomId('top_info_' + page)
            .setLabel('صفحة ' + page + ' / ' + totalPages)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId('top_goto_' + (page + 1))
            .setLabel('التالي ▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages)
    );
}

// Build leaderboard entries with member info
async function buildTopEntries(guild, page) {
    const raw = await db.getTopLevels(guild.id, page);
    return await Promise.all(raw.map(async e => {
        let mem = null;
        try {
            mem = await guild.members.fetch(e.user_id);
        } catch (_) {}
        return {
            ...e,
            username: mem ? mem.user.username : e.user_id.slice(0, 6),
            displayName: (mem && mem.displayName) || e.user_id.slice(0, 6),
            avatarURL: mem ? mem.user.displayAvatarURL({ extension: 'png', size: 128 }) : null,
        };
    }));
}

async function sendTopPage(target, guild, page) {
    const total = await db.getLevelCount(guild.id);
    const totalPages = Math.max(1, Math.ceil(total / 10));
    const p = Math.min(Math.max(1, page), totalPages);
    const entries = await buildTopEntries(guild, p);
    const buf = await createLeaderboardCard({ guildName: guild.name, entries, page: p, totalPages });
    return await target.reply({ files: [{ attachment: buf, name: 'top.png' }], components: [topNavRow(p, totalPages)] });
}

const COLOR_ROLE_COLORS = [
    0xff6b6b, 0xff8e53, 0xffc857, 0x2ecc71, 0x5eead4,
    0x5dade2, 0x9b59b6, 0xff7eb6, 0x95a5a6, 0xf1c40f,
    0xe67e22, 0x1abc9c, 0x7f8c8d, 0x8e44ad, 0xc0392b
];

function parseHex(hex) {
    if (typeof hex !== 'string') return null;
    let h = hex.trim().replace(/^#/, '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    const n = parseInt(h, 16);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function makeColorBanner(bgHex) {
    const width = 900;
    const height = 240;
    const bg = parseHex(bgHex) || [43, 45, 49];
    const png = new PNG({ width, height });

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (width * y + x) * 4;
            png.data[idx] = bg[0];
            png.data[idx + 1] = bg[1];
            png.data[idx + 2] = bg[2];
            png.data[idx + 3] = 255;
        }
    }

    const barW = Math.floor(width / 15);
    for (let i = 0; i < 15; i++) {
        const c = COLOR_ROLE_COLORS[i];
        const x0 = i * barW + 3;
        const x1 = Math.min((i + 1) * barW - 3, width);
        for (let y = 12; y < height - 12; y++) {
            for (let x = x0; x < x1; x++) {
                const idx = (width * y + x) * 4;
                png.data[idx] = (c >> 16) & 0xff;
                png.data[idx + 1] = (c >> 8) & 0xff;
                png.data[idx + 2] = c & 0xff;
                png.data[idx + 3] = 255;
            }
        }
    }

    return PNG.sync.write(png);
}

function colorRoleSelectRow() {
    const select = new StringSelectMenuBuilder()
        .setCustomId('color_num')
        .setPlaceholder('اضغط هنا لاختيار اللون')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
            [...Array(15)].map((_, i) => ({
                label: String(i + 1),
                value: String(i + 1)
            }))
        );
    return new ActionRowBuilder().addComponents(select);
}

// ---------- Grant-perms panel ----------
function grantEmbed(roles, savedMsg) {
    return new EmbedBuilder()
        .setColor('#2b2d31')
        .setTitle('تحديد رولات صور / لايف')
        .setDescription(savedMsg || 'اختر من القائمة الرولات المسموح لها كتابة (**صور** / **لايف**).\n**الاختيار يُحفظ تلقائياً فوراً.**')
        .addFields({
            name: 'الرولات المحددة',
            value: roles.length > 0 ? roles.map(id => `<@&${id}>`).join(' ') : 'لا يوجد (سيتم الإعتماد على رول الأدمن ADMIN_ROLE_ID فقط)'
        });
}

function grantSelectRow(roles) {
    const select = new RoleSelectMenuBuilder()
        .setCustomId('grant_roles')
        .setPlaceholder('اختر الرولات هنا')
        .setMinValues(0)
        .setMaxValues(25);
    if (roles.length > 0) {
        select.setDefaultValues(roles);
    }
    return new ActionRowBuilder().addComponents(select);
}
// ---------- End grant-perms panel ----------

async function assignColorRole(interaction, num) {
    const doc = await db.getColorRoles().catch(() => null);
    if (!doc || !doc.role_ids || !doc.role_ids[num - 1]) {
        return interaction.reply({ content: 'لم يتم إعداد رولات الألوان بعد. اطلب من الأدمن تشغيل /color-roles.', ephemeral: true });
    }

    const role = interaction.guild.roles.cache.get(doc.role_ids[num - 1]);
    if (!role) {
        return interaction.reply({ content: 'الرول غير موجود، اطلب من الأدمن إعادة تشغيل /color-roles.', ephemeral: true });
    }

    try {
        const member = interaction.member;
        const hasThis = member.roles.cache.has(role.id);
        const others = doc.role_ids.filter(id => id !== role.id && member.roles.cache.has(id));
        if (others.length > 0) {
            await member.roles.remove(others).catch(() => {});
        }
        if (hasThis) {
            await member.roles.remove(role.id);
            return interaction.reply({ content: `تم إزالة اللون ${num} منك.`, ephemeral: true });
        }
        await member.roles.add(role.id);
        return interaction.reply({ content: `تم إعطاؤك لون ${num}.`, ephemeral: true });
    } catch (error) {
        console.error(error);
        return interaction.reply({ content: 'حدث خطأ. تأكد أن رول البوت أعلى من رولات الألوان.', ephemeral: true });
    }
}

function isAdminChannel(channelId) {
    if (process.env.ADMIN_CHANNEL_ID && channelId !== process.env.ADMIN_CHANNEL_ID) {
        return false;
    }
    return true;
}

function isAllowedGuild(guildId) {
    if (!process.env.GUILD_ID) return true;
    return String(process.env.GUILD_ID) === String(guildId);
}

function hasAdminRole(member) {
    if (!process.env.ADMIN_ROLE_ID) return true;
    return !!member && !!member.roles && member.roles.cache.has(process.env.ADMIN_ROLE_ID);
}

const commands = [
    new SlashCommandBuilder()
        .setName('setup-separator')
        .setDescription('إعداد الفاصل (افتح اللوحة واختر الرومات)')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('رابط صورة الفاصل')
                .setRequired(false))
        .addAttachmentOption(option =>
            option.setName('image')
                .setDescription('رفع صورة الفاصل')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels),

    new SlashCommandBuilder()
        .setName('stop-separator')
        .setDescription('إيقاف الفاصل في شات')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('الشات')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels),

    new SlashCommandBuilder()
        .setName('setup-reaction')
        .setDescription('إعداد الرياكشن التلقائي (افتح اللوحة واختر الرومات)')
        .addStringOption(option =>
            option.setName('emoji')
                .setDescription('الإيموجي (اختياري، يمكن تغييره من اللوحة)')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels),

    new SlashCommandBuilder()
        .setName('stop-reaction')
        .setDescription('إيقاف الرياكشن التلقائي')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('الشات')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels),

    new SlashCommandBuilder()
        .setName('auto-delete')
        .setDescription('إعداد الحذف التلقائي (افتح اللوحة واختر الرومات)')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels),

    new SlashCommandBuilder()
        .setName('stop-auto-delete')
        .setDescription('إيقاف الحذف التلقائي')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('الروم')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels),

    new SlashCommandBuilder()
        .setName('send')
        .setDescription('إرسال نص و/أو صور إلى شات')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('الشات الذي سيُرسل إليه')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('text')
                .setDescription('النص المراد إرساله (اختياري)')
                .setRequired(false))
        .addAttachmentOption(option =>
            option.setName('image1')
                .setDescription('الصورة الأولى (اختياري)')
                .setRequired(false))
        .addAttachmentOption(option =>
            option.setName('image2')
                .setDescription('الصورة الثانية (اختياري)')
                .setRequired(false))
        .addAttachmentOption(option =>
            option.setName('image3')
                .setDescription('الصورة الثالثة (اختياري)')
                .setRequired(false))
        .addAttachmentOption(option =>
            option.setName('image4')
                .setDescription('الصورة الرابعة (اختياري)')
                .setRequired(false))
        .addAttachmentOption(option =>
            option.setName('image5')
                .setDescription('الصورة الخامسة (اختياري)')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels),

    new SlashCommandBuilder()
        .setName('grant-perms')
        .setDescription('اختيار الرولات المسموح لها كتابة (صور / لايف)')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels),

    new SlashCommandBuilder()
        .setName('color-roles')
        .setDescription('إعداد رولات الألوان من 1 إلى 15 في شات')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('الشات الذي ستُرسل فيه لوحة الألوان')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('title')
                .setDescription('نص عنوان اللوحة (اختياري)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('background')
                .setDescription('لون خلفية لوحة الصورة بالهكس مثل #2b2d31 (اختياري)')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels),

    new SlashCommandBuilder()
        .setName('room-panel')
        .setDescription('إرسال لوحة إنشاء الرومات (رومات مؤقتة) في شات')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('الشات الذي ستُرسل فيه لوحة إنشاء الرومات')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('title')
                .setDescription('نص عنوان اللوحة (اختياري)')
                .setRequired(false))
        .addChannelOption(option =>
            option.setName('category')
                .setDescription('المجلد (الكاتاجوري) الذي تُنشأ فيه الرومات الصوتية')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels),
].map(c => c.toJSON());

// ---------- Interactive panel state (key: user id) ----------
const panels = new Map(); // userId -> { type, channels:Set, duration:number|null, src:string|null }
const rooms = new Map(); // voiceChannelId -> { ownerId, panelMessageId }
const panelCategories = new Map(); // panelMessageId -> categoryId

async function sendBareImages(channel, text, imageUrls) {
    const cleanText = (text && text.trim()) || null;

    if (imageUrls.length === 0) {
        return await channel.send({ content: cleanText });
    }

    let firstMessage = null;
    for (let i = 0; i < imageUrls.length; i++) {
        const payload = { files: [imageUrls[i]] };
        if (i === 0) payload.content = cleanText || null;
        const msg = await channel.send(payload);
        if (i === 0) firstMessage = msg;
    }
    return firstMessage;
}

function panelEmbed(state) {
    const embed = new EmbedBuilder().setColor('#2b2d31');

    if (state.type === 'auto-delete') {
        embed.setTitle('إعداد الحذف التلقائي');
        embed.setDescription(
            '1- اختر الرومات الصوتية من القائمة أدناه.\n' +
            '2- اضغط زر «المدة» واكتب الوقت بالدقائق.\n' +
            '3- اضغط «تشغيل» لتطبيق الإعداد.'
        );
    } else if (state.type === 'separator') {
        embed.setTitle('إعداد الفاصل');
        embed.setDescription(
            '1- اختر الشاتات من القائمة أدناه.\n' +
            '2- اضغط زر «الصورة» وضع رابط صورة الفاصل (إن لم تكن جاهزة).\n' +
            '3- اضغط «تشغيل» لتطبيق الفاصل على الشاتات المحددة.'
        );
    } else {
        embed.setTitle('إعداد الرياكشن التلقائي');
        embed.setDescription(
            '1- اختر الشاتات من القائمة أدناه.\n' +
            '2- اضغط زر «الإيموجي» واكتب الإيموجي (ممكن أكثر من واحد بمسافة).\n' +
            '3- اضغط «تشغيل» لتطبيق الإعداد.'
        );
    }

    const channelsList = state.channels.size
        ? [...state.channels].map(id => `<#${id}>`).join(' ')
        : 'لم تختار بعد';
    embed.addFields(
        { name: 'الرومات المحددة', value: channelsList, inline: false }
    );

    if (state.type === 'auto-delete') {
        embed.addFields({
            name: 'المدة',
            value: state.duration != null ? `${state.duration} دقيقة` : 'لم تحدد بعد',
            inline: false
        });
    }

    if (state.type === 'reaction') {
        embed.addFields({
            name: 'الإيموجي',
            value: state.emoji || 'لم تحدد بعد',
            inline: false
        });
    }

    return embed;
}

function autoDeleteRow() {
    const chRow = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId('autodel_channels')
            .setPlaceholder('اختر الرومات الصوتية (ممكن أكثر من واحد)')
            .setChannelTypes([ChannelType.GuildVoice])
            .setMinValues(1)
            .setMaxValues(25)
    );
    const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('autodel_duration').setLabel('المدة').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('autodel_apply').setLabel('تشغيل').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('autodel_cancel').setLabel('إلغاء').setStyle(ButtonStyle.Danger)
    );
    return [chRow, btnRow];
}

function separatorRow() {
    const chRow = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId('sep_channels')
            .setPlaceholder('اختر الشاتات (ممكن أكثر من واحد)')
            .setChannelTypes([ChannelType.GuildText])
            .setMinValues(1)
            .setMaxValues(25)
    );
    const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('sep_image').setLabel('الصورة').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('sep_apply').setLabel('تشغيل').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('sep_cancel').setLabel('إلغاء').setStyle(ButtonStyle.Danger)
    );
    return [chRow, btnRow];
}

function reactionRow() {
    const chRow = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId('react_channels')
            .setPlaceholder('اختر الشاتات (ممكن أكثر من واحد)')
            .setChannelTypes([ChannelType.GuildText])
            .setMinValues(1)
            .setMaxValues(25)
    );
    const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('react_emoji').setLabel('الإيموجي').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('react_apply').setLabel('تشغيل').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('react_cancel').setLabel('إلغاء').setStyle(ButtonStyle.Danger)
    );
    return [chRow, btnRow];
}

async function sendAutoDeletePanel(channel, userId) {
    const state = {
        type: 'auto-delete',
        channels: new Set(),
        duration: null
    };
    panels.set(userId, state);
    await channel.send({
        embeds: [panelEmbed(state)],
        components: autoDeleteRow()
    });
}

async function sendSeparatorPanel(channel, userId, src) {
    const state = {
        type: 'separator',
        channels: new Set(),
        src: src
    };
    panels.set(userId, state);
    await channel.send({
        embeds: [panelEmbed(state)],
        components: separatorRow()
    });
}

// ---------- Ready ----------
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    try {
        // Register slash commands
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }

    // Load tracked temporary rooms from DB (survives bot restarts)
    try {
        const savedRooms = await db.getAllRooms().catch(() => []);
        for (const r of savedRooms) {
            rooms.set(r.channel_id, { ownerId: r.owner_id, panelMessageId: r.panel_message_id || null });
        }
        console.log(`Loaded ${savedRooms.length} tracked room(s).`);

        // Rooms that were already empty when the bot started: apply the same 5s rule
        for (const r of savedRooms) {
            const ch = await client.channels.fetch(r.channel_id).catch(() => null);
            if (!ch) {
                rooms.delete(r.channel_id);
                await db.removeRoom(r.channel_id).catch(() => {});
                continue;
            }
            if (ch.members.size === 0) {
                setTimeout(async () => {
                    const c = await client.channels.fetch(r.channel_id).catch(() => null);
                    if (!c || c.members.size !== 0) return;
                    rooms.delete(r.channel_id);
                    await db.removeRoom(r.channel_id).catch(() => {});
                    await c.delete('Room empty').catch(() => {});
                }, 5000);
            }
        }
    } catch (error) {
        console.error('Error loading rooms:', error.message);
    }

    // Auto-delete sweep every 60 seconds
    setInterval(async () => {
        try {
            const configs = await db.getAllAutoDeletes();
            if (!configs || configs.length === 0) return;

            for (const config of configs) {
                const channel = await client.channels.fetch(config.channel_id, { force: true }).catch(() => null);
                if (!channel || !isAllowedGuild(channel.guildId)) continue;

                try {
                    const data = await client.rest.get(`/channels/${config.channel_id}/messages?limit=100`);
                    const cutoff = Date.now() - config.duration_minutes * 60 * 1000;
                    for (const msg of data) {
                        if (!msg.pinned && Date.parse(msg.timestamp) < cutoff) {
                            await client.rest.delete(`/channels/${config.channel_id}/messages/${msg.id}`).catch(() => {});
                        }
                    }
                } catch (err) {
                    if (!err.message || !err.message.startsWith('Unknown Channel')) {
                        console.error('Auto-delete channel error:', err.message);
                    }
                }
            }
        } catch (error) {
            console.error('Error in auto-delete sweep:', error.message);
        }
    }, 60 * 1000);
});

// ---------- Component interactions (panels) ----------
client.on('interactionCreate', async interaction => {
    if (!isAllowedGuild(interaction.guild && interaction.guild.id)) return;

    if (interaction.isChatInputCommand()) {
        if (!isAdminChannel(interaction.channel.id)) {
            return interaction.reply({ content: 'عذراً، لا يمكنك استخدام أوامر التحكم إلا في الشات المخصص لها.', ephemeral: true });
        }
        if (!hasAdminRole(interaction.member)) {
            return interaction.reply({ content: 'عذراً، لا تملك الرول المطلوب لاستخدام هذه الأوامر.', ephemeral: true });
        }

        const name = interaction.commandName;

        if (name === 'auto-delete') {
            const state = { type: 'auto-delete', channels: new Set(), duration: null };
            panels.set(interaction.user.id, state);
            return interaction.reply({
                embeds: [panelEmbed(state)],
                components: autoDeleteRow()
            });
        }

        if (name === 'setup-separator') {
            const url = interaction.options.getString('url');
            const attachment = interaction.options.getAttachment('image');
            let src = null;
            if (attachment) {
                src = attachment.url;
            } else if (url && url.trim()) {
                src = url.trim();
            }
            if (src) {
                const isFullUrl = /^https?:\/\//i.test(src);
                const isExistingFile = fs.existsSync(path.join(__dirname, src));
                if (!isFullUrl && !isExistingFile) src = null;
            }
            const state = { type: 'separator', channels: new Set(), src };
            panels.set(interaction.user.id, state);
            return interaction.reply({
                embeds: [panelEmbed(state)],
                components: separatorRow()
            });
        }

        if (name === 'stop-separator') {
            const channel = interaction.options.getChannel('channel');
            try {
                await db.removeSeparator(channel.id);
                return interaction.reply({ content: `تم إيقاف الفاصل في شات ${channel}`, ephemeral: true });
            } catch (error) {
                console.error(error);
                return interaction.reply({ content: 'حدث خطأ أثناء حفظ الإعدادات.', ephemeral: true });
            }
        }

        if (name === 'setup-reaction') {
            const emoji = interaction.options.getString('emoji');
            const state = { type: 'reaction', channels: new Set(), emoji: emoji || null };
            panels.set(interaction.user.id, state);
            return interaction.reply({
                embeds: [panelEmbed(state)],
                components: reactionRow()
            });
        }

        if (name === 'stop-reaction') {
            const channel = interaction.options.getChannel('channel');
            try {
                await db.removeReaction(channel.id);
                return interaction.reply({ content: `تم إيقاف الرياكشن التلقائي في شات ${channel}`, ephemeral: true });
            } catch (error) {
                console.error(error);
                return interaction.reply({ content: 'حدث خطأ أثناء حفظ الإعدادات.', ephemeral: true });
            }
        }

        if (name === 'stop-auto-delete') {
            const channel = interaction.options.getChannel('channel');
            try {
                await db.removeAutoDelete(channel.id);
                return interaction.reply({ content: `تم إيقاف الحذف التلقائي في روم ${channel}`, ephemeral: true });
            } catch (error) {
                console.error(error);
                return interaction.reply({ content: 'حدث خطأ أثناء حفظ الإعدادات.', ephemeral: true });
            }
        }

        if (name === 'send') {
            const channel = interaction.options.getChannel('channel');
            const text = interaction.options.getString('text');
            const files = [];
            for (let i = 1; i <= 5; i++) {
                const att = interaction.options.getAttachment(`image${i}`);
                if (att) files.push(att.url);
            }

            if ((!text || !text.trim()) && files.length === 0) {
                return interaction.reply({ content: 'اكتب نصاً أو ارفع صورة واحدة على الأقل.', ephemeral: true });
            }

            try {
                const sent = await sendBareImages(channel, text, files);
                return interaction.reply({
                    content: `✅ تم الإرسال إلى ${channel}` +
                        (files.length ? ` مع ${files.length} صورة (أول وحدة فوق واللي بعدها تحت، بدون مربعات)` : '') +
                        (sent && sent.id ? `\nرابط الرسالة: https://discord.com/channels/${channel.guildId}/${channel.id}/${sent.id}` : ''),
                    ephemeral: true
                });
            } catch (error) {
                console.error(error);
                return interaction.reply({ content: `حدث خطأ أثناء الإرسال. تأكد أن البوت عنده صلاحية الكتابة في ${channel}`, ephemeral: true });
            }
        }

        if (name === 'grant-perms') {
            const existing = await db.getGrantRoles().catch(() => []);
            return interaction.reply({
                embeds: [grantEmbed(existing, null)],
                components: [grantSelectRow(existing)],
                ephemeral: true
            });
        }

        if (name === 'color-roles') {
            const channel = interaction.options.getChannel('channel');
            const title = interaction.options.getString('title') || 'اختر لونك';

            try {
                const existing = await db.getColorRoles().catch(() => null);
                const existingIds = existing ? existing.role_ids : [];

                const ids = [];
                for (let i = 1; i <= 15; i++) {
                    let role = null;
                    if (existingIds[i - 1]) {
                        role = await interaction.guild.roles.fetch(existingIds[i - 1]).catch(() => null);
                    }
                    if (!role) {
                        role = await interaction.guild.roles.create({
                            name: String(i),
                            color: COLOR_ROLE_COLORS[i - 1],
                            permissions: [],
                            reason: 'Color role'
                        });
                    } else {
                        await role.edit({ name: String(i), color: COLOR_ROLE_COLORS[i - 1] }).catch(() => {});
                    }
                    ids.push(role.id);
                }

                // Place roles 1..15 directly under the bot's highest role (1 closest to bot)
                const botHighestRole = interaction.guild.members.me.roles.highest;
                for (let i = 1; i <= 15; i++) {
                    const role = interaction.guild.roles.cache.get(ids[i - 1]);
                    if (role) {
                        await role.setPosition(botHighestRole.position - i).catch(() => {});
                    }
                }

                await db.setColorRoles(ids, channel.id);

                const banner = makeColorBanner(interaction.options.getString('background'));
                const embed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTitle(title)
                    .setImage('attachment://colors.png')
                    .setDescription('اضغط على القائمة أدناه لاختيار رقم اللون.');

                await channel.send({
                    embeds: [embed],
                    components: [colorRoleSelectRow()],
                    files: [{ attachment: banner, name: 'colors.png' }]
                });
                return interaction.reply({ content: `✅ تم تجهيز رولات الألوان (1-15) وإرسال لوحة الاختيار إلى ${channel}`, ephemeral: true });
            } catch (error) {
                console.error(error);
                return interaction.reply({ content: 'حدث خطأ أثناء إعداد رولات الألوان. تأكد أن رول البوت عنده صلاحية Manage Roles وأنه أعلى من الرولات.', ephemeral: true });
            }
        }

        if (name === 'room-panel') {
            const channel = interaction.options.getChannel('channel');
            const title = interaction.options.getString('title') || 'إنشاء روم';
            const category = interaction.options.getChannel('category');

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle(title)
                .setDescription('اضغط على زر "إنشاء روم" بالأعلى وأنشئ رومك الخاص.\n⚠️ يجب أن تكون داخل أي روم صوتي بالسيرفر أولاً.');

            const createRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('room_create')
                        .setLabel('إنشاء روم')
                        .setStyle(ButtonStyle.Success)
                );

            const msg = await channel.send({ embeds: [embed], components: [createRow] });
            if (category && category.id) {
                panelCategories.set(msg.id, category.id);
            }
            return interaction.reply({ content: `✅ تم إرسال لوحة إنشاء الرومات إلى ${channel}`, ephemeral: true });
        }

        return;
    }

    const userId = interaction.user.id;

    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'color_num') {
            const num = parseInt(interaction.values[0], 10);
            return assignColorRole(interaction, num);
        }
        return;
    }

    // Role selection (grant-perms) — saves instantly on every selection
    if (interaction.isRoleSelectMenu()) {
        if (interaction.customId === 'grant_roles') {
            try {
                const selected = interaction.values;
                await db.setGrantRoles(selected);
                await interaction.update({
                    embeds: [grantEmbed(selected, '✅ تم الحفظ تلقائياً')],
                    components: [grantSelectRow(selected)]
                });
            } catch (error) {
                console.error('grant-perms select error:', error);
                await interaction.reply({ content: 'حدث خطأ أثناء الحفظ. جرب مرة ثانية.', ephemeral: true }).catch(() => {});
            }
            return;
        }
        return;
    }

    // Channel selection updates
    if (interaction.isChannelSelectMenu()) {
        if (interaction.customId === 'react_channels') {
            const state = panels.get(userId);
            if (!state || state.type !== 'reaction') return;

            state.channels = new Set(interaction.values);
            await interaction.update({
                embeds: [panelEmbed(state)],
                components: reactionRow()
            });
            return;
        }

        if (interaction.customId === 'autodel_channels' || interaction.customId === 'sep_channels') {
            const state = panels.get(userId);
            if (!state) return;

            state.channels = new Set(interaction.values);
            const rows = state.type === 'auto-delete' ? autoDeleteRow() : separatorRow();
            await interaction.update({
                embeds: [panelEmbed(state)],
                components: rows
            });
        }
        return;
    }

    // Buttons
    if (interaction.isButton()) {
        const state = panels.get(userId);

        // ---------- Leaderboard pagination ----------
        if (interaction.customId.startsWith('top_goto_')) {
            const target = parseInt(interaction.customId.split('_')[2], 10);
            if (isNaN(target)) return;
            try {
                const total = await db.getLevelCount(interaction.guild.id);
                const totalPages = Math.max(1, Math.ceil(total / 10));
                const page = Math.min(Math.max(1, target), totalPages);
                const entries = await buildTopEntries(interaction.guild, page);
                const buf = await createLeaderboardCard({ guildName: interaction.guild.name, entries, page, totalPages });
                await interaction.update({
                    files: [{ attachment: buf, name: 'top.png' }],
                    components: [topNavRow(page, totalPages)]
                });
            } catch (error) {
                console.error('Top page error:', error);
                await interaction.reply({ content: 'حدث خطأ أثناء تحميل التوب.', ephemeral: true }).catch(() => {});
            }
            return;
        }

        // ---------- Room system ----------
        if (interaction.customId === 'room_create') {
            const member = interaction.member;
            await interaction.deferReply({ ephemeral: true });

            const findVoice = () =>
                (member.voice && member.voice.channelId) ||
                interaction.guild.voiceStates.cache.get(userId)?.channelId;

            let vch = findVoice();
            if (!vch) {
                for (let i = 0; i < 6; i++) {
                    await new Promise(r => setTimeout(r, 500));
                    vch = findVoice();
                    if (vch) break;
                }
            }
            if (!vch) {
                return interaction.editReply({ content: '⚠️ أنت مو داخل أي روم صوتي. ادخل أي روم صوتي بالسيرفر ثم اضغط إنشاء روم.' });
            }

            // Room always lands in the fixed category (ضااااا)
            const parentId = '1548214066667978772';

            try {
                const newRoom = await interaction.guild.channels.create({
                    name: `room-${Math.random().toString(36).slice(2, 6)}`,
                    type: ChannelType.GuildVoice,
                    parent: parentId,
                    permissionOverwrites: [
                        {
                            id: interaction.guild.roles.everyone.id,
                            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect]
                        },
                        {
                            id: member.id,
                            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak]
                        }
                    ]
                });

                await member.voice.setChannel(newRoom.id).catch(() => {});

                const embed = new EmbedBuilder()
                    .setColor('#2b2d31')
                    .setTitle(`🔊 روم ${member.user.username}`)
                    .setDescription('لوحة تحكم رومك.\nاستخدم الأزرار بالأسفل للتحكم في الروم.')
                    .addFields({ name: 'الحالة', value: '🟢 مفتوح', inline: false });

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('room_lock')
                            .setLabel('إغلاق الروم')
                            .setStyle(ButtonStyle.Danger),
                        new ButtonBuilder()
                            .setCustomId('room_unlock')
                            .setLabel('فتح الروم')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId('room_rename')
                            .setLabel('تغيير الاسم')
                            .setStyle(ButtonStyle.Primary)
                    );

                const restRes = await client.rest.post(`/channels/${newRoom.id}/messages`, {
                    body: { embeds: [embed.toJSON()], components: [row.toJSON()] }
                });

                rooms.set(newRoom.id, { ownerId: member.id, panelMessageId: restRes.id });
                await db.setRoom(newRoom.id, member.id, restRes.id).catch(() => {});

                return interaction.editReply({ content: '🔊 تم إنشاء رومك وسحبك إليه تلقائياً. لوحة التحكم صارت في شات الروم.' });
            } catch (error) {
                console.error(error);
                return interaction.editReply({ content: 'حدث خطأ أثناء إنشاء الروم. تأكد أن البوت عنده صلاحية إنشاء القنوات الصوتية في هذا المجلد.' });
            }
        }

        if (interaction.customId === 'room_lock' || interaction.customId === 'room_unlock') {
            const room = rooms.get(interaction.channelId);
            if (!room) {
                return interaction.reply({ content: 'هذا الروم غير مُدار من النظام.', ephemeral: true });
            }
            if (room.ownerId !== userId) {
                return interaction.reply({ content: 'أنت لست صاحب هذا الروم.', ephemeral: true });
            }

            try {
                const ch = await client.channels.fetch(interaction.channelId).catch(() => null);
                if (!ch) {
                    return interaction.reply({ content: 'تعذر العثور على الروم.', ephemeral: true });
                }

                if (interaction.customId === 'room_lock') {
                    await ch.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { Connect: false }).catch(() => {});
                    await ch.permissionOverwrites.edit(room.ownerId, { Connect: true, ViewChannel: true }).catch(() => {});
                    return interaction.reply({ content: '🔒 تم إغلاق الروم. ما أحد يقدر يدخل غيرك.', ephemeral: true });
                } else {
                    await ch.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { Connect: true, ViewChannel: true }).catch(() => {});
                    return interaction.reply({ content: '🔓 تم فتح الروم. الكل يقدر يدخل الآن.', ephemeral: true });
                }
            } catch (error) {
                console.error(error);
                return interaction.reply({ content: 'حدث خطأ أثناء تعديل صلاحيات الروم.', ephemeral: true });
            }
        }

        if (interaction.customId === 'room_rename') {
            const room = rooms.get(interaction.channelId);
            if (!room) {
                return interaction.reply({ content: 'هذا الروم غير مُدار من النظام.', ephemeral: true });
            }
            if (room.ownerId !== userId) {
                return interaction.reply({ content: 'أنت لست صاحب هذا الروم.', ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId('room_rename_modal')
                .setTitle('تغيير اسم الروم')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('newname')
                            .setLabel('اسم الروم الجديد')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setMaxLength(32)
                            .setPlaceholder('اكتب الاسم هنا')
                    )
                );
            return interaction.showModal(modal);
        }
        // ---------- End room system ----------

        if (interaction.customId === 'autodel_duration') {
            if (!state || state.type !== 'auto-delete') return;
            const modal = new ModalBuilder()
                .setCustomId('autodel_time')
                .setTitle('المدة بالدقائق')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('minutes')
                            .setLabel('عدد الدقائق قبل حذف الرسائل')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setPlaceholder('مثال: 5')
                    )
                );
            return interaction.showModal(modal);
        }

        if (interaction.customId === 'autodel_apply') {
            if (!state || state.type !== 'auto-delete') return;
            if (state.channels.size === 0) {
                return interaction.reply({ content: 'اختر الرومات أولاً من القائمة.', ephemeral: true });
            }
            if (state.duration == null) {
                return interaction.reply({ content: 'اضغط زر «المدة» واكتب الوقت قبل التشغيل.', ephemeral: true });
            }
            try {
                for (const id of state.channels) {
                    await db.setAutoDelete(id, state.duration);
                }
                const done = new EmbedBuilder()
                    .setColor('#57F287')
                    .setTitle('تم التفعيل')
                    .setDescription(
                        `راح تُحذف الرسائل تلقائياً بعد **${state.duration} دقيقة** في:\n` +
                        [...state.channels].map(id => `<#${id}>`).join(' ')
                    );
                panels.delete(userId);
                await interaction.update({ embeds: [done], components: [] });
                return interaction.followUp({ content: '🔔 تم تشغيل الحذف التلقائي بنجاح.', ephemeral: true });
            } catch (error) {
                console.error(error);
                return interaction.reply({ content: 'حدث خطأ أثناء الحفظ.', ephemeral: true });
            }
        }

        if (interaction.customId === 'sep_apply') {
            if (!state || state.type !== 'separator') return;
            if (state.channels.size === 0) {
                return interaction.reply({ content: 'اختر الشاتات أولاً من القائمة.', ephemeral: true });
            }
            if (!state.src) {
                return interaction.reply({ content: 'اضغط زر «الصورة» وضع رابط صورة الفاصل قبل التشغيل.', ephemeral: true });
            }
            try {
                for (const id of state.channels) {
                    await db.setSeparator(id, state.src);
                }
                const done = new EmbedBuilder()
                    .setColor('#57F287')
                    .setTitle('تم التفعيل')
                    .setDescription(
                        `تم إعداد الفاصل في:\n` +
                        [...state.channels].map(id => `<#${id}>`).join(' ')
                    );
                panels.delete(userId);
                await interaction.update({ embeds: [done], components: [] });
                return interaction.followUp({ content: '🔔 تم تشغيل الفاصل بنجاح.', ephemeral: true });
            } catch (error) {
                console.error(error);
                return interaction.reply({ content: 'حدث خطأ أثناء الحفظ.', ephemeral: true });
            }
        }

        if (interaction.customId === 'autodel_cancel' || interaction.customId === 'sep_cancel') {
            panels.delete(userId);
            const cancelled = new EmbedBuilder()
                .setColor('#ED4245')
                .setTitle('تم الإلغاء')
                .setDescription('لم يتم تطبيق أي إعداد.');
            await interaction.update({ embeds: [cancelled], components: [] });
            return interaction.followUp({ content: 'أُلغي الإعداد.', ephemeral: true });
        }

        if (interaction.customId === 'react_emoji') {
            if (!state || state.type !== 'reaction') return;
            const modal = new ModalBuilder()
                .setCustomId('react_emoji_modal')
                .setTitle('الإيموجي')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('emoji')
                            .setLabel('اكتب الإيموجي (أكثر من واحد بمسافة)')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setPlaceholder('مثال: 👍 ❤️ 😂')
                    )
                );
            return interaction.showModal(modal);
        }

        if (interaction.customId === 'sep_image') {
            if (!state || state.type !== 'separator') return;
            const modal = new ModalBuilder()
                .setCustomId('sep_image_modal')
                .setTitle('صورة الفاصل')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('image_url')
                            .setLabel('ضع رابط صورة الفاصل')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setPlaceholder('https://example.com/image.png')
                    )
                );
            return interaction.showModal(modal);
        }

        if (interaction.customId === 'react_apply') {
            if (!state || state.type !== 'reaction') return;
            if (state.channels.size === 0) {
                return interaction.reply({ content: 'اختر الرومات أولاً من القائمة.', ephemeral: true });
            }
            if (!state.emoji) {
                return interaction.reply({ content: 'اضغط زر «الإيموجي» واكتب الإيموجي قبل التشغيل.', ephemeral: true });
            }
            try {
                for (const id of state.channels) {
                    await db.setReaction(id, state.emoji);
                }
                const done = new EmbedBuilder()
                    .setColor('#57F287')
                    .setTitle('تم التفعيل')
                    .setDescription(
                        `راح يضيف البوت **${state.emoji}** على كل رسالة في:\n` +
                        [...state.channels].map(id => `<#${id}>`).join(' ')
                    );
                panels.delete(userId);
                await interaction.update({ embeds: [done], components: [] });
                return interaction.followUp({ content: '🔔 تم تشغيل الرياكشن التلقائي بنجاح.', ephemeral: true });
            } catch (error) {
                console.error(error);
                return interaction.reply({ content: 'حدث خطأ أثناء الحفظ.', ephemeral: true });
            }
        }

        if (interaction.customId === 'react_cancel') {
            panels.delete(userId);
            const cancelled = new EmbedBuilder()
                .setColor('#ED4245')
                .setTitle('تم الإلغاء')
                .setDescription('لم يتم تطبيق أي إعداد.');
            await interaction.update({ embeds: [cancelled], components: [] });
            return interaction.followUp({ content: 'أُلغي الإعداد.', ephemeral: true });
        }

        return;
    }

    // Modal submit
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'autodel_time') {
            const state = panels.get(userId);
            if (!state || state.type !== 'auto-delete') return;

            const minutes = parseInt(interaction.fields.getTextInputValue('minutes'), 10);
            if (isNaN(minutes) || minutes < 1) {
                return interaction.reply({ content: 'المدة يجب أن تكون رقماً صحيحاً أكبر من صفر.', ephemeral: true });
            }
            state.duration = minutes;
            await interaction.update({
                embeds: [panelEmbed(state)],
                components: autoDeleteRow()
            });
            return;
        }

        if (interaction.customId === 'react_emoji_modal') {
            const state = panels.get(userId);
            if (!state || state.type !== 'reaction') return;

            const emoji = interaction.fields.getTextInputValue('emoji').trim();
            if (!emoji) {
                return interaction.reply({ content: 'يجب كتابة إيموجي واحد على الأقل.', ephemeral: true });
            }
            state.emoji = emoji;
            await interaction.update({
                embeds: [panelEmbed(state)],
                components: reactionRow()
            });
            return;
        }

        if (interaction.customId === 'sep_image_modal') {
            const state = panels.get(userId);
            if (!state || state.type !== 'separator') return;

            const value = interaction.fields.getTextInputValue('image_url').trim();
            const isFullUrl = /^https?:\/\//i.test(value);
            const isExistingFile = fs.existsSync(path.join(__dirname, value));
            if (!isFullUrl && !isExistingFile) {
                return interaction.reply({ content: 'رابط الصورة غير صحيح. ضع رابطاً كاملاً يبدأ بـ https://', ephemeral: true });
            }
            state.src = value;
            await interaction.update({
                embeds: [panelEmbed(state)],
                components: separatorRow()
            });
        }

        if (interaction.customId === 'room_rename_modal') {
            const room = rooms.get(interaction.channelId);
            if (!room || room.ownerId !== userId) {
                return interaction.reply({ content: 'أنت لست صاحب هذا الروم.', ephemeral: true });
            }
            const name = interaction.fields.getTextInputValue('newname').trim();
            if (!name) {
                return interaction.reply({ content: 'اكتب اسم صحيح.', ephemeral: true });
            }
            try {
                const ch = await client.channels.fetch(interaction.channelId).catch(() => null);
                if (!ch) {
                    return interaction.reply({ content: 'تعذر العثور على الروم.', ephemeral: true });
                }
                await ch.setName(name);
                return interaction.reply({ content: `✅ تم تغيير اسم الروم إلى **${name}**.`, ephemeral: true });
            } catch (error) {
                console.error(error);
                return interaction.reply({ content: 'تعذر تغيير الاسم. تأكد أن الاسم مسموح (بدون رموز مثل @ / #).', ephemeral: true });
            }
        }
        return;
    }
});

// ---------- Room auto-delete when empty ----------
client.on('voiceStateUpdate', async (oldState, newState) => {
    const guildId = (newState.guild && newState.guild.id) || (oldState.guild && oldState.guild.id);
    if (!isAllowedGuild(guildId)) return;

    const leftChId = oldState.channelId;
    if (!leftChId) return;

    // Tracked either in memory or (if bot restarted) in the DB
    const isTracked = rooms.has(leftChId) || (await db.getRoom(leftChId).catch(() => null));
    if (!isTracked) return;

    setTimeout(async () => {
        try {
            const ch = await oldState.guild.channels.fetch(leftChId).catch(() => null);
            if (!ch) return; // already deleted

            if (ch.members.size === 0) {
                rooms.delete(leftChId);
                await db.removeRoom(leftChId).catch(() => {});
                await ch.delete('Room empty for 5 seconds').catch(() => {});
            }
        } catch (error) {
            console.error(error);
        }
    }, 5000);
});

// Clean DB record if a tracked room is deleted manually
client.on('channelDelete', async channel => {
    if (!isAllowedGuild(channel.guildId)) return;
    if (rooms.has(channel.id)) {
        rooms.delete(channel.id);
        await db.removeRoom(channel.id).catch(() => {});
    }
});

// ---------- Prefix commands ----------
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!isAllowedGuild(message.guild && message.guild.id)) return;

    // Level system - count every non-bot message (+10 or +15 pts)
    const msgPts = Math.random() < 0.5 ? 15 : 10;
    db.bumpLevelMessage(message.guild.id, message.author.id, msgPts).catch(() => {});

    // Level profile command: id / ii (+ optional @mention or user ID)
    const lvTrim = message.content.trim().toLowerCase();
    if (/^id\b/.test(lvTrim) || /^ii\b/.test(lvTrim)) {
        try {
            let targetUser = message.author;
            const rest = message.content.replace(/^(id|ii)/i, '').trim();
            if (rest) {
                const mention = message.mentions.users.first();
                if (mention) {
                    targetUser = mention;
                } else {
                    const idMatch = rest.match(/\b(\d{17,20})\b/);
                    if (idMatch) {
                        const fetched = await client.users.fetch(idMatch[1]).catch(() => null);
                        if (fetched) targetUser = fetched;
                    }
                }
            }

            let targetMember = message.guild.members.cache.get(targetUser.id);
            if (!targetMember) {
                try {
                    targetMember = await message.guild.members.fetch(targetUser.id);
                } catch (_) {}
            }

            const stats = await db.getLevelStats(message.guild.id, targetUser.id);
            const displayName = (targetMember && targetMember.displayName) || targetUser.username;
            const topRank = await db.getLevelRank(message.guild.id, targetUser.id);
            const buf = await createLevelCard({
                avatarURL: targetUser.displayAvatarURL({ extension: 'png', size: 512 }),
                username: targetUser.username,
                displayName,
                guildName: message.guild.name,
                msgPoints: stats.msg_points || 0,
                msgCount: stats.msg_count || 0,
                voicePoints: stats.voice_points || 0,
                voiceMinutes: stats.voice_minutes || 0,
                weekMsgCount: stats.week_msg_count || 0,
                weekVoiceMinutes: stats.week_voice_minutes || 0,
                topRank,
            });
            return message.reply({ files: [{ attachment: buf, name: 'level-card.png' }] });
        } catch (error) {
            console.error('Level card error:', error);
            return message.reply('حدث خطأ أثناء توليد بطاقة المستوى، حاول مرة أخرى.');
        }
    }

    // Leaderboard command: #top / #توب (optional page number)
    const lbToken = message.content.trim();
    let lbPage = null;
    if (/^#(top|توب)$/i.test(lbToken)) {
        lbPage = 1;
    } else {
        const lbMatch = lbToken.match(/^#(top|توب)\s+(\d+)/i);
        if (lbMatch) lbPage = parseInt(lbMatch[2], 10);
    }
    if (lbPage !== null) {
        try {
            return await sendTopPage(message, message.guild, lbPage);
        } catch (error) {
            console.error('Top command error:', error);
            return message.reply('حدث خطأ أثناء تحميل التوب، حاول مرة أخرى.');
        }
    }

    if (message.content.trimStart().startsWith(PREFIX)) {
        const content = message.content.slice(PREFIX.length).trim();
        const args = content.split(/\s+/).filter(a => a !== '');
        const name = (args.shift() || '').toLowerCase();

        if (!isAdminChannel(message.channel.id)) {
            return message.reply('عذراً، لا يمكنك استخدام الأوامر إلا في الشات المخصص لها.');
        }
        if (!hasAdminRole(message.member)) {
            return message.reply('عذراً، لا تملك الرول المطلوب لاستخدام هذه الأوامر.');
        }

        if (name === 'send') {
            const target = message.mentions.channels.first();
            if (!target) {
                return message.reply('يجب أن تذكر الشات أولاً: `-send #الشات النص المكتوب`');
            }

            const text = args
                .filter(a => !/^<#\d+>$/.test(a))
                .join(' ');
            const files = message.attachments.map(a => a.url);

            if (!text && files.length === 0) {
                return message.reply('اكتب نصاً أو ارفع صورة واحدة على الأقل لإرسالها.');
            }

            try {
                await sendBareImages(target, text, files);
                return message.reply(
                    `✅ تم الإرسال إلى ${target}` +
                    (files.length ? ` مع ${files.length} صورة (أول وحدة فوق واللي بعدها تحت، بدون مربعات)` : '') +
                    (text ? `\nالنص: ${text}` : '')
                );
            } catch (error) {
                console.error(error);
                return message.reply(`حدث خطأ أثناء الإرسال. تأكد أن البوت عنده صلاحية الكتابة في ${target}`);
            }
        }

        if (name === 'auto-delete') {
            await sendAutoDeletePanel(message.channel, message.author.id);
            return;
        }

        if (name === 'setup-separator') {
            let src = null;
            const attachment = message.attachments.first();
            if (attachment) {
                src = attachment.url;
            } else if (args[0]) {
                src = args[0];
            }
            if (src) {
                const isFullUrl = /^https?:\/\//i.test(src);
                const isExistingFile = fs.existsSync(path.join(__dirname, src));
                if (!isFullUrl && !isExistingFile) src = null;
            }

            await sendSeparatorPanel(message.channel, message.author.id, src);
            return;
        }

        return message.reply(
            'الأوامر المتاحة:\n' +
            `- \`${PREFIX}auto-delete\` → لوحة الحذف التلقائي (اختر الرومات + المدة + تشغيل)\n` +
            `- \`${PREFIX}setup-separator\` → لوحة الفاصل (اختر الشاتات + الصورة + تشغيل)\n` +
            `- \`${PREFIX}send #الشات النص\` → يرسل نص وصور في شات (ارفق الصور بالترتيب مع الأمر)`
        );
    }

    // Role grant via "صور" / "لايف"
    const tokens = message.content.trim().split(/\s+/).filter(Boolean);
    if (tokens.length > 0 && (tokens[0] === 'صور' || tokens[0] === 'لايف')) {
        const allowedRoles = await db.getGrantRoles().catch(() => []);

        let permitted;
        if (allowedRoles.length === 0) {
            permitted = hasAdminRole(message.member);
        } else {
            permitted = !!message.member && message.member.roles.cache.hasAny(...allowedRoles);
        }

        if (permitted) {
            const word = tokens[0];
            const roleId = word === 'صور' ? '1548148494198378497' : '1548148491145187328';

            let targetUser = null;

            if (message.reference && message.reference.messageId) {
                try {
                    const ref = await message.fetchReference();
                    targetUser = ref.author;
                } catch (err) { /* ignore */ }
            }

            if (!targetUser && message.mentions.users.size > 0) {
                targetUser = message.mentions.users.first();
            }

            if (!targetUser) {
                const idMatch = message.content.trim().match(/\b(\d{17,20})\b/);
                if (idMatch) {
                    try {
                        targetUser = await client.users.fetch(idMatch[1]);
                    } catch (err) { /* ignore */ }
                }
            }

            if (!targetUser) {
                return message.react('❌').catch(() => {});
            }

            try {
                const member = await message.guild.members.fetch(targetUser.id);
                if (member.roles.cache.has(roleId)) {
                    await member.roles.remove(roleId);
                } else {
                    await member.roles.add(roleId);
                }
                return message.react('✅').catch(() => {});
            } catch (error) {
                console.error('Role grant error:', error.message);
                return message.react('❌').catch(() => {});
            }
        }
    }

    // Auto Reaction (runtime)
    try {
        const reactionData = await db.getReaction(message.channel.id);
        if (reactionData && reactionData.emoji) {
            const emojis = reactionData.emoji.split(/\s+/).filter(e => e.trim() !== '');
            for (const emj of emojis) {
                await message.react(emj).catch(err => console.error(`Error reacting with ${emj}`, err.message));
            }
        }
    } catch (error) {
        console.error('Error fetching reaction config', error);
    }

    // Separator (runtime)
    try {
        const separatorData = await db.getSeparator(message.channel.id);
        if (separatorData && separatorData.separator_url) {
            const url = separatorData.separator_url;
            let separatorMessage;

            const isText = message.channel.isTextBased && message.channel.isTextBased();

            if (/^https?:\/\//i.test(url)) {
                const local = await localizeImage(url);
                if (local && isText) {
                    separatorMessage = await message.channel.send({ files: [local] });
                } else if (isText) {
                    let sepName = 'separator.png';
                    try {
                        const p = new URL(url).pathname;
                        const ext = (p.split('.').pop() || '').toLowerCase();
                        if (IMAGE_EXTS.includes(ext)) sepName = 'separator.' + ext;
                    } catch (e) { /* keep default */ }
                    separatorMessage = await message.channel.send({ files: [{ attachment: url, name: sepName }] });
                } else {
                    const embed = new EmbedBuilder()
                        .setColor('#2b2d31')
                        .setImage(url);
                    separatorMessage = await client.rest.post(`/channels/${message.channel.id}/messages`, {
                        body: { embeds: [embed.toJSON()] }
                    });
                }
            } else if (fs.existsSync(path.join(__dirname, url)) && isText) {
                separatorMessage = await message.channel.send({ files: [path.join(__dirname, url)] });
            } else if (isText) {
                separatorMessage = await message.channel.send({ content: url });
            } else {
                separatorMessage = await client.rest.post(`/channels/${message.channel.id}/messages`, {
                    body: { content: url }
                });
            }

            await db.setLastSeparatorMessage(message.channel.id, separatorMessage.id);
        }
    } catch (error) {
        console.error('Error handling separator', error);
    }
});

// Level system - voice points based on mute/deaf state:
// deaf+mute => no points;  mute (no deaf) => 1 point every 5 minutes;  normal => 1 point per minute
async function voiceTick() {
    const next = new Map();
    for (const guild of client.guilds.cache.values()) {
        for (const vs of guild.voiceStates.cache.values()) {
            if (!vs.channelId || !vs.member || vs.member.user.bot) continue;
            const uid = vs.member.id;
            const muted = !!(vs.selfMute || vs.serverMute);
            const deaf = !!(vs.selfDeaf || vs.serverDeaf);
            const partial = voiceMeters.get(uid) || 0;

            if (deaf && muted) {
                next.set(uid, 0);
                continue;
            }

            const voicePts = Math.random() < 0.5 ? 8 : 5;

            if (muted && !deaf) {
                const soft = partial + 1;
                if (soft >= 5) {
                    await db.bumpLevelVoice(guild.id, uid, voicePts).catch(() => {});
                    next.set(uid, 0);
                } else {
                    next.set(uid, soft);
                }
                if (soft >= 5) await checkVoiceRoleRewards(guild, vs.member).catch(() => {});
                continue;
            }

            await db.bumpLevelVoice(guild.id, uid, voicePts).catch(() => {});
            next.set(uid, 0);
            await checkVoiceRoleRewards(guild, vs.member).catch(() => {});
        }
    }
    voiceMeters = next;
}

let voiceMeters = new Map();
setInterval(() => {
    voiceTick().catch(() => {});
}, 60000);

client.login(process.env.DISCORD_TOKEN);