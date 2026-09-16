const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ActivityType,
  REST,
  Routes,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
let config = {};
try {
  config = require('./config.json');
} catch (e) {
  config = {};
}
if (process.env.TOKEN) config.token = process.env.TOKEN;
const db = require('./utils/data');
let data = db.data;
let save = db.save;
const dataReady = db.init();
const { renderTranscriptImages } = require('./utils/transcriptImages');
const { renderLeaderboard } = require('./utils/leaderboard');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User],
});

// ================= ثوابت =================
const CHANNEL_PREFIX = 'ticket-';
const BUTTONS = {
  OPEN_TICKET: 'ticket_open',
  SELECT_CATEGORY: 'ticket_select_category',
};
const ID_PREFIX = {
  APPROVE: 'appr_',
  REJECT: 'rej_',
  ROLE_PICK_NEW: 'rpnew_',
  ROLE_PICK_EDIT: 'rpedit_',
};

const TOP_SELECTS = {
  ROLES: 'top_roles_select',
  CHANNELS: 'top_channels_select',
};
const TOP_RESET_YES = 'top_reset_yes';
const TOP_RESET_NO = 'top_reset_no';
const TOP_WORDS = ['توب', 'top'];
const ALLOWED_GUILD_ID = process.env.GUILD_ID || '1541409816201793546';
const TOP_NAV_PREFIX = 'top_go_';
const TOP_PER_PAGE = 10;

const ROLE_SELECT_MIN = 0;
const ROLE_SELECT_MAX = 25;
const CLOSE_WORD = 'اغلاق';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ================= أوامر السلاش =================
const commands = [
  { name: 'setup', description: 'إنشاء لوحة التذاكر في القناة الحالية' },
  {
    name: 'staff',
    description: 'إدارة رولات استلام التذاكر',
    options: [
      {
        name: 'add',
        description: 'إضافة رول يستلم التذاكر',
        type: 1,
        options: [{ name: 'role', description: 'الرول', type: 8, required: true }],
      },
      {
        name: 'remove',
        description: 'حذف رول من الاستلام',
        type: 1,
        options: [{ name: 'role', description: 'الرول', type: 8, required: true }],
      },
      { name: 'list', description: 'عرض رولات الاستلام', type: 1 },
    ],
  },
  {
    name: 'ticket_option',
    description: 'إدارة أقسام التذاكر',
    options: [
      {
        name: 'add',
        description: 'إضافة قسم جديد (مع تحديد رولات الاستلام)',
        type: 1,
        options: [
          { name: 'name', description: 'اسم القسم', type: 3, required: true },
          { name: 'description', description: 'وصف القسم', type: 3, required: true },
          { name: 'emoji', description: 'إيموجي (اختياري)', type: 3, required: false },
        ],
      },
      {
        name: 'edit_roles',
        description: 'تغيير رولات استلام قسم',
        type: 1,
        options: [
          { name: 'option', description: 'القسم', type: 3, required: true, autocomplete: true },
        ],
      },
      {
        name: 'remove',
        description: 'حذف قسم',
        type: 1,
        options: [
          { name: 'option', description: 'القسم', type: 3, required: true, autocomplete: true },
        ],
      },
      { name: 'list', description: 'عرض الأقسام', type: 1 },
    ],
  },
  {
    name: 'settings',
    description: 'إعدادات البوت',
    options: [
      {
        name: 'logs_channel',
        description: 'تحديد قناة السجل',
        type: 1,
        options: [{ name: 'channel', description: 'قناة اللوجات', type: 7, required: true }],
      },
      {
        name: 'receive_channel',
        description: 'تحديد شات الاستلام (تظهر فيه طلبات التذاكر)',
        type: 1,
        options: [{ name: 'channel', description: 'شات الاستلام', type: 7, required: true }],
      },
      {
        name: 'panel_channel',
        description: 'تحديد قناة اللوحة وإرسالها فوراً',
        type: 1,
        options: [{ name: 'channel', description: 'قناة اللوحة', type: 7, required: true }],
      },
      {
        name: 'panel_image',
        description: 'وضع صورة للوحة (اتركه فارغاً للحذف)',
        type: 1,
        options: [{ name: 'url', description: 'رابط الصورة', type: 3, required: false }],
      },
      {
        name: 'category',
        description: 'تحديد كاتيجوري التذاكر',
        type: 1,
        options: [{ name: 'category', description: 'الكاتيجوري', type: 7, required: true }],
      },
      {
        name: 'admin_role',
        description: 'تحديد رول التحكم بالأوامر',
        type: 1,
        options: [{ name: 'role', description: 'الرول', type: 8, required: true }],
      },
    ],
  },
  {
    name: 'top_settings',
    description: 'إعدادات نظام التوب (الرولات والشاتات)',
    options: [
      {
        name: 'roles',
        description: 'الرولات المسموح لها استخدام التوب',
        type: 1,
      },
      {
        name: 'channels',
        description: 'الشاتات اللي يُكتب فيها توب',
        type: 1,
      },
      {
        name: 'view',
        description: 'عرض إعدادات التوب الحالية',
        type: 1,
      },
    ],
  },
  {
    name: 'top_add',
    description: 'إضافة نقاط لشخص في التوب',
    options: [
      { name: 'user', description: 'الشخص', type: 6, required: true },
      { name: 'points', description: 'عدد النقاط', type: 4, required: true },
    ],
  },
  {
    name: 'top_reset',
    description: 'تصفير نقاط التوب كاملة',
  },
];

