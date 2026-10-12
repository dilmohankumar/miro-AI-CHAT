# Website AI Chatbot

One small Node server that gives any website an AI chat bubble. No database,
no login, no build step.

```
src/        server (Express), FAQ matching, OpenAI call, rate limits, chat logs
widget/     chat widget source (React + Tailwind) -> built into public/widget.js
content/    YOUR content: config.json, faqs.json, knowledge/*.md|txt
public/     widget.js (BUILT from widget/, committed) + demo.html
test/       automated tests (npm test)
```

## Run locally
```bash
cd app
cp .env.example .env      # add OPENAI_API_KEY
npm install
npm run dev               # http://localhost:4200/demo.html
```
Editing anything in `content/` or `src/` restarts the server automatically.

Changed the widget UI (`widget/src`)? Rebuild it: `npm run build:widget` (outputs `public/widget.js`).

## How answers work
1. Visitor's question matches a FAQ in `content/faqs.json` -> instant answer, no AI cost.
2. Otherwise the AI answers using `faqs.json` + `content/knowledge/*` only. If it
   isn't covered, it says so instead of guessing.
3. No/invalid `OPENAI_API_KEY` -> FAQ answers still work; everything else gets a polite fallback.

## Put the chat on any website
Add before `</body>` (replace the domain with where this server is deployed):
```html
<script src="https://api.yourdomain.com/widget.js" data-chatbot-id="main" async></script>
```
Optional: `data-position="bottom-left"`, `data-open="true"` (start opened). Name, welcome text, quick-reply
buttons, accent color and avatar image are set in `content/config.json`.

## Voice chat
The widget has two tabs: **Chat** (text) and **Voice**. In Voice the visitor taps the mic, speaks, and the bot
answers out loud (same brain, same history as the text tab). It uses the browser's built-in speech
recognition + speech synthesis: free, no extra API. Works in Chrome, Edge and Safari (Firefox: the Voice tab
explains it is unsupported and offers text chat). Needs HTTPS in production (localhost is fine).
`content/config.json`: `"voice": false` hides the tab; `"voiceLang": "hi-IN"` sets the speaking/listening
language (default = the visitor's browser language).

## Chat logs
Every exchange is stored in MongoDB (`MONGODB_URI`, collection `chat_logs`, no IPs stored). A TTL
index deletes entries older than `LOG_RETENTION_DAYS` (default 30) automatically. If MongoDB is
unavailable the chat keeps working; it just isn't logged. `npm run logs` lists the questions
the bot could not answer so you can add them to `faqs.json`; `npm run logs -- all` shows everything.

## Settings
`content/config.json`: name, welcome message, quick replies, color, `systemPrompt`,
and `allowedOrigins` (empty = any website may embed it; list your domains to lock it).

`.env`: `OPENAI_API_KEY`, `OPENAI_MODEL`, `CHAT_RATE_LIMIT_PER_MIN` (per IP),
`DAILY_CHAT_LIMIT` (total paid AI answers per day, caps your bill).

## Deploy
Any Node 20+ host (EC2, Render, Railway): `npm install && npm start`, behind HTTPS
(nginx/ALB). Set the env vars. Conversation memory is in-process, so run a single instance.
