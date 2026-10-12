import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { loadContent } from './content.js';
import { isGeminiConfigured, isOpenAIConfigured } from './ai.js';
import { openChatLog } from './chatlog.js';

const CONTENT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'content');
const PORT = process.env.PORT || 4200;

const content = loadContent(CONTENT_DIR);
console.log(`[content] ${content.faqs.length} FAQs, ${content.chunks.length} knowledge chunks`);
const ai = [isOpenAIConfigured() && 'OpenAI', isGeminiConfigured() && 'Gemini (fallback)'].filter(Boolean);
if (ai.length) console.log(`[ai] providers: ${ai.join(' -> ')}`);
else console.warn('[ai] No OPENAI_API_KEY / GEMINI_API_KEY set: only FAQ and small-talk answers will work.');

const log = await openChatLog({ uri: process.env.MONGODB_URI, retentionDays: Number(process.env.LOG_RETENTION_DAYS || 30) });

createApp({ content, log }).listen(PORT, () => console.log(`[server] http://localhost:${PORT}  (demo: /demo.html)`));
