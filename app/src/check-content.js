import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// `npm run check` -> validates content/ before you deploy (catches the usual JSON typos).
const dir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'content');
let problems = 0;
let section = 0; // problems found in the current section
const fail = (msg) => (problems += 1, section += 1, console.log(`  ✗ ${msg}`));
const start = (title) => (section = 0, console.log(title));
const ok = (msg) => console.log(`  ✓ ${msg}`);

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  } catch (err) {
    fail(`${file}: ${err.message}`);
    return null;
  }
}

start('faqs.json');
const faqs = readJson('faqs.json');
if (faqs) {
  if (!Array.isArray(faqs)) fail('must be a list [ ... ] of FAQs');
  else {
    faqs.forEach((f, i) => {
      const n = `FAQ #${i + 1}`;
      if (!f.question?.trim()) fail(`${n}: "question" is missing or empty`);
      if (!f.answer?.trim()) fail(`${n}: "answer" is missing or empty`);
      if (f.alternatePhrases !== undefined && !Array.isArray(f.alternatePhrases)) fail(`${n}: "alternatePhrases" must be a list`);
      if (/WRITE |REPLACE|SECOND (QUESTION|ANSWER)/.test(`${f.question} ${f.answer}`)) fail(`${n}: still contains template text`);
    });
    const dup = faqs.map((f) => f.question?.trim().toLowerCase()).filter((q, i, a) => q && a.indexOf(q) !== i);
    dup.forEach((q) => fail(`duplicate question: "${q}"`));
    if (!section) ok(`${faqs.length} FAQs look good`);
  }
}

start('config.json');
const cfg = readJson('config.json');
if (cfg) {
  if (!cfg.name) fail('"name" is missing');
  if (!cfg.systemPrompt) fail('"systemPrompt" is missing');
  if (cfg.avatarUrl && cfg.avatarUrl.startsWith('/') && !fs.existsSync(path.join(dir, '..', 'public', cfg.avatarUrl))) fail(`avatar image not found: public${cfg.avatarUrl} (file names are case-sensitive on Linux)`);
  if (!section) ok('settings look good');
}

start('smalltalk.json');
const talk = readJson('smalltalk.json');
if (talk) {
  if (!Array.isArray(talk)) fail('must be a list [ ... ]');
  else talk.forEach((t, i) => {
    if (!Array.isArray(t.phrases) || !t.phrases.length) fail(`entry #${i + 1}: "phrases" must be a non-empty list`);
    if (!t.answer?.trim()) fail(`entry #${i + 1}: "answer" is missing or empty`);
  });
  if (!section) ok(`${talk.length} small-talk groups look good`);
}

start('knowledge/');
const kDir = path.join(dir, 'knowledge');
const files = fs.existsSync(kDir) ? fs.readdirSync(kDir).filter((f) => /\.(md|txt)$/i.test(f)) : [];
const size = files.reduce((n, f) => n + fs.statSync(path.join(kDir, f)).size, 0);
const strayJson = fs.existsSync(kDir) ? fs.readdirSync(kDir).filter((f) => /\.json$/i.test(f)) : [];
strayJson.forEach((f) => console.log(`  ! knowledge/${f} is ignored (only .md/.txt are read here). FAQs go in content/faqs.json`));
if (!files.length) fail('no .md / .txt files: the AI will have nothing to answer from');
else {
  ok(`${files.length} file(s), ~${size} characters`);
  if (size > 8000) console.log('  ! more than ~8000 characters: only the parts matching each question are sent to the AI (still fine).');
  files.forEach((f) => /replace this file|WRITE |Who you are, what you do/i.test(fs.readFileSync(path.join(kDir, f), 'utf8')) && fail(`${f}: still contains sample/template text`));
}

start('origins');
{
  const { createOriginPolicy } = await import('./origins.js');
  const pol = createOriginPolicy({ config: cfg || {} });
  if (pol.open) console.log('  ! ALLOWED_ORIGINS is not set: ANY website can use your chatbot. Set it in .env before going live.');
  else ok(`only ${pol.list.join(', ')} (from ${pol.source})`);
  if (process.env.NODE_ENV !== 'production') console.log('  ! NODE_ENV is not "production": localhost is also allowed (fine for testing; set NODE_ENV=production on the live server).');
}

console.log(problems ? `\n${problems} problem(s) to fix before deploying.` : '\nAll good.');
process.exit(problems ? 1 : 0);