// ================= تسجيل الدخول =================
client.once(Events.ClientReady, async () => {
  console.log(`✅ تم الدخول بنجاح: ${client.user.tag}`);

  client.user.setActivity(config.activity || 'نظام التذاكر', {
    type: ActivityType.Watching,
  });

  const rest = new REST({ version: '10' }).setToken(config.token);

  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
    console.log('✅ تم حذف الأوامر العامة');
  } catch (err) {
    console.error('❌ فشل حذف الأوامر العامة:', err);
  }

  for (const guild of client.guilds.cache.values()) {
    try {
      if (guild.id === ALLOWED_GUILD_ID) {
        await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), {
          body: commands,
        });
        console.log(`✅ تم تسجيل الأوامر في سيرفر ${guild.name} (${guild.id})`);
      } else {
        await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), {
          body: [],
        });
        console.log(`⛔ السيرفر ${guild.name} (${guild.id}) غير مسموح — تم حذف أوامره`);
      }
    } catch (err) {
      console.error(`❌ فشل التسجيل في ${guild.name}:`, err.message);
    }
  }

  if (data.panelChannelId) {
    const channel = client.channels.cache.get(data.panelChannelId);
    if (!channel) {
      console.log('⚠️ لم يتم العثور على قناة لوحة التذاكر');
    } else if (await panelAlreadySent(channel)) {
      console.log('ℹ️ اللوحة موجودة مسبقاً');
    } else {
      await sendPanel(channel);
      console.log('✅ تم إرسال لوحة التذاكر');
    }
  } else {
    console.log('ℹ️ استخدم /settings panel_channel لتحديد قناة اللوحة');
  }
});

// ================= أدوات مساعدة =================

function isControl(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.id === member.guild.ownerId) return true;
  return data.adminRoleId && member.roles.cache.has(data.adminRoleId);
}

function canHandleTicket(member, option) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.id === member.guild.ownerId) return true;
  if (data.adminRoleId && member.roles.cache.has(data.adminRoleId)) return true;
  const ids = option.roleIds && option.roleIds.length ? option.roleIds : data.supportRoles || [];
  return ids.some((id) => member.roles.cache.has(id));
}

function allowedToUseTop(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.id === member.guild.ownerId) return true;
  if (!(data.topRoles || []).length) return false;
  return data.topRoles.some((id) => member.roles.cache.has(id));
}

function canCloseTicket(member, channel) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.id === member.guild.ownerId) return true;
  if (data.adminRoleId && member.roles.cache.has(data.adminRoleId)) return true;
  const topic = channel.topic || '';
  const match = topic.match(/received-by:\s*(\d+)/);
  const handlerId = match ? match[1] : null;
  if (handlerId) return member.id === handlerId;
  return false;
}

function isTicketChannel(channel) {
  return (
    channel &&
    channel.type === ChannelType.GuildText &&
    channel.name.startsWith(CHANNEL_PREFIX)
  );
}

function getOwnerIdFromTopic(channel) {
  if (!channel.topic) return null;
  const match = channel.topic.match(/ticket-owner-id:\s*(\d+)/);
  return match ? match[1] : null;
}

async function logToChannel(guild, embed) {
  const ch = guild.channels.cache.get(data.logsChannelId);
  if (!ch) return null;
  try {
    return await ch.send({ embeds: [embed] });
  } catch {
    return null;
  }
}

