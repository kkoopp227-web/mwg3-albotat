const mongoose = require('mongoose');

// Connect to MongoDB
if (!process.env.MONGO_URI) {
    console.error('Error: MONGO_URI is not set in environment variables!');
} else {
    mongoose.connect(process.env.MONGO_URI).then(() => {
        console.log('Connected to MongoDB database.');
    }).catch((err) => {
        console.error('Error connecting to MongoDB:', err.message);
    });
}

// Define Schemas and Models
const SeparatorSchema = new mongoose.Schema({
    channel_id: { type: String, required: true, unique: true },
    separator_url: String,
    last_message_id: String
});

const ReactionSchema = new mongoose.Schema({
    channel_id: { type: String, required: true, unique: true },
    emoji: String
});

const AutoDeleteSchema = new mongoose.Schema({
    channel_id: { type: String, required: true, unique: true },
    duration_minutes: { type: Number, required: true }
});

const Separator = mongoose.model('Separator', SeparatorSchema);
const Reaction = mongoose.model('Reaction', ReactionSchema);
const AutoDelete = mongoose.model('AutoDelete', AutoDeleteSchema);

const LevelSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    guild_id: String,
    user_id: String,
    msg_points: { type: Number, default: 0 },
    msg_count: { type: Number, default: 0 },
    voice_points: { type: Number, default: 0 },
    voice_minutes: { type: Number, default: 0 },
    total_points: { type: Number, default: 0 },
    week_key: String,
    week_msg_count: { type: Number, default: 0 },
    week_voice_points: { type: Number, default: 0 },
    week_voice_minutes: { type: Number, default: 0 },
    updated_at: { type: Date, default: Date.now }
});
const Level = mongoose.model('Level', LevelSchema);

const GrantPermSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, default: 'default' },
    role_ids: [String]
});
const GrantPerm = mongoose.model('GrantPerm', GrantPermSchema);

const ColorRolesSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, default: 'default' },
    role_ids: [String],
    channel_id: String
});
const ColorRoles = mongoose.model('ColorRoles', ColorRolesSchema);

const RoomSchema = new mongoose.Schema({
    channel_id: { type: String, required: true, unique: true },
    owner_id: { type: String, required: true },
    panel_message_id: String,
    created_at: { type: Date, default: Date.now }
});
const Room = mongoose.model('Room', RoomSchema);

// Helper functions for Separators
async function getSeparator(channelId) {
    return await Separator.findOne({ channel_id: channelId });
}

async function setSeparator(channelId, separatorUrl) {
    await Separator.findOneAndUpdate(
        { channel_id: channelId },
        { separator_url: separatorUrl },
        { upsert: true, new: true }
    );
}

async function removeSeparator(channelId) {
    await Separator.deleteOne({ channel_id: channelId });
}

async function setLastSeparatorMessage(channelId, messageId) {
    await Separator.updateOne(
        { channel_id: channelId },
        { last_message_id: messageId }
    );
}

// Helper functions for Reactions
async function getReaction(channelId) {
    return await Reaction.findOne({ channel_id: channelId });
}

async function setReaction(channelId, emoji) {
    await Reaction.findOneAndUpdate(
        { channel_id: channelId },
        { emoji: emoji },
        { upsert: true, new: true }
    );
}

async function removeReaction(channelId) {
    await Reaction.deleteOne({ channel_id: channelId });
}

// Helper functions for Auto Delete
async function getAutoDelete(channelId) {
    return await AutoDelete.findOne({ channel_id: channelId });
}

async function getAllAutoDeletes() {
    return await AutoDelete.find({});
}

async function setAutoDelete(channelId, durationMinutes) {
    await AutoDelete.findOneAndUpdate(
        { channel_id: channelId },
        { duration_minutes: durationMinutes },
        { upsert: true, new: true }
    );
}

async function removeAutoDelete(channelId) {
    await AutoDelete.deleteOne({ channel_id: channelId });
}

// Helper functions for Grant Permissions
async function getGrantRoles() {
    const doc = await GrantPerm.findOne({ key: 'default' });
    return doc ? doc.role_ids : [];
}

async function setGrantRoles(roleIds) {
    await GrantPerm.findOneAndUpdate(
        { key: 'default' },
        { role_ids: roleIds },
        { upsert: true, new: true }
    );
}

// Helper functions for Color Roles
async function getColorRoles() {
    return await ColorRoles.findOne({ key: 'default' });
}

async function setColorRoles(roleIds, channelId) {
    await ColorRoles.findOneAndUpdate(
        { key: 'default' },
        { role_ids: roleIds, channel_id: channelId },
        { upsert: true, new: true }
    );
}

// Helper functions for temporary Rooms
async function getRoom(channelId) {
    return await Room.findOne({ channel_id: channelId });
}

async function getAllRooms() {
    return await Room.find({});
}

