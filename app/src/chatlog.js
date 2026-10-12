import { MongoClient } from 'mongodb';

const DAY_S = 24 * 60 * 60;
const noop = { write() {}, async close() {} };

// Chat logs live in MongoDB (collection `chat_logs`). A TTL index on `time`
// makes MongoDB delete entries older than `retentionDays` by itself. No IPs
// are stored: only the anonymous session id, question, answer and source.
// Logging must never break chat, so every failure is swallowed (and printed).
export function createChatLog(collection) {
  return {
    write(entry) {
      collection.insertOne({ time: new Date(), ...entry }).catch((err) => console.error('[chatlog] write failed:', err.message));
    },
  };
}

export async function openChatLog({ uri, retentionDays = 30 }) {
  if (!uri) {
    console.warn('[chatlog] MONGODB_URI not set: chats will not be logged.');
    return noop;
  }
  try {
    const client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 5000 });
    const db = client.db();
    const collection = db.collection('chat_logs');
    const expireAfterSeconds = retentionDays * DAY_S;
    try {
      await collection.createIndex({ time: 1 }, { expireAfterSeconds });
    } catch {
      // Index exists with a different retention: update it in place.
      await db.command({ collMod: 'chat_logs', index: { keyPattern: { time: 1 }, expireAfterSeconds } });
    }
    console.log(`[chatlog] MongoDB connected, keeping logs for ${retentionDays} days`);
    return { ...createChatLog(collection), collection, close: () => client.close() };
  } catch (err) {
    console.error('[chatlog] MongoDB unavailable, chats will not be logged:', err.message);
    return noop;
  }
}
