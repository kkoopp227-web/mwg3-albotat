const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data.json');
const DOC_ID = 'config';

const defaults = {
  adminRoleId: null,
  supportRoles: [],
  logsChannelId: null,
  receiveChannelId: null,
  panelChannelId: null,
  categoryId: null,
  panelImage: null,
  panelTitle: '🎫 فواتح تذكرة',
  panelDescription:
    'أهلاً بك 👋\nاختر القسم المناسب من القائمة بالأسفل وسيتم فتح تذكرة خاصة بك وسيقوم فريق الدعم بمساعدتك.',
  ticketOptions: [],
  pendingRequests: {},
  pendingNewOptions: {},
  topRoles: [],
  topChannels: [],
  topPoints: {},
};

// البيئة تكمل فقط الناقص (ما تغير القيم المحفوظة)
function applyEnvOverrides(base) {
  const d = { ...base };
  const csv = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

  if (process.env.PANEL_CHANNEL_ID && !d.panelChannelId) d.panelChannelId = process.env.PANEL_CHANNEL_ID.trim();
  if (process.env.RECEIVE_CHANNEL_ID && !d.receiveChannelId) d.receiveChannelId = process.env.RECEIVE_CHANNEL_ID.trim();
  if (process.env.LOGS_CHANNEL_ID && !d.logsChannelId) d.logsChannelId = process.env.LOGS_CHANNEL_ID.trim();
  if (process.env.CATEGORY_ID && !d.categoryId) d.categoryId = process.env.CATEGORY_ID.trim();
  if (process.env.PANEL_IMAGE && !d.panelImage) d.panelImage = process.env.PANEL_IMAGE.trim();
  if (process.env.PANEL_TITLE && !d.panelTitle) d.panelTitle = process.env.PANEL_TITLE.trim();
  if (process.env.PANEL_DESCRIPTION && !d.panelDescription) d.panelDescription = process.env.PANEL_DESCRIPTION.trim();
  if (process.env.ADMIN_ROLE_ID && !d.adminRoleId) d.adminRoleId = process.env.ADMIN_ROLE_ID.trim();
  if (process.env.SUPPORT_ROLES && !d.supportRoles.length) d.supportRoles = csv(process.env.SUPPORT_ROLES);
  if (process.env.TOP_ROLES && !d.topRoles.length) d.topRoles = csv(process.env.TOP_ROLES);
  if (process.env.TOP_CHANNELS && !d.topChannels.length) d.topChannels = csv(process.env.TOP_CHANNELS);
  return d;
}

function readLocal() {
  try {
    if (fs.existsSync(FILE)) {
      const text = fs.readFileSync(FILE, 'utf8').replace(/^\uFEFF/, '');
      return JSON.parse(text);
    }
  } catch (err) {
    console.error('خطأ في قراءة data.json:', err.message);
  }
  return {};
}

function writeLocal(d) {
  try {
    fs.writeFileSync(FILE, JSON.stringify(d, null, 2), 'utf8');
  } catch (err) {
    console.error('خطأ في حفظ data.json:', err.message);
  }
}

let data = applyEnvOverrides({ ...defaults, ...readLocal() });
let save = () => writeLocal(data);

let mongoCol = null;

async function init() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('📦 وضع الملف المحلي (data.json) — بدون MongoDB');
    return;
  }
  try {
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
    await client.connect();
    const dbName = process.env.MONGODB_DB || 'ticket_bot';
    mongoCol = client.db(dbName).collection('data');
    const doc = await mongoCol.findOne({ _id: DOC_ID });
    const stored = doc && doc.data ? doc.data : {};
    data = applyEnvOverrides({ ...defaults, ...stored });
    save = () =>
      mongoCol
        .updateOne({ _id: DOC_ID }, { $set: { data } }, { upsert: true })
        .catch((e) => console.error('خطأ في حفظ MongoDB:', e.message));
    console.log(
      `✅ متصل بـ MongoDB (قاعدة ${dbName}) — البيانات ${
        doc ? 'محملة من القاعدة' : 'افتراضية (أول مرة)'
      }`
    );
  } catch (err) {
    console.error('❌ فشل الاتصال بـ MongoDB، سأعمل بالوضع المحلي:', err.message);
    data = applyEnvOverrides({ ...defaults, ...readLocal() });
    save = () => writeLocal(data);
  }
}

module.exports = { defaults, data, save, init, readLocal, writeLocal };