async function setRoom(channelId, ownerId, panelMessageId) {
    await Room.findOneAndUpdate(
        { channel_id: channelId },
        { owner_id: ownerId, panel_message_id: panelMessageId },
        { upsert: true, new: true }
    );
}

async function removeRoom(channelId) {
    await Room.deleteOne({ channel_id: channelId });
}

// Helper functions for Level system
function weekKeyNow() {
    const d = new Date();
    const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
    return `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;
}

async function bumpLevelMessage(guildId, userId, amount) {
    const wk = weekKeyNow();
    await Level.findOneAndUpdate(
        { key: `${guildId}:${userId}` },
        [{
            $set: {
                msg_points: { $add: [{ $ifNull: ['$msg_points', 0] }, amount || 1] },
                msg_count: { $add: [{ $ifNull: ['$msg_count', 0] }, 1] },
                total_points: { $add: [{ $ifNull: ['$total_points', 0] }, amount || 1] },
                week_msg_count: {
                    $cond: [{ $eq: ['$week_key', wk] }, { $add: [{ $ifNull: ['$week_msg_count', 0] }, 1] }, 1]
                },
                week_key: wk,
                guild_id: guildId,
                user_id: userId,
                updated_at: new Date()
            }
        }],
        { upsert: true, new: true }
    );
}

async function bumpLevelVoice(guildId, userId, amount) {
    const wk = weekKeyNow();
    await Level.findOneAndUpdate(
        { key: `${guildId}:${userId}` },
        [{
            $set: {
                voice_minutes: { $add: [{ $ifNull: ['$voice_minutes', 0] }, 1] },
                voice_points: { $add: [{ $ifNull: ['$voice_points', 0] }, amount || 1] },
                total_points: { $add: [{ $ifNull: ['$total_points', 0] }, amount || 1] },
                week_voice_minutes: {
                    $cond: [{ $eq: ['$week_key', wk] }, { $add: [{ $ifNull: ['$week_voice_minutes', 0] }, 1] }, 1]
                },
                week_voice_points: {
                    $cond: [{ $eq: ['$week_key', wk] }, { $add: [{ $ifNull: ['$week_voice_points', 0] }, amount || 1] }, amount || 1]
                },
                week_key: wk,
                guild_id: guildId,
                user_id: userId,
                updated_at: new Date()
            }
        }],
        { upsert: true, new: true }
    );
}

async function getLevelStats(guildId, userId) {
    const doc = await Level.findOne({ key: `${guildId}:${userId}` });
    return doc
        ? {
            msg_points: doc.msg_points || 0,
            msg_count: doc.msg_count || 0,
            voice_points: doc.voice_points || 0,
            voice_minutes: doc.voice_minutes || 0,
            week_msg_count: doc.week_msg_count || 0,
            week_voice_points: doc.week_voice_points || 0,
            week_voice_minutes: doc.week_voice_minutes || 0,
            updated_at: doc.updated_at
        }
        : {
            msg_points: 0,
            msg_count: 0,
            voice_points: 0,
            voice_minutes: 0,
            week_msg_count: 0,
            week_voice_points: 0,
            week_voice_minutes: 0,
            updated_at: null
        };
}

async function getLevelCount(guildId) {
    return await Level.countDocuments({ guild_id: guildId, total_points: { $gt: 0 } });
}

async function getTopLevels(guildId, page) {
    const limit = 10;
    const skip = Math.max(0, (page - 1) * limit);
    const docs = await Level.find({ guild_id: guildId, total_points: { $gt: 0 } })
        .sort({ total_points: -1, msg_count: -1 })
        .skip(skip)
        .limit(limit);
    return docs.map(d => ({
        user_id: d.user_id,
        msg_points: d.msg_points || 0,
        voice_points: d.voice_points || 0,
        total_points: d.total_points || 0,
        level: Math.min(150, Math.floor((d.total_points || 0) / 5000))
    }));
}

async function getLevelRank(guildId, userId) {
    const doc = await Level.findOne({ key: `${guildId}:${userId}` });
    if (!doc || !(doc.total_points > 0)) return null;
    const above = await Level.countDocuments({ guild_id: guildId, total_points: { $gt: doc.total_points } });
    const tie = await Level.countDocuments({ guild_id: guildId, total_points: doc.total_points, msg_count: { $gt: doc.msg_count || 0 } });
    return above + tie + 1;
}

module.exports = {
    getSeparator,
    setSeparator,
    removeSeparator,
    setLastSeparatorMessage,
    getReaction,
    setReaction,
    removeReaction,
    getAutoDelete,
    getAllAutoDeletes,
    setAutoDelete,
    removeAutoDelete,
    getGrantRoles,
    setGrantRoles,
    getColorRoles,
    setColorRoles,
    getRoom,
    getAllRooms,
    setRoom,
    removeRoom,
    bumpLevelMessage,
    bumpLevelVoice,
    getLevelStats,
    getLevelCount,
    getTopLevels,
    getLevelRank
};
