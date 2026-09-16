const mongoose = require('mongoose');

const dataSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true }
});

const Data = mongoose.model('Data', dataSchema);

class MongoQuickDB {
    constructor() {
        this.connected = false;
        this._connect();
    }

    async _connect() {
        if (this.connected) return;
        if (this.connecting) return this.connecting;

        this.connecting = (async () => {
            try {
                console.log('Attempting to connect to MongoDB...');
                await mongoose.connect(process.env.MONGO_URI, {
                    serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds
                });
                this.connected = true;
                console.log('Connected to MongoDB successfully! ✅');
            } catch (err) {
                console.error('Failed to connect to MongoDB:', err.message);
                this.connected = false;
            } finally {
                this.connecting = null;
            }
        })();

        return this.connecting;
    }

    async get(key) {
        await this._connect();
        const data = await Data.findOne({ key });
        return data ? data.value : null;
    }

    async set(key, value) {
        await this._connect();
        try {
            return await Data.findOneAndUpdate(
                { key },
                { value },
                { upsert: true, returnDocument: 'after' }
            );
        } catch (err) {
            console.error('Database Error:', err);
            throw err;
        }
    }

    async add(key, amount) {
        await this._connect();
        const current = (await this.get(key)) || 0;
        return await this.set(key, current + amount);
    }

    async sub(key, amount) {
        await this._connect();
        const current = (await this.get(key)) || 0;
        return await this.set(key, current - amount);
    }

    async delete(key) {
        await this._connect();
        return await Data.deleteOne({ key });
    }

    async deleteMany(keysArray) {
        await this._connect();
        return await Data.deleteMany({ key: { $in: keysArray } });
    }

    async all() {
        await this._connect();
        const allData = await Data.find({});
        return allData.map(d => ({ id: d.key, value: d.value }));
    }

    async push(key, value) {
        await this._connect();
        let current = (await this.get(key)) || [];
        if (!Array.isArray(current)) current = [current];
        current.push(value);
        return await this.set(key, current);
    }
}

module.exports = { QuickDB: MongoQuickDB };
