const TYPES = {
    music: {
        id: 'music',
        label: 'بوت الأغاني',
        icon: '🎵',
        color: '#57F287',
        description: 'بوت أغاني يعيش في روم صوتي، يسمع لأمورك بالاسم المخصص.',
        fields: [
            { key: 'label', label: 'اختصار الاستدعاء (مثل #1)', type: 'text', required: false, hint: 'مثال: #1 — يكتبه الميبر بالشات عشان يدخل البوت رومه. يُرقّم تلقائياً.' },
            { key: 'token', label: 'توكن البوت', type: 'token', required: true },
            { key: 'roomId', label: 'ايدي الروم الصوتي', type: 'text', required: true },
            { key: 'stay247', label: 'البقاء في الروم 24/7', type: 'boolean', default: true },
            { key: 'allowedRoleId', label: 'ايدي الرول المسموح له الأوامر', type: 'text', required: false },
            { key: 'guildId', label: 'ايدي السيرفر (اختياري)', type: 'text', required: false },
        ],
    },
    ticket: {
        id: 'ticket',
        label: 'بوت التذاكر',
        icon: '🎫',
        color: '#5865F2',
        description: 'نظام تذاكر احترافي: لوحة، أقسام, رولات استلام, إحصائيات وتوب.',
        fields: [
            { key: 'token', label: 'توكن البوت', type: 'token', required: true },
            { key: 'guildId', label: 'ايدي السيرفر', type: 'text', required: true },
            { key: 'mongoUri', label: 'رابط MongoDB (اختياري)', type: 'text', required: false },
            { key: 'adminRoleId', label: 'ايدي رول الأدمين', type: 'text', required: false },
            { key: 'supportRoles', label: 'ايدي رولات الدعم (مفصولة بفاصلة)', type: 'text', required: false },
            { key: 'panelChannelId', label: 'ايدي قناة اللوحة', type: 'text', required: false },
            { key: 'logsChannelId', label: 'ايدي قناة الستينق اللوقات', type: 'text', required: false },
            { key: 'receiveChannelId', label: 'ايدي قناة الاستلام', type: 'text', required: false },
            { key: 'categoryId', label: 'ايدي الكاتقوري', type: 'text', required: false },
        ],
    },
    server: {
        id: 'server',
        label: 'بوت أوامر السيرفر',
        icon: '🛡️',
        color: '#FEE75C',
        description: 'ترحيب، رول تلقائي، رول ترقية، لوق الدخول والخروج، ستينقز كاملة.',
        fields: [
            { key: 'token', label: 'توكن البوت', type: 'token', required: true },
            { key: 'clientId', label: 'ايدي البوت (Client ID)', type: 'text', required: true },
            { key: 'guildId', label: 'ايدي السيرفر', type: 'text', required: true },
            { key: 'commandChannel', label: 'ايدي قناة الأوامر', type: 'text', required: false },
            { key: 'allowedRole', label: 'ايدي الرول المسموح له الأوامر', type: 'text', required: false },
            { key: 'mongoUri', label: 'رابط MongoDB (اختياري)', type: 'text', required: false },
            { key: 'welcomeChannel', label: 'ايدي قناة الترحيب', type: 'text', required: false },
            { key: 'boostChannel', label: 'ايدي قناة الترقية', type: 'text', required: false },
            { key: 'logChannel', label: 'ايدي قناة اللوق', type: 'text', required: false },
            { key: 'autoRole', label: 'ايدي الرول التلقائي', type: 'text', required: false },
            { key: 'boostRole', label: 'ايدي رول الترقية', type: 'text', required: false },
        ],
    },
    bank: {
        id: 'bank',
        label: 'بوت البنك',
        icon: '🏦',
        color: '#FAA61A',
        description: 'بنك فلات: راتب، تحويل، قمار، نهب، زواج، تداول، مواسم وأكثر.',
        fields: [
            { key: 'token', label: 'توكن البوت', type: 'token', required: true },
            { key: 'guildId', label: 'ايدي السيرفر', type: 'text', required: false },
            { key: 'channelId', label: 'ايدي قناة الأوامر (اختياري)', type: 'text', required: false },
            { key: 'adminRoleId', label: 'ايدي رول الأدمين', type: 'text', required: false },
            { key: 'logChannelId', label: 'ايدي قناة اللوقات (اختياري)', type: 'text', required: false },
            { key: 'vipRoleId', label: 'ايدي رول الـ VIP (اختياري)', type: 'text', required: false },
            { key: 'mongoUri', label: 'رابط MongoDB', type: 'text', required: false },
            { key: 'prefix', label: 'البريفكس (افتراضي: بدون)', type: 'text', required: false },
        ],
    },
    separator: {
        id: 'separator',
        label: 'بوت الفواصل',
        icon: '🧱',
        color: '#EB459E',
        description: 'فواصل شاتات، رومات مؤقتة، ردود تلقائية، حذف تلقائي، رولات صور/لايف وألوان.',
        fields: [
            { key: 'token', label: 'توكن البوت', type: 'token', required: true },
            { key: 'guildId', label: 'ايدي السيرفر', type: 'text', required: true },
            { key: 'adminChannelId', label: 'ايدي قناة الأدمن', type: 'text', required: true },
            { key: 'adminRoleId', label: 'ايدي رول الأدمن', type: 'text', required: true },
            { key: 'mongoUri', label: 'رابط MongoDB', type: 'text', required: false },
            { key: 'prefix', label: 'البريفكس (افتراضي: -)', type: 'text', required: false },
        ],
    },
};

function getTypes() {
    return Object.values(TYPES).map((t) => ({ id: t.id, label: t.label, icon: t.icon, color: t.color, description: t.description, fields: t.fields }));
}

function getType(id) {
    return TYPES[id] || null;
}

module.exports = { TYPES, getTypes, getType };