function buildTopNav(page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(TOP_NAV_PREFIX + (page - 1))
      .setLabel('السابق')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('◀️')
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(TOP_NAV_PREFIX + '0-count')
      .setLabel(`${page} / ${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(TOP_NAV_PREFIX + (page + 1))
      .setLabel('التالي')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('▶️')
      .setDisabled(page >= totalPages)
  );
}

function getTopEntries() {
  return Object.entries(data.topPoints || {})
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
}

async function sendTopBoard(channel, page = 1) {
  const entries = getTopEntries();
  if (!entries.length) {
    return channel.send('🏆 لا توجد نقاط في التوب بعد.');
  }
  const totalPages = Math.max(1, Math.ceil(entries.length / TOP_PER_PAGE));
  const res = await renderLeaderboard(data.topPoints, channel.guild, page, TOP_PER_PAGE);
  if (!res) return channel.send('🏆 لا توجد نقاط في التوب بعد.');
  return channel.send({
    files: [{ attachment: res.image, name: 'top.png' }],
    components: [buildTopNav(res.page, res.totalPages)],
  });
}

// ===== لوحة التذاكر =====
function buildPanelEmbed() {
  const embed = new EmbedBuilder().setColor(config.color || 0x5865f2);
  if (data.panelImage) embed.setImage(data.panelImage);
  return embed;
}

function buildPanelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(BUTTONS.OPEN_TICKET)
      .setLabel('فتح تذكرة')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🎫')
  );
}

function buildCategorySelectRow() {
  if (!data.ticketOptions.length) return null;
  const menu = new StringSelectMenuBuilder()
    .setCustomId(BUTTONS.SELECT_CATEGORY)
    .setPlaceholder('🎯 اختر القسم')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      data.ticketOptions.map((o) => {
        const opt = {
          label: o.name.length > 30 ? o.name.slice(0, 27) + '…' : o.name,
          value: o.id,
        };
        if (o.description) {
          opt.description =
            o.description.length > 60 ? o.description.slice(0, 57) + '…' : o.description;
        }
        if (o.emoji) opt.emoji = { name: o.emoji };
        return opt;
      })
    );
  return new ActionRowBuilder().addComponents(menu);
}

function buildRoleSelect(guild, customId, placeholder) {
  const roles = [
    ...guild.roles.cache
      .filter((r) => r.id !== r.guild.id && !r.managed)
      .sort((a, b) => b.position - a.position)
      .values(),
  ].slice(0, ROLE_SELECT_MAX);
  if (!roles.length) return null;
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .setMinValues(ROLE_SELECT_MIN)
      .setMaxValues(ROLE_SELECT_MAX)
      .addOptions(
        roles.map((r) => ({
          label: r.name.length > 25 ? r.name.slice(0, 22) + '…' : r.name,
          value: r.id,
        }))
      )
  );
}

async function sendPanel(channel) {
  return channel.send({ embeds: [buildPanelEmbed()], components: [buildPanelRow()] });
}

async function panelAlreadySent(channel) {
  try {
    const msgs = await channel.messages.fetch({ limit: 10 });
    return msgs.some(
      (m) =>
        m.author.id === client.user.id &&
        m.components.some((row) => row.components.some((c) => c.customId === BUTTONS.OPEN_TICKET))
    );
  } catch {
    return false;
  }
}

// ================= إنشاء التذكرة =================
async function createTicket(user, guild, option, openedBy) {
  const existing = guild.channels.cache.find(
    (ch) =>
      ch.name.startsWith(CHANNEL_PREFIX) &&
      ch.topic &&
      ch.topic.includes(`ticket-owner-id: ${user.id}`)
  );
  if (existing) return { error: `لديك تذكرة مفتوحة بالفعل: <#${existing.id}>` };

  const category = data.categoryId ? guild.channels.cache.get(data.categoryId) : null;

  const username = (user.username.replace(/[^a-zA-Z0-9-_]/g, '') || 'user').slice(0, 25);
  const optName = (option.name.replace(/[^a-zA-Z0-9-_]/g, '') || 'ticket').slice(0, 20);
  const channelName = `ticket-${optName}-${username}`.slice(0, 100);

  const specific = option.roleIds && option.roleIds.length ? option.roleIds : data.supportRoles || [];
  const accessRoles = [...new Set([...specific, data.adminRoleId].filter(Boolean))];

  const overrides = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
  ];

  for (const roleId of accessRoles) {
    const role = guild.roles.cache.get(roleId);
    if (role) {
      overrides.push({
        id: roleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages,
        ],
      });
    }
  }

  let topic = `ticket-owner-id: ${user.id}\noption-id: ${option.id}`;
  if (openedBy) topic += `\nreceived-by: ${openedBy.id}`;

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    topic,
    parent: category ? category.id : undefined,
    permissionOverwrites: overrides,
  });

  const firstRole = accessRoles[0];
  const content = `${user}${firstRole ? ` <@&${firstRole}>` : ''}`.trim();

  const introEmbed = new EmbedBuilder()
    .setColor(config.color || 0x5865f2)
    .setTitle(`🎫 ${option.name}`)
    .setDescription(option.description || 'وردك تم استقباله، سيقوم فريق الدعم بمساعدتك قريباً.')
    .addFields(
      { name: 'المفتوحة بواسطة', value: user.toString(), inline: true },
      { name: 'الحالة', value: '🟢 مفتوحة', inline: true }
    )
    .setFooter({ text: `لإغلاق التذكرة اكتب "${CLOSE_WORD}" في هذه القناة` })
    .setTimestamp();

  await channel.send({ content, embeds: [introEmbed] });

  // رسالة استلام التذكرة من طرف الموظف
  if (openedBy && openedBy.id !== user.id) {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle('✅ تم استلام التذكرة')
          .setDescription(`تم استلام هذه التذكرة من طرف **${openedBy}**.`)
          .setTimestamp(),
      ],
    });
  }

  const opener = openedBy ? `${openedBy} (\`${openedBy.id}\`)` : `${user} (\`${user.id}\`)`;
  const logEmbed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('🎫 تم فتح تذكرة')
    .setDescription(
      `**القسم:** ${option.name}\n` +
        `**فُتحت من طرف:** ${opener}\n` +
        `**صاحب التذكرة:** ${user} (\`${user.id}\`)\n` +
        `**القناة:** <#${channel.id}>`
    )
    .setTimestamp();
  await logToChannel(guild, logEmbed);

  return { channel };
}

