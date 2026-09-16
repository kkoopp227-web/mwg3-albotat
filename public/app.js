const $ = (sel) => document.querySelector(sel);

let TYPES = [];
let BOTS = [];
let pollTimer = null;

function getAdminKey() {
    return localStorage.getItem('adminKey') || '';
}

function setAdminKey(k) {
    localStorage.setItem('adminKey', k || '');
}

async function api(path, opts = {}) {
    const key = getAdminKey();
    const res = await fetch(path, {
        headers: {
            'Content-Type': 'application/json',
            ...(key ? { 'x-admin-key': key } : {}),
        },
        ...opts,
    });
    if (res.status === 401) {
        const input = prompt('اللوحة محمية بكلمة سر. أدخلها للاستمرار:');
        if (input !== null) {
            setAdminKey(input.trim());
            return api(path, opts);
        }
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok && !data.ok) throw new Error(data.error || `خطأ ${res.status}`);
    return data;
}

function toast(msg) {
    const el = $('#msgToast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2500);
}

function maskToken(t) {
    if (!t) return '';
    if (t.length <= 10) return '***';
    return t.slice(0, 6) + '…' + t.slice(-4);
}

function typeOf(id) {
    return TYPES.find((t) => t.id === id) || { id, label: id, icon: '❔', color: '#888' };
}

function renderTypes() {
    const sec = $('#typesSection');
    sec.innerHTML = '';
    for (const t of TYPES) {
        const count = BOTS.filter((b) => b.type === t.id).length;
        const card = document.createElement('div');
        card.className = 'type-card';
        card.innerHTML = `
            <div class="t-icon">${t.icon}</div>
            <div class="t-name" style="color:${t.color}">${t.label}</div>
            <div class="t-desc">${t.description}</div>
            <div class="t-count">${count} بوت مسجل</div>`;
        card.addEventListener('click', () => openNewBot(t.id));
        sec.appendChild(card);
    }
}

function renderBots() {
    const grid = $('#botGrid');
    grid.innerHTML = '';
    $('#emptyState').style.display = BOTS.length ? 'none' : 'block';

    for (const b of BOTS) {
        const t = typeOf(b.type);
        const cfg = b.config || {};
        const card = document.createElement('div');
        card.className = 'bot-card';

        const metaLines = [];
        if (t.id === 'music') {
            metaLines.push(`اختصار: <span dir="ltr">${cfg.label ? '#' + String(cfg.label).replace(/^#/, '') : '-'}</span>`);
            metaLines.push(`روم: <span dir="ltr">${cfg.roomId || '-'}</span>`);
            metaLines.push(`رول: <span dir="ltr">${cfg.allowedRoleId || 'افتراضي'}</span>`);
            metaLines.push(`ير 24/7: ${cfg.stay247 === false ? 'لا' : 'نعم'}`);
        } else if (t.id === 'ticket') {
            metaLines.push(`سيرفر: <span dir="ltr">${cfg.guildId || '-'}</span>`);
            metaLines.push(`لوحة: <span dir="ltr">${cfg.panelChannelId || '-'}</span>`);
        } else if (t.id === 'server') {
            metaLines.push(`سيرفر: <span dir="ltr">${cfg.guildId || '-'}</span>`);
            metaLines.push(`قناة أوامر: <span dir="ltr">${cfg.commandChannel || '-'}</span>`);
        } else if (t.id === 'bank') {
            metaLines.push(`سيرفر: <span dir="ltr">${cfg.guildId || '-'}</span>`);
            metaLines.push(`قناة أوامر: <span dir="ltr">${cfg.channelId || '-'}</span>`);
        }

        card.innerHTML = `
            <div class="b-head">
                <div class="b-name">
                    <span class="t">${t.icon}</span>
                    <span class="nm" title="${b.name}">${b.name}</span>
                </div>
                <span class="badge ${b.enabled ? 'running' : 'stopped'}">${b.enabled ? 'مفعّل' : 'متوقف'}</span>
            </div>
            <div class="b-meta">${metaLines.join('<br>')}<br>توكن: <span class="tok">${maskToken(cfg.token)}</span></div>
            <div class="b-actions">
                <button class="btn success small" data-act="enable" data-id="${b.id}">تشغيل</button>
                <button class="btn small" data-act="disable" data-id="${b.id}">إيقاف</button>
                <button class="btn small" data-act="edit" data-id="${b.id}">تعديل</button>
                <button class="btn small" data-act="logs" data-id="${b.id}">سجل</button>
                <button class="btn danger small" data-act="del" data-id="${b.id}">حذف</button>
            </div>`;
        grid.appendChild(card);
    }

    grid.querySelectorAll('[data-act]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const act = btn.dataset.act;
            const id = btn.dataset.id;
            try {
                if (act === 'enable') {
                    await api(`/api/bots/${id}/enable`, { method: 'POST' });
                    toast('تم تشغيل البوت ✅');
                    await refresh();
                } else if (act === 'disable') {
                    await api(`/api/bots/${id}/disable`, { method: 'POST' });
                    toast('تم إيقاف البوت ⏸️');
                    await refresh();
                } else if (act === 'edit') {
                    openEditBot(id);
                } else if (act === 'logs') {
                    openLogs(id);
                } else if (act === 'del') {
                    if (!confirm('متأكد من حذف هذا البوت؟')) return;
                    await api(`/api/bots/${id}`, { method: 'DELETE' });
                    toast('تم الحذف');
                    await refresh();
                }
            } catch (err) {
                toast(err.message);
            }
        });
    });
}

