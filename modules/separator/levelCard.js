const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

function registerFonts() {
    const fonts = [
        { file: 'Tajawal-Regular.ttf', family: 'Tajawal' },
        { file: 'Tajawal-Bold.ttf', family: 'Tajawal Bold' },
    ];
    for (const f of fonts) {
        try {
            GlobalFonts.registerFromPath(path.join(__dirname, 'fonts', f.file), f.family);
        } catch (_) {}
    }
}
registerFonts();

const POINTS_PER_LEVEL = 5000;
const MAX_LEVEL = 150;

const C = {
    bg1: '#0a101f',
    bg2: '#04060b',
    panel: '#111827',
    panelBorder: 'rgba(255,255,255,0.10)',
    white: '#ffffff',
    blue: '#3b82f6',
    blueLight: '#93c5fd',
    blueDeep: '#2563eb',
    track: 'rgba(255,255,255,0.10)',
    muted: 'rgba(255,255,255,0.68)',
    muted2: 'rgba(255,255,255,0.45)',
};

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function fmt(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function calcLevel(points) {
    const level = Math.min(MAX_LEVEL, Math.floor(points / POINTS_PER_LEVEL));
    const intoLevel = points % POINTS_PER_LEVEL;
    const progress = level >= MAX_LEVEL ? 1 : intoLevel / POINTS_PER_LEVEL;
    const toNext = level >= MAX_LEVEL ? 0 : POINTS_PER_LEVEL - intoLevel;
    return { level, progress, toNext };
}

function formatVoiceDuration(minutes) {
    if (minutes >= 60) {
        const h = minutes / 60;
        return (h >= 10 ? Math.round(h) : h.toFixed(1)) + ' ساعة';
    }
    return minutes + ' دقيقة';
}

function drawPanel(ctx, y, width, title, points, detail) {
    const pW = width - 90;
    const pH = 190;
    const x = 45;
    const lv = calcLevel(points);

    ctx.fillStyle = C.panel;
    roundRect(ctx, x, y, pW, pH, 22);
    ctx.fill();
    ctx.strokeStyle = C.panelBorder;
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, pW, pH, 22);
    ctx.stroke();

    ctx.fillStyle = C.blue;
    roundRect(ctx, x, y + 30, 6, pH - 60, 3);
    ctx.fill();

    ctx.textBaseline = 'middle';

    ctx.font = '26px Tajawal';
    ctx.textAlign = 'right';
    ctx.fillStyle = C.muted;
    ctx.fillText(title, x + pW - 34, y + 36);

    ctx.font = 'bold 28px Tajawal';
    ctx.fillStyle = C.white;
    ctx.fillText('المستوى ' + lv.level, x + pW - 34, y + 80);

    const barX = x + 34;
    const barY = y + 118;
    const barW = pW - 68;
    const barH = 16;

    ctx.fillStyle = C.track;
    roundRect(ctx, barX, barY, barW, barH, barH / 2);
    ctx.fill();

    const fillW = Math.max(barH, Math.round(barW * lv.progress));
    const fillGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    fillGrad.addColorStop(0, C.blueDeep);
    fillGrad.addColorStop(1, C.blue);
    ctx.fillStyle = fillGrad;
    roundRect(ctx, barX, barY, fillW, barH, barH / 2);
    ctx.fill();

    ctx.font = '20px Tajawal';
    ctx.fillStyle = C.muted2;
    ctx.textAlign = 'left';
    ctx.fillText(detail, x + 34, y + 156);

    ctx.font = '18px Tajawal';
    if (lv.level >= MAX_LEVEL) {
        ctx.fillStyle = C.blueLight;
        ctx.fillText('وصلت لأعلى مستوى 150', x + pW - 34, y + 156);
    } else {
        ctx.fillStyle = C.muted2;
        ctx.fillText('المتبقي ' + fmt(lv.toNext) + ' نقطة للمستوى التالي', x + pW - 34, y + 156);
    }
}

async function createLevelCard({ avatarURL, username, displayName, guildName, msgPoints, voicePoints }) {
    const width = 700;
    const height = 1050;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, C.bg1);
    bgGrad.addColorStop(1, C.bg2);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    ctx.globalAlpha = 0.10;
    ctx.fillStyle = C.blue;
    ctx.beginPath();
    ctx.arc(width - 30, 130, 220, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(50, height - 40, 180, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(width / 2, height + 70, 250, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    const serverText = (guildName || '').length > 26 ? guildName.slice(0, 26) + '…' : guildName;
    ctx.font = '22px Tajawal';
    const tw = ctx.measureText(serverText).width;
    const pillW = tw + 56;
    const pillH = 52;
    const pillX = (width - pillW) / 2;
    const pillY = 62;

    ctx.fillStyle = 'rgba(59,130,246,0.14)';
    roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(59,130,246,0.55)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    ctx.stroke();
    ctx.fillStyle = C.blueLight;
    ctx.font = '22px Tajawal';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(serverText, width / 2, pillY + pillH / 2 + 2);

    const avSize = 150;
    const avX = (width - avSize) / 2;
    const avY = 148;
    ctx.save();
    ctx.beginPath();
    ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    let avatar = null;
    try {
        avatar = await loadImage(avatarURL);
    } catch (_) {}
    if (avatar) {
        ctx.drawImage(avatar, avX, avY, avSize, avSize);
    } else {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(avX, avY, avSize, avSize);
    }
    ctx.restore();

    ctx.strokeStyle = C.blue;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();

    const nameText = (displayName || username || '').length > 24 ? (displayName || username).slice(0, 24) + '…' : (displayName || username);
    ctx.font = 'bold 38px Tajawal';
    ctx.fillStyle = C.white;
    ctx.fillText(nameText, width / 2, avY + avSize + 48);

    ctx.font = '22px Tajawal';
    ctx.fillStyle = C.blueLight;
    ctx.fillText('بطاقة تفاعلك في السيرفر', width / 2, avY + avSize + 92);

    const panel1Y = avY + avSize + 138;
    drawPanel(ctx, panel1Y, width, 'المستوى في الرسائل', msgPoints, 'عدد رسائلك في السيرفر: ' + fmt(msgPoints) + ' رسالة');
    drawPanel(ctx, panel1Y + 216, width, 'المستوى في الصوت', voicePoints, 'مدة صوتك: ' + formatVoiceDuration(voicePoints));

    const footY = panel1Y + 432;
    ctx.fillStyle = 'rgba(59,130,246,0.5)';
    ctx.fillRect(50, footY, width - 100, 2);

    ctx.font = '24px Tajawal';
    ctx.fillStyle = C.muted;
    ctx.textAlign = 'center';
    ctx.fillText('إجمالي رسائلك في السيرفر', width / 2, footY + 40);

    ctx.font = 'bold 62px Tajawal';
    ctx.fillStyle = C.white;
    ctx.fillText(fmt(msgPoints), width / 2, footY + 104);

    ctx.font = '22px Tajawal';
    ctx.fillStyle = C.muted2;
    ctx.fillText('رسالة', width / 2, footY + 140);

    return canvas.toBuffer('image/png');
}

module.exports = { createLevelCard, POINTS_PER_LEVEL, MAX_LEVEL, calcLevel };