// ================= طلب تذكرة (شات الاستلام) =================
async function requestTicket(user, guild, option) {
  const receive = guild.channels.cache.get(data.receiveChannelId);

  // إذا ما في شات استلام → افتح مباشرة
  if (!receive) {
    return createTicket(user, guild, option, user);
  }

  const dupRequest = Object.values(data.pendingRequests).some(
    (r) => r.guildId === guild.id && r.userId === user.id
  );
  if (dupRequest) return { error: 'لديك طلب تذكرة قيد المراجعة بالفعل.' };

  const existing = guild.channels.cache.find(
    (ch) =>
      ch.name.startsWith(CHANNEL_PREFIX) &&
      ch.topic &&
      ch.topic.includes(`ticket-owner-id: ${user.id}`)
  );
  if (existing) return { error: `لديك تذكرة مفتوحة بالفعل: <#${existing.id}>` };

  const reqId = `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('📥 طلب تذكرة جديد')
    .setDescription(
      `**المستخدم:** ${user} (\`${user.id}\`)\n` +
        `**القسم:** ${option.name}${option.emoji ? ' ' + option.emoji : ''}\n` +
        `**الوقت:** <t:${Math.floor(Date.now() / 1000)}:R>`
    )
    .setFooter({ text: 'اضغط قبول لفتح التذكرة أو رفض لإلغائها' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(ID_PREFIX.APPROVE + reqId).setLabel('قبول').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId(ID_PREFIX.REJECT + reqId).setLabel('رفض').setStyle(ButtonStyle.Danger).setEmoji('❌')
  );

  // منشن رولات المسؤول عن التذكرة
  const responsibleIds =
    option.roleIds && option.roleIds.length ? option.roleIds : data.supportRoles || [];
  const pingRoles = responsibleIds
    .map((id) => guild.roles.cache.get(id))
    .filter(Boolean);
  const content = pingRoles.length
    ? `${pingRoles.map((r) => `<@&${r.id}>`).join(' ')} — طلب تذكرة جديد`
    : '📥 طلب تذكرة جديد';

  const msg = await receive.send({ content, embeds: [embed], components: [row] });

  data.pendingRequests[reqId] = {
    userId: user.id,
    guildId: guild.id,
    optionId: option.id,
    receiveChannelId: receive.id,
    messageId: msg.id,
  };
  save();

  return { requested: true, channel: receive };
}

// ================= الموافقة على الطلب =================
async function approveRequest(interaction, reqId) {
  const req = data.pendingRequests[reqId];
  if (!req) {
    return interaction.reply({ content: '❌ هذا الطلب لم يعد موجوداً.', ephemeral: true });
  }

  const option =
    data.ticketOptions.find((o) => o.id === req.optionId) || {
      id: 'general', name: 'تذكرة عامة', description: '', emoji: null, roleIds: [],
    };

  if (!canHandleTicket(interaction.member, option)) {
    return interaction.reply({ content: '❌ ليس لديك صلاحية قبول هذا القسم.', ephemeral: true });
  }

  delete data.pendingRequests[reqId];
  save();

  const guild = interaction.guild;
  const member = guild.members.cache.get(req.userId);

  const approvedEmbed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('✅ تم قبول الطلب')
    .setDescription(
      `**المستخدم:** ${member ? member.user : '<@' + req.userId + '>'}\n` +
        `**القسم:** ${option.name}\n` +
        `**قُبل من طرف:** ${interaction.user} (\`${interaction.user.id}\`)`
    )
    .setTimestamp();

  if (!member) {
    await interaction.update({
      embeds: [approvedEmbed.setDescription('تم إلغاء الطلب — العضو غير موجود في السيرفر.')],
      components: [],
    });
    return;
  }

  await interaction.update({ embeds: [approvedEmbed], components: [] });

  const result = await createTicket(member.user, guild, option, interaction.user);
  if (result.error) {
    return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
  }

  try {
    await member.user.send(`✅ تم قبول تذكرتك في **${guild.name}**: <#${result.channel.id}>`);
  } catch {}
}

// ================= رفض الطلب =================
async function rejectRequest(interaction, reqId) {
  const req = data.pendingRequests[reqId];
  if (!req) {
    return interaction.reply({ content: '❌ هذا الطلب لم يعد موجوداً.', ephemeral: true });
  }

  const option =
    data.ticketOptions.find((o) => o.id === req.optionId) || {
      id: 'general', name: 'تذكرة عامة', description: '', emoji: null, roleIds: [],
    };

  if (!canHandleTicket(interaction.member, option)) {
    return interaction.reply({ content: '❌ ليس لديك صلاحية رفض هذا القسم.', ephemeral: true });
  }

  delete data.pendingRequests[reqId];
  save();

  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle('❌ تم رفض الطلب')
        .setDescription(
          `**المستخدم:** <@${req.userId}>\n` +
            `**القسم:** ${option.name}\n` +
            `**رُفض من طرف:** ${interaction.user} (\`${interaction.user.id}\`)`
        )
        .setTimestamp(),
    ],
    components: [],
  });
}

// ================= إغلاق التذكرة =================
async function performClose(channel, guild, closer) {
  const ownerId = getOwnerIdFromTopic(channel);
  const owner = ownerId ? guild.members.cache.get(ownerId) : null;

  // إضافة نقطة تلقائية للشخص اللي استلم التذكرة
  const topicText = channel.topic || '';
  const receivedMatch = topicText.match(/received-by:\s*(\d+)/);
  const handlerId = receivedMatch ? receivedMatch[1] : null;
  if (handlerId) {
    data.topPoints[handlerId] = (data.topPoints[handlerId] || 0) + 1;
    save();
  }

  // توليد صور الترانسكريبت
  let images = [];
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    images = await renderTranscriptImages(messages, channel, guild);
  } catch (err) {
    console.error('فشل توليد صور الترانسكريبت:', err.message);
  }

  // إرسال الصور المرقمة لقناة السجل
  const logsCh = guild.channels.cache.get(data.logsChannelId);
  if (logsCh && images.length) {
    try {
      for (let i = 0; i < images.length; i++) {
        await logsCh.send({
          content: i === 0 ? `📸 **ترانسكريبت التذكرة** \`${channel.name}\` (${images.length} صور)` : undefined,
          files: [{ attachment: images[i], name: `transcript-${channel.name}-${i + 1}.png` }],
        });
        if (images.length > 1) await wait(1200);
      }
    } catch (err) {
      console.error('فشل إرسال الصور:', err.message);
    }
  }

  const logEmbed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('🔒 تم إغلاق التذكرة')
    .setDescription(
      `**أُغلقت من طرف:** ${closer} (\`${closer.id}\`)\n` +
        (owner ? `**صاحب التذكرة:** ${owner.user} (\`${ownerId}\`)\n` : '') +
        (handlerId
          ? `**المستلم الذي حصل على نقطة:** <@${handlerId}> (\`${handlerId}\`)\n`
          : '') +
        `**القناة:** <#${channel.id}>\n` +
        `**الترانسكريبت:** ${images.length ? images.length + ' صور ✅' : '❌'}`
    )
    .setTimestamp();
  await logToChannel(guild, logEmbed);

  await channel.delete('تم إغلاق التذكرة').catch(() => {});
}

