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

    ctx.font = 'bold 38px Tajawal';
    ctx.fillStyle = C.white;
    ctx.fillText('ترتيب التفاعل في السيرفر', width / 2, 148);

    ctx.font = '17px Tajawal';
    ctx.fillStyle = C.blueLight;
    ctx.textAlign = 'right';
    ctx.fillText('صفحة ' + page + ' من ' + totalPages, width - 44, 72);
    ctx.textAlign = 'center';

    const isPage1 = page === 1;
    let rowStartY = 236;
    let listEntries = entries;
    if (isPage1) {
        await drawPodium(ctx, entries.slice(0, 3), width);
        listEntries = entries.slice(3);
        rowStartY = 438;
    }

    const rowH = 62;
    const rowGap = 8;
    const x = 40;
    const rw = width - 80;
    const listBaseRank = isPage1 ? 3 : 0;

    for (let i = 0; i < listEntries.length; i++) {
        const entry = listEntries[i];
        const y = rowStartY + i * (rowH + rowGap);
        const cy = y + rowH / 2;
        const rank = (page - 1) * 10 + listBaseRank + i + 1;
        const top4 = rank === 4;

        ctx.fillStyle = top4 ? 'rgba(59,130,246,0.07)' : C.rowBg;
        roundRect(ctx, x, y, rw, rowH, 16);
        ctx.fill();
        ctx.strokeStyle = top4 ? 'rgba(59,130,246,0.55)' : C.panelBorder;
        ctx.lineWidth = 1.5;
        roundRect(ctx, x, y, rw, rowH, 16);
        ctx.stroke();

        // rank badge
        const bSize = 40;
        const bx = x + 10;
        ctx.fillStyle = top4 ? C.blueDeep : '#1e293b';
        roundRect(ctx, bx, cy - bSize / 2, bSize, bSize, 10);
        ctx.fill();
        if (!top4) {
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

    return canvas.toBuffer('image/png');
}

const PODIUM_BASE = 408;
const POD_ITEMS = [
    { rank: '#1', dx: 0, w: 116, h: 128, avSize: 100, nameSize: 18, highlight: true },
    { rank: '#2', dx: 132, w: 94, h: 90, avSize: 86, nameSize: 17, highlight: false },
    { rank: '#3', dx: -132, w: 94, h: 90, avSize: 86, nameSize: 17, highlight: false },
];

async function drawPodium(ctx, pod, width) {
    const cx = width / 2;
    for (const it of POD_ITEMS) {
        const px = cx + it.dx;
        const top = PODIUM_BASE - it.h;
        if (it.dx === 0) continue; // draw order: 2nd and 3rd pedestals first, 1st last
        ctx.fillStyle = '#131f37';
        roundRect(ctx, px - it.w / 2, top, it.w, PODIUM_BASE - top, 10);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 1.5;
        roundRect(ctx, px - it.w / 2, top, it.w, PODIUM_BASE - top, 10);
        ctx.stroke();
        ctx.fillStyle = '#1b2b4a';
        roundRect(ctx, px - it.w / 2 + 6, top, it.w - 12, 12, 6);
        ctx.fill();
    }

    for (const it of POD_ITEMS.slice(1)) {
        const p = pod.find((e, idx) => idx === POD_ITEMS.indexOf(it));
        await drawPodiumAvatar(ctx, cx + it.dx, PODIUM_BASE - it.h, it, p);
    }
    const firstItem = POD_ITEMS[0];
    const idx0 = 0;
    await drawPodiumAvatar(ctx, cx + firstItem.dx, PODIUM_BASE - firstItem.h, firstItem, pod[idx0]);

    return;
}

async function drawPodiumAvatar(ctx, px, top, it, entry) {
    const cy = top - it.avSize / 2;

    // avatar
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, cy, it.avSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    let avatar = null;
    if (entry && entry.avatarURL) {
        try {
            avatar = await loadImage(entry.avatarURL);
        } catch (_) {}
    }
    if (avatar) {
        ctx.drawImage(avatar, px - it.avSize / 2, cy - it.avSize / 2, it.avSize, it.avSize);
    } else {
        ctx.fillStyle = '#334155';
        ctx.fillRect(px - it.avSize / 2, cy - it.avSize / 2, it.avSize, it.avSize);
    }
    ctx.restore();

    ctx.strokeStyle = it.highlight ? C.blue : 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(px, cy, it.avSize / 2, 0, Math.PI * 2);
    ctx.stroke();

    // rank medal badge
    const bR = 17;
    const bcx = px;
    const bcy = cy - it.avSize / 2 + 4;
    ctx.fillStyle = it.highlight ? C.blueDeep : '#1e293b';
    ctx.beginPath();
    ctx.arc(bcx, bcy, bR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = it.highlight ? 'rgba(255,255,255,0.85)' : C.blue;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bcx, bcy, bR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = 'bold 15px Tajawal';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(it.rank, bcx, bcy + 1);
    ctx.textBaseline = 'alphabetic';

    // name on pedestal face
    if (entry) {
        ctx.font = 'bold ' + it.nameSize + 'px Tajawal';
        ctx.fillStyle = C.blueLight;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const name = entry.displayName || entry.username || entry.user_id;
        fitText(ctx, name, it.w - 12);
        ctx.fillText(name, px, top + it.h - 24);
    }
}

module.exports = { createLeaderboardCard };