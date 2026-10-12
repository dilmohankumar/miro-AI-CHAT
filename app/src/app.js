import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { answerQuestion, defaultComplete, isOpenAIConfigured } from './engine.js';
import { createSessionStore, createDailyLimiter } from './sessions.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

export function createApp({ content, dailyLimit = Number(process.env.DAILY_CHAT_LIMIT || 500), complete = defaultComplete, log = { write() {} } } = {}) {
  const { config } = content;
  const sessions = createSessionStore();
  const daily = createDailyLimiter(dailyLimit);
  const allowedOrigins = (config.allowedOrigins || []).map((o) => o.replace(/\/$/, ''));

  const app = express();
  app.set('trust proxy', 1); // behind nginx/ALB so rate limiting sees real client IPs
  app.use(helmet());
  if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));
  app.use(express.json({ limit: '10kb' }));

  // widget.js is loaded cross-origin by any website.
  app.use(
    express.static(PUBLIC_DIR, {
      maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0, // no caching in dev, so UI rebuilds show up
      setHeaders(res) {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Access-Control-Allow-Origin', '*');
      },
    })
  );

  app.use('/api', cors({ origin: true }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, ai: isOpenAIConfigured() }));

  app.get('/api/chat/widget-config/:id', (_req, res) => {
    const { name, heroTitle, welcomeMessage, teaser, quickReplies, themeColor, theme, avatarUrl, avatarFit, voice, voiceLang, voiceGreeting } = config;
    res.json({ name, heroTitle, welcomeMessage, teaser, quickReplies, themeColor, theme, avatarUrl, avatarFit, voice, voiceLang, voiceGreeting });
  });

  const limiter = rateLimit({
    windowMs: 60_000,
    max: Number(process.env.CHAT_RATE_LIMIT_PER_MIN || 20),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many messages. Please wait a moment and try again.' },
  });

  app.post('/api/chat', limiter, async (req, res, next) => {
    try {
      const origin = (req.get('origin') || '').replace(/\/$/, '');
      if (allowedOrigins.length && !allowedOrigins.includes(origin)) {
        return res.status(403).json({ error: 'This website is not authorized to use this chatbot.' });
      }

      const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
      if (!message || message.length > 2000) {
        return res.status(400).json({ error: 'message is required (max 2000 characters)' });
      }
      const sid = typeof req.body.sessionId === 'string' && req.body.sessionId.length <= 100 ? req.body.sessionId : randomUUID();

      // Answers from the FAQ are free; only paid AI calls count against the daily cap.
      const result = await answerQuestion({
        content,
        question: message,
        history: sessions.history(sid),
        complete: (m) => (daily.tryTake() ? complete(m) : Promise.reject(new Error('daily limit reached'))),
      });

      sessions.append(sid, { role: 'user', content: message }, { role: 'assistant', content: result.answer });
      log.write({ sessionId: sid, question: message, answer: result.answer, source: result.source });
      res.json({ sessionId: sid, answer: result.answer, source: result.source });
    } catch (err) {
      next(err);
    }
  });

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error('[error]', err.message);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Internal server error' });
  });

  return app;
}