// ================= معالج الرسائل (الإغلاق + التوب) =================
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;
  if (message.guild.id !== ALLOWED_GUILD_ID) return;

  const text = message.content.trim().toLocaleLowerCase();

  // ===== التوب =====
  if (TOP_WORDS.includes(text)) {
    const { channel, member } = message;
    if (!(data.topChannels || []).includes(channel.id)) return;
    if (!allowedToUseTop(member)) return;
    try {
      await sendTopBoard(channel, 1);
    } catch (err) {
      console.error('خطأ في إرسال التوب:', err);
    }
    return;
  }

  // ===== الإغلاق بالكتابة =====
  if (!isTicketChannel(message.channel)) return;
  if (text === CLOSE_WORD) {
    if (!canCloseTicket(message.member, message.channel)) {
      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle('⛔ لا يمكنك إغلاق التذكرة')
            .setDescription(
              'فقط **المسؤول اللي استلم التذكرة** أو فريق الإدارة هو من يستطيع إغلاقها.'
            ),
        ],
      });
      return;
    }
    try {
      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle('🔒 جاري إغلاق التذكرة')
            .setDescription('يتم حفظ الترانسكريبت كصور وإرسالها لقناة السجل...'),
        ],
      });
      await performClose(message.channel, message.guild, message.author);
    } catch (err) {
      console.error('خطأ في الإغلاق:', err);
    }
  }
});

