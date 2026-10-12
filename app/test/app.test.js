import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkText, matchFaq, searchKnowledge, tokenize } from '../src/content.js';
import { createSessionStore, createDailyLimiter } from '../src/sessions.js';
import { answerQuestion, isOpenAIConfigured, FALLBACK } from '../src/engine.js';
import { createApp } from '../src/app.js';
import { createChatLog, openChatLog } from '../src/chatlog.js';
import { MongoClient } from 'mongodb';

process.env.NODE_ENV = 'test';
const faqs = [{ question: 'What are your opening hours?', alternatePhrases: ['working hours'], answer: '9-6' }];
const content = { config: { name: 'Bot', allowedOrigins: [] }, faqs, chunks: [{ text: 'We sell bolts and nuts.', source: 'a.md' }] };

test('tokenize drops stopwords and keeps non-latin letters', () => {
  assert.deepEqual(tokenize('What is the PRICE?'), ['price']);
  assert.ok(tokenize('दाम क्या है').length > 0);
});

test('matchFaq matches phrasing variants, rejects unrelated', () => {
  assert.equal(matchFaq(faqs, 'what are your working hours')?.answer, '9-6');
  assert.equal(matchFaq(faqs, 'do you ship to Mars'), null);
});

test('chunkText splits long text and drops tiny ones', () => {
  assert.equal(chunkText('x'.repeat(2500)).length, 3);
  assert.equal(chunkText('hi').length, 0);
});

test('searchKnowledge sends all when small, filters when large', () => {
  const small = [{ text: 'a'.repeat(100) }];
  assert.equal(searchKnowledge(small, 'q').length, 1);
  const big = [{ text: 'bolts '.repeat(2000) }, { text: 'nothing relevant '.repeat(500) }];
  assert.equal(searchKnowledge(big, 'bolts').length, 1);
});

test('sessions keep bounded history; daily limiter caps', () => {
  const s = createSessionStore();
  for (let i = 0; i < 20; i++) s.append('x', { role: 'user', content: String(i) });
  assert.equal(s.history('x').length, 12);
  const d = createDailyLimiter(2);
  assert.deepEqual([d.tryTake(), d.tryTake(), d.tryTake()], [true, true, false]);
});

test('isOpenAIConfigured rejects placeholders', () => {
  assert.equal(isOpenAIConfigured('sk-replace-me'), false);
  assert.equal(isOpenAIConfigured(''), false);
  assert.equal(isOpenAIConfigured('sk-proj-abc'), true);
});

test('engine: FAQ first, model for the rest, fallback on empty/error', async () => {
  process.env.OPENAI_API_KEY = 'sk-test-123';
  assert.equal((await answerQuestion({ content, question: 'opening hours?' })).source, 'faq');
  const ok = await answerQuestion({ content, question: 'what do you sell', complete: async () => ' Bolts! ' });
  assert.deepEqual(ok, { answer: 'Bolts!', source: 'ai' });
  assert.equal((await answerQuestion({ content, question: 'zzz', complete: async () => '' })).answer, FALLBACK);
  assert.equal((await answerQuestion({ content, question: 'zzz', complete: async () => { throw new Error('x'); } })).source, 'error');
});

test('HTTP: config, chat, validation, daily cap, origin lock', async (t) => {
  process.env.OPENAI_API_KEY = 'sk-test-123';
  const logged = [];
  const log = createChatLog({ insertOne: async (d) => logged.push(d) });
  const app = createApp({ content, dailyLimit: 1, complete: async () => 'AI says hi', log });
  const server = app.listen(0);
  t.after(() => server.close());
  const base = `http://localhost:${server.address().port}`;
  const post = (body, headers = {}) =>
    fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

  assert.equal((await (await fetch(`${base}/api/chat/widget-config/main`)).json()).name, 'Bot');
  assert.equal((await (await post({ message: 'opening hours' })).json()).source, 'faq');
  assert.equal((await (await post({ message: 'tell me more' })).json()).answer, 'AI says hi');
  assert.match((await (await post({ message: 'another question' })).json()).answer, /trouble/); // daily cap hit
  assert.equal((await post({ message: '' })).status, 400);
  assert.equal(logged.length, 3);
  assert.deepEqual(logged.map((l) => l.source), ['faq', 'ai', 'error']);
  assert.ok(logged[0].time instanceof Date && !('ip' in logged[0]));
  assert.equal((await fetch(`${base}/widget.js`)).headers.get('cross-origin-resource-policy'), 'cross-origin');

  const locked = createApp({ content: { ...content, config: { allowedOrigins: ['https://mysite.com'] } } }).listen(0);
  t.after(() => locked.close());
  const url = `http://localhost:${locked.address().port}/api/chat`;
  const send = (origin) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ message: 'opening hours' }) });
  assert.equal((await send('https://evil.com')).status, 403);
  assert.equal((await send('https://mysite.com')).status, 200);
});

test('chat log never throws when the DB write fails', async () => {
  const log = createChatLog({ insertOne: async () => { throw new Error('db down'); } });
  log.write({ question: 'q' }); // must not throw or reject
  await new Promise((r) => setTimeout(r, 20));
});

test('openChatLog: no URI or bad URI -> chat keeps working (no-op log)', async () => {
  (await openChatLog({ uri: '' })).write({ question: 'q' });
  const bad = await openChatLog({ uri: 'mongodb://127.0.0.1:1/x?serverSelectionTimeoutMS=300' });
  bad.write({ question: 'q' });
});

test('MongoDB: TTL index is created, updated, and logs are written', async (t) => {
  const uri = 'mongodb://127.0.0.1:27017/chatbot_test_' + process.pid;
  const probe = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 800 }).catch(() => null);
  if (!probe) return t.skip('local MongoDB not running');
  t.after(async () => { await probe.db().dropDatabase(); await probe.close(); });

  const a = await openChatLog({ uri, retentionDays: 30 });
  a.write({ sessionId: 's', question: 'q', answer: 'a', source: 'faq' });
  await new Promise((r) => setTimeout(r, 100));
  await a.close();
  const b = await openChatLog({ uri, retentionDays: 7 }); // changing retention must not crash
  await b.close();

  const col = probe.db().collection('chat_logs');
  assert.equal(await col.countDocuments(), 1);
  const idx = (await col.indexes()).find((i) => i.key.time === 1);
  assert.equal(idx.expireAfterSeconds, 7 * 86400);
});
