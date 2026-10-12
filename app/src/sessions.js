const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 5000;
const MAX_MESSAGES = 12;

// In-memory conversation history per visitor session (lost on restart, which
// is fine: it only exists to give the AI short-term context).
export function createSessionStore() {
  const sessions = new Map(); // id -> { messages, touched }

  const prune = () => {
    const now = Date.now();
    for (const [id, s] of sessions) if (now - s.touched > SESSION_TTL_MS) sessions.delete(id);
    while (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
  };

  return {
    history(id) {
      return sessions.get(id)?.messages ?? [];
    },
    append(id, ...messages) {
      prune();
      const s = sessions.get(id) ?? { messages: [] };
      s.messages = [...s.messages, ...messages].slice(-MAX_MESSAGES);
      s.touched = Date.now();
      sessions.set(id, s);
    },
  };
}

// Global per-day cap on AI (paid) answers, so a spammer cannot run up the bill.
export function createDailyLimiter(limit) {
  let day = '';
  let count = 0;
  const roll = () => {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== day) [day, count] = [today, 0];
  };
  return {
    tryTake() {
      roll();
      if (count >= limit) return false;
      count += 1;
      return true;
    },
  };
}
