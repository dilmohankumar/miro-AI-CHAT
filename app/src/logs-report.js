import { MongoClient } from 'mongodb';

// npm run logs            -> what to add to faqs.json: unanswered questions + most-asked questions (with counts)
// npm run logs -- all     -> every logged exchange (latest 200)
// npm run logs -- days=7  -> only the last 7 days (default: everything still kept, 30 days)
const args = process.argv.slice(2);
const days = Number(args.find((a) => a.startsWith('days='))?.slice(5)) || 0;
const UNANSWERED = ['fallback', 'error'];

const client = await MongoClient.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
const logs = client.db().collection('chat_logs');
const since = days ? { time: { $gte: new Date(Date.now() - days * 86400000) } } : {};

if (args.includes('all')) {
  const rows = await logs.find(since).sort({ time: -1 }).limit(200).toArray();
  for (const r of rows.reverse()) console.log(`${r.time.toISOString()}  [${r.source}]  ${r.question}`);
  console.log(`\n${rows.length} shown.`);
  await client.close();
  process.exit(0);
}

// Same question asked in slightly different ways ("How much?", "how much") counts as one.
const key = (q) => q.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const rows = await logs.find({ ...since, source: { $ne: 'smalltalk' } }).project({ question: 1, source: 1, time: 1 }).limit(20000).toArray();

const groups = new Map();
for (const r of rows) {
  const k = key(r.question);
  if (!k) continue;
  const g = groups.get(k) ?? { text: r.question.trim(), count: 0, unanswered: 0, faq: 0, last: r.time };
  g.count += 1;
  if (UNANSWERED.includes(r.source)) g.unanswered += 1;
  if (r.source === 'faq') g.faq += 1;
  if (r.time > g.last) g.last = r.time;
  groups.set(k, g);
}
const list = [...groups.values()];
const pad = (n) => String(n).padStart(3);
const show = (title, items, note) => {
  console.log(`\n${title}`);
  if (!items.length) return console.log('  (nothing)');
  for (const g of items) console.log(`  ${pad(g.count)}x  ${g.text}${note ? note(g) : ''}`);
};

show('NOT ANSWERED, add these to faqs.json (most asked first):', list.filter((g) => g.unanswered).sort((a, b) => b.unanswered - a.unanswered || b.last - a.last).slice(0, 20), (g) => (g.unanswered < g.count ? `   (${g.unanswered} of ${g.count} failed)` : ''));
show('MOST ASKED OVERALL (asked 2+ times):', list.filter((g) => g.count >= 2).sort((a, b) => b.count - a.count).slice(0, 15), (g) => (g.faq === g.count ? '   ✓ already answered by a FAQ' : g.unanswered ? '   ✗ needs a FAQ' : '   (answered by AI: consider adding a FAQ so it is instant and free)'));

const total = await logs.countDocuments(since);
console.log(`\n${total} chats logged${days ? ` in the last ${days} days` : ''}, ${rows.filter((r) => UNANSWERED.includes(r.source)).length} unanswered (small talk like "hi" is not counted).`);
await client.close();
