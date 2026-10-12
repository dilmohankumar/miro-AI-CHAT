import OpenAI from 'openai';

// AI providers, tried in order. If the first fails (no credit, quota, outage, timeout) the next one answers.
// A provider that fails is skipped for a while, so visitors don't wait for a known-dead provider on every message.
const TIMEOUT_MS = 15000;
const COOLDOWN = { hard: 10 * 60 * 1000, soft: 30 * 1000 }; // hard: no credit / bad key. soft: anything else.
const placeholder = /replace-me|your[-_]?key/i;

const clean = (key) => (key || '').trim();
export const isOpenAIConfigured = (key = process.env.OPENAI_API_KEY) => Boolean(clean(key)) && !placeholder.test(key);
export const isGeminiConfigured = (key = process.env.GEMINI_API_KEY) => Boolean(clean(key)) && !placeholder.test(key);
export const isAiConfigured = () => isOpenAIConfigured() || isGeminiConfigured();

let openai;
async function askOpenAI(messages) {
  openai ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: TIMEOUT_MS, maxRetries: 0 });
  const res = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages,
    temperature: 0.3,
    max_tokens: 400,
  });
  return res.choices[0].message.content;
}

// Google Gemini over plain REST (no extra dependency). The key goes in a header, never in the URL, so it can't leak into logs.
// GEMINI_MODEL can list several models ("a,b"): Google retires or overloads models often, so the next one is tried.
const DEFAULT_GEMINI_MODELS = 'gemini-flash-lite-latest,gemini-flash-latest';

async function askGeminiModel(model, messages, fetchImpl) {
  const system = messages.find((m) => m.role === 'system')?.content ?? '';
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clean(process.env.GEMINI_API_KEY) },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { temperature: 0.3, maxOutputTokens: 600 },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(`Gemini ${model} ${res.status}: ${body?.error?.message || res.statusText}`), { status: res.status });
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
  if (!text) throw new Error(`Gemini ${model} returned no text (${data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason || 'empty'})`);
  return text;
}

async function askGemini(messages, fetchImpl = fetch) {
  const models = (process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODELS).split(',').map((m) => m.trim()).filter(Boolean);
  let last;
  for (const model of models) {
    try {
      return await askGeminiModel(model, messages, fetchImpl);
    } catch (err) {
      last = err;
      if ([401, 403].includes(err.status)) break; // a bad key fails on every model
    }
  }
  throw last;
}

export const PROVIDERS = [
  { name: 'openai', enabled: isOpenAIConfigured, ask: askOpenAI },
  { name: 'gemini', enabled: isGeminiConfigured, ask: askGemini },
];

const downUntil = new Map(); // provider name -> timestamp
export const resetCooldowns = () => downUntil.clear();

// Returns { text, provider }. Throws only when every enabled provider failed.
export async function completeWithFallback(messages, providers = PROVIDERS) {
  const errors = [];
  for (const p of providers) {
    if (!p.enabled() || Date.now() < (downUntil.get(p.name) ?? 0)) continue;
    try {
      const text = (await p.ask(messages))?.trim();
      if (text) return { text, provider: p.name };
      errors.push(`${p.name}: empty answer`);
    } catch (err) {
      const hard = [401, 402, 403, 429].includes(err.status);
      downUntil.set(p.name, Date.now() + (hard ? COOLDOWN.hard : COOLDOWN.soft));
      errors.push(`${p.name}: ${err.message}`);
      console.error(`[ai] ${p.name} failed (${hard ? 'paused 10 min' : 'paused 30s'}):`, err.message);
    }
  }
  throw new Error(errors.join(' | ') || 'no AI provider available');
}

export { askGemini };
