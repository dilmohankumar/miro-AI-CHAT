import { MongoClient } from 'mongodb';

// `npm run logs`        -> questions the bot could not answer (add them to faqs.json)
// `npm run logs -- all` -> every logged exchange (latest 200)
const client = await MongoClient.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
const logs = client.db().collection('chat_logs');
const unanswered = { source: { $in: ['fallback', 'error'] } };

const rows = await logs.find(process.argv.includes('all') ? {} : unanswered).sort({ time: -1 }).limit(200).toArray();
for (const r of rows.reverse()) console.log(`${r.time.toISOString()}  [${r.source}]  ${r.question}`);
console.log(`\n${await logs.countDocuments()} chats logged, ${await logs.countDocuments(unanswered)} unanswered.`);
await client.close();