function renderHeaderStats() {
    const el = $('#headerStats');
    el.innerHTML = '';
    for (const t of TYPES) {
        const count = BOTS.filter((b) => b.type === t.id && b.enabled).length;
        const pill = document.createElement('div');
        pill.className = 'stat-pill';
        pill.innerHTML = `<span class="dot ${count ? 'on' : 'off'}"></span>${t.icon} ${t.label}: ${count}`;
        el.appendChild(pill);
    }
}

function openNewBot(typeId) {
    const t = typeOf(typeId);
    selectedTypeId = typeId;
    $('#modalTitle').textContent = `بوت جديد — ${t.label} ${t.icon}`;
    const defaults = { stay247: true };
    if (typeId === 'music') {
        const existing = BOTS.filter((b) => b.type === 'music').map((b) => String(b.config?.label || '').replace(/^#/, '').trim());
        let n = 1;
        while (existing.includes(String(n))) n++;
        defaults.label = String(n);
    }
    $('#modalBody').innerHTML = buildForm(t, defaults);
    openModal();
}

function openEditBot(id) {
    const b = BOTS.find((x) => x.id === id);
    if (!b) return;
    const t = typeOf(b.type);
    $('#modalTitle').textContent = `تعديل — ${b.name}`;
    $('#modalBody').innerHTML = buildForm(t, b.config, b.id);
    openModal();
}

function buildForm(t, cfg = {}, botId = null) {
    const rows = t.fields
        .map((f) => {
            const val = cfg[f.key] !== undefined ? cfg[f.key] : f.default;
            let input = '';
            if (f.type === 'boolean') {
                const checked = val ? 'checked' : '';
                input = `<input type="checkbox" id="f_${f.key}" ${checked}>`;
            } else if (f.type === 'token') {
                const shown = val ? maskToken(val) : '';
                input = `<input type="text" id="f_${f.key}" placeholder="توكن يبدأ بـ MTU..." value="${shown}" autocomplete="off">`;
            } else {
                input = `<input type="text" id="f_${f.key}" value="${(val || '').toString().replace(/"/g, '&quot;')}" placeholder="${f.label}">`;
            }
            const req = f.required ? ' *' : '';
            const hint = f.hint ? `<div class="hint">${f.hint}</div>` : '';
            return `<div class="form-field"><label>${f.label}${req}</label>${input}${hint}</div>`;
        })
        .join('');

    const botIdField = botId ? `<input type="hidden" id="f_botId" value="${botId}">` : '';

    return `
        <div class="form-field"><label>الاسم المميز للبوت *</label>
            <input type="text" id="f_name" value="${botId ? (BOTS.find((x) => x.id === botId)?.name || '') : ''}" placeholder="مثال: أغاني السيرفر 1" style="direction:rtl;text-align:right">
        </div>
        ${rows}
        ${botIdField}
        <div class="form-tools">
            <button class="btn ghost" onclick="closeModal()">إلغاء</button>
            <button class="btn primary" id="saveBtn">حفظ وتشغيل</button>
        </div>`;
}

async function submitForm() {
    const botId = $('#f_botId')?.value;
    const name = $('#f_name').value.trim();
    const t = TYPES.find((x) => x.id === (botId ? BOTS.find((b) => b.id === botId)?.type : selectedTypeId));
    if (!name) { toast('اكتب اسم البوت'); return; }

    const cfg = {};
    for (const f of t.fields) {
        const el = $(`#f_${f.key}`);
        if (!el) continue;
        if (f.type === 'boolean') cfg[f.key] = el.checked;
        else if (f.type === 'token') {
            const raw = el.value.trim();
            const isReal = raw.startsWith('MTU') || raw.startsWith('mfa');
            const isMasked = raw.includes('…') || (!isReal && botId);
            if (isReal && !isMasked) {
                cfg[f.key] = raw;
            }
        } else cfg[f.key] = el.value.trim();
    }

    try {
        if (botId) {
            await api(`/api/bots/${botId}`, { method: 'PUT', body: JSON.stringify({ name, config: cfg }) });
            toast('تم الحفظ والتشغيل ✅');
        } else {
            await api('/api/bots', { method: 'POST', body: JSON.stringify({ type: selectedTypeId, name, config: cfg }) });
            toast('تم إنشاء البوت وتشغيله ✅');
        }
        closeModal();
        await refresh();
    } catch (err) {
        toast(err.message);
    }
}

let selectedTypeId = null;

function setSelectedType(id) {
    selectedTypeId = id;
}

function openModal() {
    $('#modalBackdrop').classList.remove('hidden');
    $('#saveBtn').addEventListener('click', submitForm);
}

function closeModal() {
    $('#modalBackdrop').classList.add('hidden');
}

async function openLogs(id) {
    const b = BOTS.find((x) => x.id === id);
    if (!b) return;
    const t = typeOf(b.type);
    $('#logView').textContent = 'جار تحميل السجل...';
    $('#logsModal').classList.remove('hidden');
    $('#logsClose').addEventListener('click', () => $('#logsModal').classList.add('hidden'));

    const res = await api(`/api/logs/${b.type}`);
    const lines = res.logs || [];
    const el = $('#logView');
    el.textContent = lines.join('\n') || 'لا توجد سجلات بعد.';
    const errRe = /error|فشل|❌|خطأ/i;
    el.innerHTML = lines
        .map((l) => {
            let cls = '';
            if (errRe.test(l)) cls = 'err';
            else if (l.includes('✅') || l.includes('ناجح')) cls = 'ok';
            else if (l.includes('⚠️') || l.includes('تحذير')) cls = 'warn';
            return `<span class="${cls}">${escapeHtml(l)}</span>`;
        })
        .join('\n') || 'لا توجد سجلات بعد.';
}

function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function refresh() {
    try {
        const [typeRes, botRes] = await Promise.all([api('/api/types'), api('/api/bots')]);
        TYPES = typeRes.types;
        BOTS = botRes.bots;
        renderTypes();
        renderBots();
        renderHeaderStats();
    } catch (err) {
        toast(err.message);
    }
}

$('#newBotBtn').addEventListener('click', () => {
    if (TYPES.length) openNewBot(TYPES[0].id);
});

$('#modalClose').addEventListener('click', closeModal);
$('#modalBackdrop').addEventListener('click', (e) => {
    if (e.target === $('#modalBackdrop')) closeModal();
});
$('#logsModal').addEventListener('click', (e) => {
    if (e.target === $('#logsModal')) $('#logsModal').classList.add('hidden');
});

window.openModal = openModal;
window.closeModal = closeModal;
window.setSelectedType = setSelectedType;

refresh();
setInterval(refresh, 8000);