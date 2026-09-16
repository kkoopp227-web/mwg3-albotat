const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas');
const fs = require('fs');

const WIDTH = 900;
const PAD = 30;
const MAX_HEIGHT = 2600;
const FONT_SIZE = 18;
const LINE_H = 28;

let FONT = 'sans-serif';
function initFont() {
  const candidates = [
    ['C:\\Windows\\Fonts\\segui.ttf', 'Segoe UI'],
    ['C:\\Windows\\Fonts\\tahoma.ttf', 'Tahoma'],
    ['C:\\Windows\\Fonts\\arial.ttf', 'Arial'],
  ];
  for (const [p, name] of candidates) {
    try {
      if (fs.existsSync(p)) {
        GlobalFonts.registerFromPath(p, name);
        if (FONT === 'sans-serif') FONT = name;
      }
    } catch (e) {}
  }
}
initFont();

const NAME_COLORS = [
  '#dcb67a', '#faa61a', '#3ba55d', '#ed4245',
  '#5865f2', '#eb459e', '#9a9dff', '#96c01a',
];

function colorFor(id) {
  let h = 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return NAME_COLORS[h % NAME_COLORS.length];
}

function wrapText(ctx, text, maxWidth) {
  const chars = Array.from(text);
  const lines = [];
  let line = '';
  for (const ch of chars) {
    if (ch === '\n') {
      lines.push(line);
      line = '';
      continue;
    }
    if (ctx.measureText(line + ch).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else {
      line += ch;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function formatDate(ts) {
  return new Date(ts).toLocaleString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function drawHeader(ctx, channel, guild, totalCount) {
  ctx.fillStyle = '#5865f2';
  ctx.fillRect(0, 0, WIDTH, 6);
  ctx.fillStyle = '#f2f3f5';
  ctx.font = `bold 22px ${FONT}`;
  ctx.textBaseline = 'top';
  ctx.fillText(`📄 ترانسكريبت التذكرة — ${channel.name}`, PAD, 24);
  ctx.fillStyle = '#9aa0a6';
  ctx.font = `14px ${FONT}`;
  ctx.fillText(
    `${guild.name} • ${new Date().toLocaleString('ar-EG', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })} • ${totalCount} رسالة`,
    PAD,
    56
  );
}

/**
 * يرسل صور الكلام اللي صار في القناة (بدون رسائل البوت) مع صور الأشخاص،
 * مرقمة من 1 حتى النهاية.
 */
async function renderTranscriptImages(messages, channel, guild) {
  // تجاهل رسائل البوت
  const msgs = [...messages.values()]
    .filter((m) => !m.author.bot)
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  if (!msgs.length) return [];

  // تحميل صور الأشخاص
  const avatars = {};
  for (const msg of msgs) {
    if (avatars[msg.author.id]) continue;
    try {
      avatars[msg.author.id] = await loadImage(
        msg.author.displayAvatarURL({ extension: 'png', size: 64 })
      );
    } catch {
      avatars[msg.author.id] = null;
    }
  }

  const images = [];
  let page = 1;

  let canvas = createCanvas(WIDTH, MAX_HEIGHT);
  let ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1e1f22';
  ctx.fillRect(0, 0, WIDTH, MAX_HEIGHT);
  drawHeader(ctx, channel, guild, msgs.length);
  let y = 98;

  const buildFooter = () => {
    ctx.fillStyle = '#9aa0a6';
    ctx.font = `14px ${FONT}`;
    ctx.fillText(`صفحة ${page} / ${msgs.length} رسالة`, WIDTH - PAD - 210, MAX_HEIGHT - 40);
  };

  const newPage = () => {
    buildFooter();
    images.push(canvas.toBuffer('image/png'));
    page++;
    canvas = createCanvas(WIDTH, MAX_HEIGHT);
    ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1e1f22';
    ctx.fillRect(0, 0, WIDTH, MAX_HEIGHT);
    drawHeader(ctx, channel, guild, msgs.length);
    y = 98;
  };

  const drawAvatar = (author) => {
    const cx = PAD + 20;
    const cy = y + 20;
    const img = avatars[author.id];
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, 20, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, cx - 20, cy - 20, 40, 40);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, 20, 0, Math.PI * 2);
      ctx.fillStyle = colorFor(author.id);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 18px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(Array.from(author.username)[0] || '؟', cx, cy);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
    }
  };

  const drawMessage = (msg) => {
    const textX = PAD + 56;
    const maxW = WIDTH - textX - PAD;

    ctx.font = `${FONT_SIZE}px ${FONT}`;
    const lines = wrapText(ctx, msg.content || '', maxW);

    const extra = [];
    for (const att of msg.attachments.values()) extra.push(`📎 ${att.name || 'ملف'}`);
    for (const att of msg.stickers.values()) extra.push(`🖼️ ${att.name || 'ملصق'}`);
    for (const emb of msg.embeds) {
      if (emb.title) extra.push(emb.title);
      if (emb.description) extra.push(emb.description);
    }

    const msgH = lines.length * LINE_H + 30 + extra.length * LINE_H;

    if (y + msgH > MAX_HEIGHT - 70) newPage();

    drawAvatar(msg.author);

    ctx.fillStyle = colorFor(msg.author.id);
    ctx.font = `bold 16px ${FONT}`;
    const name = msg.author.username.slice(0, 25);
    ctx.fillText(name, textX, y);

    ctx.fillStyle = '#9aa0a6';
    ctx.font = `12px ${FONT}`;
    ctx.fillText(formatDate(msg.createdTimestamp), textX + ctx.measureText(name).width + 12, y + 2);

    ctx.fillStyle = '#dbdee1';
    ctx.font = `${FONT_SIZE}px ${FONT}`;
    let ly = y + 28;
    for (const line of lines) {
      ctx.fillText(line, textX, ly);
      ly += LINE_H;
    }
    for (const line of extra) {
      ctx.fillStyle = '#9aa0a6';
      ctx.fillText(line, textX, ly);
      ly += LINE_H;
      ctx.fillStyle = '#dbdee1';
    }

    y += msgH;
  };

  for (const msg of msgs) drawMessage(msg);

  if (msgs.length) buildFooter();
  images.push(canvas.toBuffer('image/png'));

  return images;
}

module.exports = { renderTranscriptImages };