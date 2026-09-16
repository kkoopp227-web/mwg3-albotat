const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas');
const fs = require('fs');

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

const W = 1000;
const ROW_H = 72;
const HEADER_H = 150;
const PER_PAGE = 10;

function rankColor(index) {
  if (index === 0) return '#f1c40f';
  if (index === 1) return '#bdc3c7';
  if (index === 2) return '#cd7f32';
  return '#5865f2';
}

/**
 * يرسل لوحة صدارة كصورة (10 أشخاص بالصفحة) مرتبة من الأكثر للأقل.
 * يعيد { image, page, totalPages } أو null إذا لا توجد نقاط.
 */
async function renderLeaderboard(points, guild, page = 1, perPage = PER_PAGE) {
  const entries = Object.entries(points || {})
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  if (!entries.length) return null;

  const totalPages = Math.max(1, Math.ceil(entries.length / perPage));
  const cur = Math.min(Math.max(1, page), totalPages);
  const rows = entries.slice((cur - 1) * perPage, cur * perPage);

  // تحميل صور الأشخاص
  const avatars = {};
  for (const [id] of rows) {
    const member = guild.members.cache.get(id);
    if (member) {
      try {
        avatars[id] = await loadImage(
          member.user.displayAvatarURL({ extension: 'png', size: 64 })
        );
      } catch {
        avatars[id] = null;
      }
    } else {
      avatars[id] = null;
    }
  }

  const H = HEADER_H + rows.length * ROW_H + 60;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1e1f22';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#f1c40f';
  ctx.fillRect(0, 0, W, 8);

  ctx.fillStyle = '#f2f3f5';
  ctx.font = `bold 30px ${FONT}`;
  ctx.textBaseline = 'top';
  ctx.fillText('🏆 لوحة الصدارة — نقاط التذاكر', 40, 32);

  ctx.fillStyle = '#9aa0a6';
  ctx.font = `17px ${FONT}`;
  ctx.fillText(
    `صفحة ${cur} من ${totalPages} • مرتبة من الأكثر إلى الأقل`,
    40,
    78
  );
  ctx.fillText(
    new Date().toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }),
    40,
    102
  );

  let y = HEADER_H;
  rows.forEach(([id, pts], idx) => {
    const rankNum = (cur - 1) * perPage + idx + 1;
    const name =
      (guild.members.cache.get(id)?.user.username ?? '') ||
      'مستخدم ' + String(id).slice(-4);
    const cy = y + ROW_H / 2;

    // رقم الترتيب
    ctx.beginPath();
    ctx.arc(52, cy, 22, 0, Math.PI * 2);
    ctx.fillStyle = rankColor(rankNum - 1);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 20px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(rankNum), 52, cy);

    // صورة الشخص
    const img = avatars[id];
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(114, cy, 30, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, 114 - 30, cy - 30, 60, 60);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(114, cy, 30, 0, Math.PI * 2);
      ctx.fillStyle = rankColor(rankNum - 1);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(Array.from(name)[0] || '؟', 114, cy);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
    }

    // الاسم
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#dbdee1';
    ctx.font = `bold 22px ${FONT}`;
    const display = name.length > 30 ? name.slice(0, 27) + '…' : name;
    ctx.fillText(display, 164, y + ROW_H / 2 - 18);

    // النقاط
    ctx.fillStyle = '#f1c40f';
    ctx.font = `bold 24px ${FONT}`;
    const ptsText = `${pts} نقطة`;
    const tw = ctx.measureText(ptsText).width;
    ctx.fillText(ptsText, W - 48 - tw, y + ROW_H / 2 - 18);

    // فاصل
    ctx.fillStyle = '#2b2d31';
    ctx.fillRect(40, y + ROW_H - 2, W - 80, 2);

    y += ROW_H;
  });

  return {
    image: canvas.toBuffer('image/png'),
    page: cur,
    totalPages,
  };
}

module.exports = { renderLeaderboard };