// ================= معالج التفاعلات =================
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.guild && interaction.guild.id !== ALLOWED_GUILD_ID) {
    try {
      await interaction.reply({ content: '❌ هذا البوت يعمل في سيرفر محدد فقط.', ephemeral: true });
    } catch (e) {}
    return;
  }
  // ===== الاقتراحات التلقائية =====
  if (interaction.isAutocomplete()) {
    if (interaction.commandName === 'ticket_option') {
      const query = interaction.options.getFocused().toString();
      const filtered = data.ticketOptions
        .filter((o) => o.name.includes(query) || o.id.includes(query))
        .slice(0, 25)
        .map((o) => ({ name: o.name, value: o.id }));
      return interaction.respond(filtered);
    }
    return;
  }

  try {
    // ========================= أوامر السلاش =========================
    if (interaction.isChatInputCommand()) {
      const cmd = interaction.commandName;

      if (['setup', 'staff', 'ticket_option', 'settings', 'top_settings', 'top_add', 'top_reset'].includes(cmd)) {
        if (!isControl(interaction.member)) {
          return interaction.reply({ content: '❌ ليس لديك صلاحية.', ephemeral: true });
        }
      }

      if (cmd === 'setup') {
        await sendPanel(interaction.channel);
        return interaction.reply({ content: '✅ تم إرسال لوحة التذاكر.', ephemeral: true });
      }

      // ---------- staff ----------
      if (cmd === 'staff') {
        const sub = interaction.options.getSubcommand();
        const guild = interaction.guild;

        if (sub === 'add') {
          const role = interaction.options.getRole('role');
          if (data.supportRoles.includes(role.id))
            return interaction.reply({ content: '❌ موجود بالفعل.', ephemeral: true });
          data.supportRoles.push(role.id);
          save();
          return interaction.reply({ content: `✅ تمت إضافة <@&${role.id}> لاستلام التذاكر.`, ephemeral: true });
        }

        if (sub === 'remove') {
          const role = interaction.options.getRole('role');
          if (!data.supportRoles.includes(role.id))
            return interaction.reply({ content: '❌ غير موجود.', ephemeral: true });
          data.supportRoles = data.supportRoles.filter((id) => id !== role.id);
          save();
          return interaction.reply({ content: `✅ تم حذف <@&${role.id}>.`, ephemeral: true });
        }

        if (sub === 'list') {
          const roles = (data.supportRoles || []).map((id) => guild.roles.cache.get(id)).filter(Boolean);
          return interaction.reply({
            embeds: [
              new EmbedBuilder().setColor(config.color).setTitle('🙋 رولات الاستلام').setDescription(
                roles.length ? roles.map((r) => `<@&${r.id}> — \`${r.id}\``).join('\n') : 'لا توجد رولات.'
              ).setTimestamp(),
            ],
            ephemeral: true,
          });
        }
      }

      // ---------- ticket_option ----------
      if (cmd === 'ticket_option') {
        const sub = interaction.options.getSubcommand();

        if (sub === 'add') {
          const name = interaction.options.getString('name').trim();
          const description = interaction.options.getString('description').trim();
          const emoji = interaction.options.getString('emoji');
          if (name.length > 30)
            return interaction.reply({ content: '❌ الاسم يجب أن يكون أقل من 30 حرفاً.', ephemeral: true });
          if (data.ticketOptions.some((o) => o.name === name))
            return interaction.reply({ content: '❌ القسم موجود بالفعل.', ephemeral: true });

          const newId = `opt-${Math.random().toString(36).slice(2, 7)}`;
          data.pendingNewOptions[newId] = { name, description, emoji: emoji || null };
          save();

          const row = buildRoleSelect(
            interaction.guild,
            ID_PREFIX.ROLE_PICK_NEW + newId,
            'حدد الرولات المسموح لها استلام هذا القسم'
          );

          if (!row) {
            data.ticketOptions.push({ id: newId, name, description, emoji: emoji || null, roleIds: [] });
            delete data.pendingNewOptions[newId];
            save();
            return interaction.reply({ content: `✅ تمت إضافة قسم **${name}** ${emoji || ''} (بدون رولات خاصة).`, ephemeral: true });
          }

          return interaction.reply({
            content: `اختر الرولات المسموح لها استلام قسم **${name}**:`,
            components: [row],
            ephemeral: true,
          });
        }

        if (sub === 'edit_roles') {
          const val = interaction.options.getString('option');
          const opt = data.ticketOptions.find((o) => o.id === val) || data.ticketOptions.find((o) => o.name === val);
          if (!opt) return interaction.reply({ content: '❌ القسم غير موجود.', ephemeral: true });

          const row = buildRoleSelect(interaction.guild, ID_PREFIX.ROLE_PICK_EDIT + opt.id, `حدد رولات قسم ${opt.name}`);
          if (!row) return interaction.reply({ content: '❌ لا توجد رولات في السيرفر.', ephemeral: true });
          return interaction.reply({
            content: `حدد رولات قسم **${opt.name}**:`,
            components: [row],
            ephemeral: true,
          });
        }

        if (sub === 'remove') {
          const val = interaction.options.getString('option');
          const opt = data.ticketOptions.find((o) => o.id === val) || data.ticketOptions.find((o) => o.name === val);
          if (!opt) return interaction.reply({ content: '❌ القسم غير موجود.', ephemeral: true });
          data.ticketOptions = data.ticketOptions.filter((o) => o.id !== opt.id);
          save();
          return interaction.reply({ content: `✅ تم حذف **${opt.name}** ${opt.emoji || ''}`, ephemeral: true });
        }

        if (sub === 'list') {
          return interaction.reply({
            embeds: [
              new EmbedBuilder().setColor(config.color).setTitle('🗂️ أقسام التذاكر').setDescription(
                data.ticketOptions.length
                  ? data.ticketOptions
                      .map((o, i) => {
                        const roles = (o.roleIds || []).map((id) => interaction.guild.roles.cache.get(id)).filter(Boolean);
                        return (
                          `${i + 1}. ${o.emoji || ''} **${o.name}**\n` +
                          (roles.length
                            ? `   ↳ رولات: ${roles.map((r) => `<@&${r.id}>`).join(' ')}\n`
                            : `   ↳ رولات: (العامة / غير محددة)\n`)
                        );
                      })
                      .join('')
                  : 'لا توجد أقسام.'
              ).setTimestamp(),
            ],
            ephemeral: true,
          });
        }
      }

      // ---------- settings ----------
      if (cmd === 'settings') {
        const sub = interaction.options.getSubcommand();

        if (sub === 'logs_channel') {
          const ch = interaction.options.getChannel('channel');
          if (ch.type !== ChannelType.GuildText)
            return interaction.reply({ content: '❌ يجب اختيار قناة نصية.', ephemeral: true });
          data.logsChannelId = ch.id;
          save();
          return interaction.reply({ content: `✅ تم تحديد <#${ch.id}> كقناة السجل.`, ephemeral: true });
        }

        if (sub === 'receive_channel') {
          const ch = interaction.options.getChannel('channel');
          if (ch.type !== ChannelType.GuildText)
            return interaction.reply({ content: '❌ يجب اختيار قناة نصية.', ephemeral: true });
          data.receiveChannelId = ch.id;
          save();
          return interaction.reply({ content: `✅ تم تحديد <#${ch.id}> كشات الاستلام.`, ephemeral: true });
        }

        if (sub === 'panel_channel') {
          const ch = interaction.options.getChannel('channel');
          if (ch.type !== ChannelType.GuildText)
            return interaction.reply({ content: '❌ يجب اختيار قناة نصية.', ephemeral: true });
          data.panelChannelId = ch.id;
          save();
          await sendPanel(ch);
          return interaction.reply({ content: `✅ تم تحديد <#${ch.id}> وإرسال اللوحة.`, ephemeral: true });
        }

        if (sub === 'panel_image') {
          const url = interaction.options.getString('url');
          data.panelImage = url || null;
          save();
          return interaction.reply({ content: url ? '✅ تم وضع الصورة.' : '🗑️ تم حذف الصورة.', ephemeral: true });
        }

        if (sub === 'category') {
          const cat = interaction.options.getChannel('category');
          if (cat.type !== ChannelType.GuildCategory)
            return interaction.reply({ content: '❌ يجب اختيار كاتيجوري.', ephemeral: true });
          data.categoryId = cat.id;
          save();
          return interaction.reply({ content: `✅ تم تحديد **${cat.name}** ككاتيجوري التذاكر.`, ephemeral: true });
        }

        if (sub === 'admin_role') {
          const role = interaction.options.getRole('role');
          data.adminRoleId = role.id;
          save();
          return interaction.reply({ content: `✅ تم تحديد <@&${role.id}> كرول التحكم.`, ephemeral: true });
        }
      }
    // ---------- top_settings ----------
      if (cmd === 'top_settings') {
        const sub = interaction.options.getSubcommand();
        const guild = interaction.guild;

        if (sub === 'roles') {
          return interaction.reply({
            content: 'اختر الرولات المسموح لها استخدام التوب:',
            components: [
              new ActionRowBuilder().addComponents(
                new RoleSelectMenuBuilder()
                  .setCustomId(TOP_SELECTS.ROLES)
                  .setPlaceholder('👥 اختر الرولات')
                  .setMinValues(0)
                  .setMaxValues(25)
              ),
            ],
            ephemeral: true,
          });
        }

        if (sub === 'channels') {
          return interaction.reply({
            content: 'اختر الشاتات اللي يُكتب فيها توب:',
            components: [
              new ActionRowBuilder().addComponents(
                new ChannelSelectMenuBuilder()
                  .setCustomId(TOP_SELECTS.CHANNELS)
                  .setPlaceholder('💬 اختر الشاتات')
                  .setChannelTypes([ChannelType.GuildText])
                  .setMinValues(0)
                  .setMaxValues(25)
              ),
            ],
            ephemeral: true,
          });
        }

        if (sub === 'view') {
          const roles = (data.topRoles || []).map((id) => guild.roles.cache.get(id)).filter(Boolean);
          const channels = (data.topChannels || []).map((id) => guild.channels.cache.get(id)).filter(Boolean);
          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(config.color)
                .setTitle('🏆 إعدادات التوب')
                .addFields(
                  {
                    name: '👥 الرولات المسموحة',
                    value: roles.length ? roles.map((r) => `<@&${r.id}> — \`${r.id}\``).join('\n') : 'لا توجد رولات محددة (لن يرد على أحد)',
                    inline: false,
                  },
                  {
                    name: '💬 الشاتات المسموحة',
                    value: channels.length ? channels.map((c) => `<#${c.id}> — \`${c.id}\``).join('\n') : 'لا توجد شاتات محددة',
                    inline: false,
                  },
                  {
                    name: '⭐ النقاط الحالية',
                    value: `${Object.keys(data.topPoints || {}).length} شخص لديه نقاط`,
                    inline: false,
                  }
                )
                .setTimestamp(),
            ],
            ephemeral: true,
          });
        }
      }

      // ---------- top_add ----------
      if (cmd === 'top_add') {
        const user = interaction.options.getUser('user');
        const pts = interaction.options.getInteger('points');
        if (!pts || pts < 1)
          return interaction.reply({ content: '❌ عدد النقاط يجب أن يكون 1 فأكثر.', ephemeral: true });
        data.topPoints[user.id] = (data.topPoints[user.id] || 0) + pts;
        save();
        return interaction.reply({
          content: `✅ تم إضافة **${pts}** نقطة لـ ${user} — الآن لديه **${data.topPoints[user.id]}** نقطة.`,
          ephemeral: true,
        });
      }

      // ---------- top_reset ----------
      if (cmd === 'top_reset') {
        return interaction.reply({
          content: '⚠️ هل أنت متأكد من تصفير جميع نقاط التوب؟',
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(TOP_RESET_YES).setLabel('نعم، صفّر').setStyle(ButtonStyle.Danger).setEmoji('✅'),
              new ButtonBuilder().setCustomId(TOP_RESET_NO).setLabel('إلغاء').setStyle(ButtonStyle.Secondary).setEmoji('❌')
            ),
          ],
          ephemeral: true,
        });
      }
    }

    // ========================= الأزرار =========================
    if (interaction.isButton()) {
      if (interaction.customId === BUTTONS.OPEN_TICKET) {
        if (!interaction.inGuild())
          return interaction.reply({ content: '❌ استخدم الأمر داخل السيرفر.', ephemeral: true });

        if (data.ticketOptions.length > 0) {
          const row = buildCategorySelectRow();
          if (row)
            return interaction.reply({ content: 'اختر القسم المناسب:', components: [row], ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });
        const result = await requestTicket(interaction.user, interaction.guild, {
          id: 'general', name: 'تذكرة عامة', description: '', emoji: null, roleIds: [],
        });
        if (result.error) return interaction.editReply({ content: `❌ ${result.error}` });
        if (result.requested)
          return interaction.editReply({ content: '📥 تم إرسال طلبك، سيقوم الفريق بالموافقة قريباً.' });
        return interaction.editReply({ content: `✅ تم فتح التذكرة: <#${result.channel.id}>` });
      }

      // ===== قبول / رفض الطلبات (شات الاستلام) =====
      if (interaction.customId.startsWith(ID_PREFIX.APPROVE)) {
        return approveRequest(interaction, interaction.customId.slice(ID_PREFIX.APPROVE.length));
      }
      if (interaction.customId.startsWith(ID_PREFIX.REJECT)) {
        return rejectRequest(interaction, interaction.customId.slice(ID_PREFIX.REJECT.length));
      }

      // ===== تصفير التوب =====
      if (interaction.customId === TOP_RESET_YES) {
        data.topPoints = {};
        save();
        return interaction.update({ content: '🗑️ تم تصفير جميع نقاط التوب.', components: [] });
      }
      if (interaction.customId === TOP_RESET_NO) {
        return interaction.update({ content: '✅ تم الإلغاء.', components: [] });
      }

      // ===== تبديل صفحات التوب =====
      if (interaction.customId.startsWith(TOP_NAV_PREFIX)) {
        const target = interaction.customId.slice(TOP_NAV_PREFIX.length);
        if (target.includes('count')) return;
        const page = parseInt(target, 10);
        if (!page || page < 1) return;
        try {
          const entries = getTopEntries();
          const totalPages = Math.max(1, Math.ceil(entries.length / TOP_PER_PAGE));
          if (page > totalPages) return;
          const res = await renderLeaderboard(data.topPoints, interaction.guild, page, TOP_PER_PAGE);
          if (!res)
            return interaction.update({ content: '🏆 لا توجد نقاط في التوب بعد.', files: [], components: [] });
          return interaction.update({
            files: [{ attachment: res.image, name: 'top.png' }],
            components: [buildTopNav(res.page, res.totalPages)],
          });
        } catch (err) {
          console.error('خطأ في تبديل صفحة التوب:', err);
          return interaction.reply({ content: '❌ حدث خطأ.', ephemeral: true });
        }
      }
    }

    // ========================= قوائم الرولات والشاتات =========================
    if (interaction.isRoleSelectMenu() && interaction.customId === TOP_SELECTS.ROLES) {
      data.topRoles = [...interaction.values];
      save();
      const roles = data.topRoles.map((id) => interaction.guild.roles.cache.get(id)).filter(Boolean);
      return interaction.update({
        content: roles.length
          ? `✅ تم تحديث رولات التوب: ${roles.map((r) => `<@&${r.id}>`).join(' ')}`
          : '✅ تم تحديث رولات التوب (لا توجد رولات — لن يرد على أحد).',
        components: [],
      });
    }

    if (interaction.isChannelSelectMenu() && interaction.customId === TOP_SELECTS.CHANNELS) {
      data.topChannels = [...interaction.values];
      save();
      const channels = data.topChannels.map((id) => interaction.guild.channels.cache.get(id)).filter(Boolean);
      return interaction.update({
        content: channels.length
          ? `✅ تم تحديث شاتات التوب: ${channels.map((c) => `<#${c.id}>`).join(' ')}`
          : '✅ تم تحديث شاتات التوب (لا توجد شاتات).',
        components: [],
      });
    }

    // ========================= القوائم =========================
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === BUTTONS.SELECT_CATEGORY) {
        const option = data.ticketOptions.find((o) => o.id === interaction.values[0]);
        if (!option) return interaction.reply({ content: '❌ القسم غير موجود.', ephemeral: true });

        await interaction.deferReply({ ephemeral: true });
        const result = await requestTicket(interaction.user, interaction.guild, option);
        if (result.error) return interaction.editReply({ content: `❌ ${result.error}` });
        if (result.requested)
          return interaction.editReply({
            content: `📥 تم إرسال طلب **${option.name} ${option.emoji || ''}**، سيقوم الفريق بالموافقة قريباً.`,
          });
        return interaction.editReply({ content: `✅ تم فتح التذكرة: <#${result.channel.id}>` });
      }

      // اختيار رولات قسم جديد
      if (interaction.customId.startsWith(ID_PREFIX.ROLE_PICK_NEW)) {
        const newId = interaction.customId.slice(ID_PREFIX.ROLE_PICK_NEW.length);
        const pending = data.pendingNewOptions[newId];
        if (!pending)
          return interaction.update({ content: '❌ انتهت صلاحية هذه الجلسة.', embeds: [], components: [] });

        const roleIds = [...interaction.values];
        data.ticketOptions.push({
          id: newId, name: pending.name, description: pending.description,
          emoji: pending.emoji, roleIds,
        });
        delete data.pendingNewOptions[newId];
        save();

        const rolesText = roleIds.length ? roleIds.map((id) => `<@&${id}>`).join(' ') : '(غير محددة — رولات عامة)';
        return interaction.update({
          content: `✅ تمت إضافة قسم **${pending.name}** ${pending.emoji || ''}\n**رولات الاستلام:** ${rolesText}`,
          embeds: [],
          components: [],
        });
      }

      // تغيير رولات قسم موجود
      if (interaction.customId.startsWith(ID_PREFIX.ROLE_PICK_EDIT)) {
        const optId = interaction.customId.slice(ID_PREFIX.ROLE_PICK_EDIT.length);
        const opt = data.ticketOptions.find((o) => o.id === optId);
        if (!opt)
          return interaction.update({ content: '❌ القسم غير موجود.', embeds: [], components: [] });

        opt.roleIds = [...interaction.values];
        save();
        return interaction.update({ content: `✅ تم تحديث رولات قسم **${opt.name}**.`, embeds: [], components: [] });
      }
    }
  } catch (err) {
    console.error('خطأ:', err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred)
      interaction.reply({ content: '❌ حدث خطأ.', ephemeral: true }).catch(() => {});
  }
});

// ================= خادم Health لـ Render =================
const http = require('http');
const PORT = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  })
  .listen(PORT, () => console.log(`✅ خادم الـ Health يعمل على المنفذ ${PORT}`));

dataReady.then(() => {
  data = db.data;
  save = db.save;
  client.login(config.token).catch((err) => {
    console.error('❌ فشل تسجيل الدخول:', err.message);
  });
});