import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { loadContent } from './content.js';
import { isOpenAIConfigured } from './engine.js';
import { openChatLog } from './chatlog.js';

const CONTENT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'content');
const PORT = process.env.PORT || 4200;

const content = loadContent(CONTENT_DIR);
console.log(`[content] ${content.faqs.length} FAQs, ${content.chunks.length} knowledge chunks`);
if (!isOpenAIConfigured()) console.warn('[ai] OPENAI_API_KEY not set: only FAQ answers will work.');

const log = await openChatLog({ uri: process.env.MONGODB_URI, retentionDays: Number(process.env.LOG_RETENTION_DAYS || 30) });

createApp({ content, log }).listen(PORT, () => console.log(`[server] http://localhost:${PORT}  (demo: /demo.html)`));
