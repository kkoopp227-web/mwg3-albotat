const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const { calcLevel } = require('./levelCard');

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

const C = {
    bg1: '#0a101f',
    bg2: '#04060b',
    panel: '#111827',
    rowBg: '#0f172a',
    panelBorder: 'rgba(255,255,255,0.10)',
    white: '#ffffff',
    blue: '#3b82f6',
    blueLight: '#93c5fd',
    blueDeep: '#2563eb',
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

function fitText(ctx, text, maxW) {
    while (ctx.measureText(text).width > maxW) {
        const m = ctx.font.match(/(\d+(?:\.\d+)?)px/);
        if (!m) break;
        const size = parseFloat(m[1]);
        if (size <= 9) break;
        ctx.font = ctx.font.replace(m[1], (size - 1).toString());
    }
}

async function createLeaderboardCard({ guildName, entries, page, totalPages }) {
    const width = 700;
    const height = 1000;
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
    ctx.arc(width - 30, 110, 210, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(50, height - 40, 180, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(width / 2, height + 80, 250, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    const serverText = (guildName || '').length > 26 ? guildName.slice(0, 26) + '…' : guildName;
    ctx.font = '20px Tajawal';
    const tw = ctx.measureText(serverText).width;
    const pillW = tw + 48;
    const pillH = 46;
    const pillX = (width - pillW) / 2;
    const pillY = 46;

    ctx.fillStyle = 'rgba(59,130,246,0.14)';
    roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(59,130,246,0.55)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    ctx.stroke();
    ctx.fillStyle = C.blueLight;
    ctx.font = '20px Tajawal';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(serverText, width / 2, pillY + pillH / 2 + 2);

    ctx.font = 'bold 40px Tajawal';
    ctx.fillStyle = C.white;
    ctx.fillText('ترتيب التفاعل في السيرفر', width / 2, 170);

    ctx.font = '22px Tajawal';
    ctx.fillStyle = C.blueLight;
    ctx.fillText('صفحة ' + page + ' من ' + totalPages, width / 2, 210);

    const rowStartY = 240;
    const rowH = 64;
    const rowGap = 8;
    const x = 40;
    const rw = width - 80;

    for (let i = 0; i < 10; i++) {
        const entry = entries[i];
        const y = rowStartY + i * (rowH + rowGap);
        const cy = y + rowH / 2;
        const rank = (page - 1) * 10 + i + 1;
        const top3 = rank <= 3;

        ctx.fillStyle = top3 ? 'rgba(59,130,246,0.07)' : C.rowBg;
        roundRect(ctx, x, y, rw, rowH, 16);
        ctx.fill();
        ctx.strokeStyle = top3 ? 'rgba(59,130,246,0.55)' : C.panelBorder;
        ctx.lineWidth = 1.5;
        roundRect(ctx, x, y, rw, rowH, 16);
        ctx.stroke();

        // rank badge
        const bSize = 40;
        const bx = x + 10;
        ctx.fillStyle = top3 ? C.blueDeep : '#1e293b';
        roundRect(ctx, bx, cy - bSize / 2, bSize, bSize, 10);
        ctx.fill();
        if (!top3) {
            ctx.strokeStyle = 'rgba(255,255,255,0.14)';
            ctx.lineWidth = 1;
            roundRect(ctx, bx, cy - bSize / 2, bSize, bSize, 10);
            ctx.stroke();
        }
        ctx.font = 'bold 22px Tajawal';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(rank), bx + bSize / 2, cy + 1);

        if (entry) {
            // avatar
            const avSize = 46;
            const avCX = bx + bSize + 14 + avSize / 2;
            ctx.save();
            ctx.beginPath();
            ctx.arc(avCX, cy, avSize / 2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            let avatar = null;
            if (entry.avatarURL) {
                try {
                    avatar = await loadImage(entry.avatarURL);
                } catch (_) {}
            }
            if (avatar) {
                ctx.drawImage(avatar, avCX - avSize / 2, cy - avSize / 2, avSize, avSize);
            } else {
                ctx.fillStyle = '#334155';
                ctx.fillRect(avCX - avSize / 2, cy - avSize / 2, avSize, avSize);
            }
            ctx.restore();

            // name (middle, anchored right of avatar)
            ctx.font = 'bold 26px Tajawal';
            ctx.fillStyle = C.white;
            ctx.textAlign = 'left';
            fitText(ctx, entry.displayName || entry.username || entry.user_id, 240);
            ctx.fillText(entry.displayName || entry.username || entry.user_id, avCX + avSize / 2 + 14, cy);

            // stats (far right block)
            ctx.font = 'bold 24px Tajawal';
            ctx.fillStyle = C.blueLight;
            ctx.textAlign = 'right';
            ctx.fillText('المستوى ' + calcLevel(entry.total_points).level, x + rw - 16, cy - 8);

            ctx.font = '16px Tajawal';
            ctx.fillStyle = C.muted2;
            ctx.fillText(fmt(entry.total_points) + ' نقطة', x + rw - 16, cy + 16);
        }
    }

    return canvas.toBuffer('image/png');
}

module.exports = { createLeaderboardCard };