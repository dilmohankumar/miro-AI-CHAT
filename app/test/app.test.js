import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkText, matchFaq, matchSmallTalk, normalizeTalk, searchKnowledge, tokenize } from '../src/content.js';
import { createSessionStore, createDailyLimiter } from '../src/sessions.js';
import { answerQuestion, FALLBACK } from '../src/engine.js';
import { isOpenAIConfigured, isGeminiConfigured, completeWithFallback, resetCooldowns, askGemini } from '../src/ai.js';
import { createApp } from '../src/app.js';
import { createChatLog, openChatLog } from '../src/chatlog.js';
import { createOriginPolicy, parseOrigins } from '../src/origins.js';
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
  assert.match((await (await post({ message: 'another question' })).json()).answer, /couldn.t answer/); // daily cap hit
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

const talk = new Map([['hi', 'GREETING'], ['thank you', 'THANKS'], ['bye', 'BYE']].map(([p, a]) => [normalizeTalk(p), a]));

test('small talk: greetings/thanks match whole messages only', () => {
  assert.equal(matchSmallTalk(talk, 'Hi!'), 'GREETING');
  assert.equal(matchSmallTalk(talk, 'hiiiii 😊'), 'GREETING');
  assert.equal(matchSmallTalk(talk, 'Hi Miro,'), 'GREETING'); // filler words are ignored
  assert.equal(matchSmallTalk(talk, "THANK YOU!!"), 'THANKS');
  assert.equal(matchSmallTalk(talk, 'hi, how do I claim #1?'), null); // a real question is never hijacked
  assert.equal(matchSmallTalk(talk, 'thank you for nothing, my payment failed'), null);
  assert.equal(matchSmallTalk(talk, ''), null);
});

test('engine: small talk is answered first, free, with or without an AI key', async () => {
  const withTalk = { ...content, smalltalk: talk };
  for (const key of ['sk-test-123', '']) {
    process.env.OPENAI_API_KEY = key;
    const r = await answerQuestion({ content: withTalk, question: 'hello'.replace('hello', 'hi'), complete: async () => { throw new Error('AI must not be called'); } });
    assert.deepEqual(r, { answer: 'GREETING', source: 'smalltalk' });
  }
});

test('engine: configurable fallback / error messages', async () => {
  const custom = { ...content, config: { fallbackMessage: 'FALLBACK!', errorMessage: 'ERROR!' } };
  process.env.OPENAI_API_KEY = '';
  assert.equal((await answerQuestion({ content: custom, question: 'zzz unknown' })).answer, 'FALLBACK!');
  process.env.OPENAI_API_KEY = 'sk-test-123';
  assert.equal((await answerQuestion({ content: custom, question: 'zzz unknown', complete: async () => { throw new Error('x'); } })).answer, 'ERROR!');
});

const ok = (name, text, calls) => ({ name, enabled: () => true, ask: async () => (calls?.push(name), text) });
const bad = (name, status, calls) => ({ name, enabled: () => true, ask: async () => { calls?.push(name); throw Object.assign(new Error(`${name} down`), { status }); } });

test('AI chain: falls back to the next provider and remembers a dead one', async () => {
  resetCooldowns();
  const calls = [];
  const chain = [bad('openai', 429, calls), ok('gemini', ' from gemini ', calls)];
  assert.deepEqual(await completeWithFallback([], chain), { text: 'from gemini', provider: 'gemini' });
  assert.deepEqual(calls, ['openai', 'gemini']);
  calls.length = 0;
  await completeWithFallback([], chain); // openai (no credit) is skipped for a while: no wasted wait
  assert.deepEqual(calls, ['gemini']);
  resetCooldowns();
});

test('AI chain: skips disabled providers, throws only when everything failed', async () => {
  resetCooldowns();
  const off = { name: 'openai', enabled: () => false, ask: async () => { throw new Error('must not run'); } };
  assert.equal((await completeWithFallback([], [off, ok('gemini', 'hi')])).provider, 'gemini');
  resetCooldowns();
  await assert.rejects(completeWithFallback([], [bad('openai', 500), bad('gemini', 503)]), /openai down.*gemini down/);
  resetCooldowns();
  await assert.rejects(completeWithFallback([], [off]), /no AI provider/);
  resetCooldowns();
});

test('engine: uses the chain result and reports which provider answered', async () => {
  process.env.OPENAI_API_KEY = 'sk-test-123';
  const r = await answerQuestion({ content, question: 'something new', complete: async () => ({ text: 'Hello', provider: 'gemini' }) });
  assert.deepEqual(r, { answer: 'Hello', source: 'ai', provider: 'gemini' });
});

