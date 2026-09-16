const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STORE_PATH = path.join(__dirname, '..', 'data', 'instances.json');

function mkStorePath() {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
}

function loadLocal() {
    try {
        if (fs.existsSync(STORE_PATH)) {
            const text = fs.readFileSync(STORE_PATH, 'utf8').replace(/^\uFEFF/, '');
            const arr = JSON.parse(text);
            return Array.isArray(arr) ? arr : [];
        }
    } catch (e) {
        console.error('خطأ في قراءة instances.json:', e.message);
    }
    return [];
}

function saveLocal(arr) {
    try {
        mkStorePath();
        fs.writeFileSync(STORE_PATH, JSON.stringify(arr, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('خطأ في حفظ instances.json:', e.message);
        return false;
    }
}

let mongoCol = null;

async function connectMongo(uri) {
    if (!uri) return;
    try {
        const { MongoClient } = require('mongodb');
        const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
        await client.connect();
        mongoCol = client.db('bot_platform').collection('instances');
        console.log('✅ مسجل البوتات متصل بـ MongoDB');
    } catch (e) {
        console.error('❌ فشل الاتصال بـ MongoDB، سأعمل بالملف المحلي:', e.message);
        mongoCol = null;
    }
}

async function loadAll() {
    if (mongoCol) {
        try {
            const arr = await mongoCol.find({}).toArray();
            if (arr.length) return arr.map((d) => { const { _id, ...rest } = d; return rest; });
        } catch (e) { console.error('خطأ في تحميل من MongoDB:', e.message); }
    }
    return loadLocal();
}

async function saveAll(arr) {
    if (mongoCol) {
        try {
            await mongoCol.deleteMany({});
            await mongoCol.insertMany(arr.map((d) => ({ ...d, _id: d.id })));
            return;
        } catch (e) { console.error('خطأ في حفظ إلى MongoDB:', e.message); }
    }
    saveLocal(arr);
}

function newId() {
    return crypto.randomBytes(5).toString('hex');
}

function maskToken(token) {
    if (!token) return '';
    if (token.length <= 10) return '***';
    return token.slice(0, 6) + '…' + token.slice(-4);
}

module.exports = {
    connectMongo,
    loadAll,
    saveAll,
    newId,
    maskToken,
    STORE_PATH,
};