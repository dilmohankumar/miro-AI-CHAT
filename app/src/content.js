import fs from 'node:fs';
import path from 'node:path';

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'do', 'does', 'what', 'which', 'how', 'can', 'i', 'you', 'your',
  'my', 'to', 'for', 'of', 'in', 'on', 'at', 'it', 'this', 'that', 'and', 'or', 'with', 'about',
  'please', 'hi', 'hello',
]);

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 120;
const FAQ_THRESHOLD = 0.34;

// Words that don't change the meaning of small talk ("hi miro", "thanks bro", "hello there please").
const TALK_FILLER = new Set(['miro', 'there', 'bro', 'sir', 'mam', 'madam', 'ji', 'please', 'pls', 'plz', 'bhai', 'dear', 'team', 'assistant', 'bot']);

export function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

// Lowercase, strip punctuation/emoji/apostrophes, squash stretched letters ("hiii" -> "hi"), drop filler words.
export function normalizeTalk(text) {
  return (text || '')
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/(.)\1{2,}/g, '$1')
    .split(/\s+/)
    .filter((w) => w && !TALK_FILLER.has(w))
    .join(' ');
}

export function chunkText(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  const chunks = [];
  for (let start = 0; start < clean.length; start += CHUNK_SIZE - CHUNK_OVERLAP) {
    chunks.push(clean.slice(start, start + CHUNK_SIZE));
    if (start + CHUNK_SIZE >= clean.length) break;
  }
  return chunks.filter((c) => c.length > 20);
}

const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`[content] Could not read ${file}: ${err.message}`);
    return fallback;
  }
};

// Reads content/config.json, content/faqs.json and content/knowledge/*.{md,txt}.
export function loadContent(dir) {
  const config = readJson(path.join(dir, 'config.json'), {});
  const faqs = readJson(path.join(dir, 'faqs.json'), []).filter((f) => f.question && f.answer);

  const kDir = path.join(dir, 'knowledge');
  const files = fs.existsSync(kDir) ? fs.readdirSync(kDir).filter((f) => /\.(md|txt)$/i.test(f)) : [];
  const chunks = files.flatMap((file) =>
    chunkText(fs.readFileSync(path.join(kDir, file), 'utf8')).map((text) => ({ text, source: file }))
  );

  // content/smalltalk.json: [{ "phrases": ["hi", ...], "answer": "..." }] - free answers for greetings, thanks, bye...
  const talk = readJson(path.join(dir, 'smalltalk.json'), []).filter((t) => Array.isArray(t.phrases) && t.answer);
  const smalltalk = new Map(talk.flatMap((t) => t.phrases.map((p) => [normalizeTalk(p), t.answer])));

  return { config, faqs, chunks, smalltalk };
}

// Exact match on the WHOLE message, so "hi, how do I claim #1?" is never hijacked by the greeting.
export function matchSmallTalk(smalltalk, text) {
  return smalltalk?.get(normalizeTalk(text)) ?? null;
}

function jaccard(a, b) {
  if (!a.length || !b.length) return 0;
  const bSet = new Set(b);
  const shared = a.filter((t) => bSet.has(t)).length;
  return shared / new Set([...a, ...b]).size;
}

// Best FAQ whose question/alternate phrase overlaps the visitor's question enough.
export function matchFaq(faqs, question) {
  const q = tokenize(question);
  let best = null;
  let bestScore = 0;
  for (const faq of faqs) {
    for (const phrase of [faq.question, ...(faq.alternatePhrases || [])]) {
      const score = jaccard(q, tokenize(phrase));
      if (score > bestScore) [best, bestScore] = [faq, score];
    }
  }
  return bestScore >= FAQ_THRESHOLD ? best : null;
}

// Small knowledge bases are sent whole; larger ones are narrowed by keyword overlap.
export function searchKnowledge(chunks, query, { limit = 5, sendAllUnder = 8000 } = {}) {
  const total = chunks.reduce((n, c) => n + c.text.length, 0);
  if (total <= sendAllUnder) return chunks;
  const q = new Set(tokenize(query));
  return chunks
    .map((c) => ({ c, score: tokenize(c.text).filter((t) => q.has(t)).length }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.c);
}