test('Gemini request: key in a header (not the URL), system prompt + roles mapped, model list falls through', async () => {
  process.env.GEMINI_API_KEY = 'AQ.test-key-123';
  process.env.GEMINI_MODEL = 'model-a,model-b';
  const seen = [];
  const fake = async (url, init) => {
    seen.push({ url, init });
    return url.includes('model-a')
      ? { ok: false, status: 503, statusText: 'busy', json: async () => ({ error: { message: 'overloaded' } }) }
      : { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Hi ' }, { text: 'there' }] } }] }) };
  };
  const text = await askGemini([{ role: 'system', content: 'SYS' }, { role: 'user', content: 'q1' }, { role: 'assistant', content: 'a1' }, { role: 'user', content: 'q2' }], fake);
  assert.equal(text, 'Hi there');
  assert.equal(seen.length, 2);
  assert.ok(seen.every((c) => !c.url.includes('AQ.test-key')), 'key must never be in the URL');
  assert.equal(seen[1].init.headers['x-goog-api-key'], 'AQ.test-key-123');
  const body = JSON.parse(seen[1].init.body);
  assert.equal(body.systemInstruction.parts[0].text, 'SYS');
  assert.deepEqual(body.contents.map((c) => c.role), ['user', 'model', 'user']);
  // a bad key fails immediately on every model: don't hammer the rest of the list
  seen.length = 0;
  const denied = async (url, init) => (seen.push(url), { ok: false, status: 403, statusText: 'no', json: async () => ({ error: { message: 'API key not valid' } }) });
  await assert.rejects(askGemini([{ role: 'user', content: 'x' }], denied), /403/);
  assert.equal(seen.length, 1);
  delete process.env.GEMINI_MODEL;
});

test('isGeminiConfigured rejects blanks and placeholders', () => {
  assert.equal(isGeminiConfigured(''), false);
  assert.equal(isGeminiConfigured('your-key-here'), false);
  assert.equal(isGeminiConfigured('AQ.abc'), true);
});

test('origins: ALLOWED_ORIGINS from env, normalized, config.json as fallback', () => {
  const env = { ALLOWED_ORIGINS: 'https://akatsukisites.com/, https://www.akatsukisites.com/some/page ,  ' };
  const p = createOriginPolicy({ env: { ...env, NODE_ENV: 'production' }, config: { allowedOrigins: ['https://other.com'] } });
  assert.deepEqual(p.list, ['https://akatsukisites.com', 'https://www.akatsukisites.com']); // env wins, trailing slash/path dropped
  assert.equal(p.source, 'ALLOWED_ORIGINS');
  assert.equal(p.allows('https://akatsukisites.com'), true);
  assert.equal(p.allows('https://akatsukisites.com/'), true);
  assert.equal(p.allows('https://evil.com'), false);
  assert.equal(p.allows('https://akatsukisites.com.evil.com'), false); // no suffix tricks
  assert.equal(p.allows('http://akatsukisites.com'), false); // scheme must match
  assert.equal(p.allows(undefined), false); // no Origin header (curl, bots) is refused when locked
  assert.equal(p.allows('null'), false);

  const fallback = createOriginPolicy({ env: { NODE_ENV: 'production' }, config: { allowedOrigins: ['https://other.com'] } });
  assert.equal(fallback.source, 'config.json');
  assert.equal(fallback.allows('https://other.com'), true);
});

test('origins: localhost allowed only outside production; empty list means open', () => {
  const locked = { ALLOWED_ORIGINS: 'https://akatsukisites.com' };
  assert.equal(createOriginPolicy({ env: { ...locked, NODE_ENV: 'development' } }).allows('http://localhost:4200'), true);
  assert.equal(createOriginPolicy({ env: { ...locked, NODE_ENV: 'production' } }).allows('http://localhost:4200'), false);
  assert.equal(createOriginPolicy({ env: { ...locked, NODE_ENV: 'production' } }).allows('http://127.0.0.1:3000'), false);
  const open = createOriginPolicy({ env: {}, config: {} });
  assert.equal(open.open, true);
  assert.equal(open.allows('https://anything.com'), true);
  assert.deepEqual(parseOrigins('not a url, https://ok.com'), ['https://ok.com']); // bad entries are ignored (with a warning)
});

test('HTTP: ALLOWED_ORIGINS in the environment locks the chat endpoint', async (t) => {
  process.env.ALLOWED_ORIGINS = 'https://akatsukisites.com';
  process.env.NODE_ENV = 'production';
  t.after(() => { delete process.env.ALLOWED_ORIGINS; process.env.NODE_ENV = 'test'; });
  const server = createApp({ content }).listen(0);
  t.after(() => server.close());
  const send = (origin) => fetch(`http://localhost:${server.address().port}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin && { Origin: origin }) }, body: JSON.stringify({ message: 'opening hours' }) });
  assert.equal((await send('https://akatsukisites.com')).status, 200);
  assert.equal((await send('https://evil.com')).status, 403);
  assert.equal((await send()).status, 403);
});
