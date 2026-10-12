// Reads the embed <script> tag's options and talks to the backend.
// Embed: <script src="https://API/widget.js" data-chatbot-id="main" async></script>
// Optional: data-api-url, data-position="bottom-left", data-open="true"
export function readOptions(script) {
  const apiUrl = (script.dataset.apiUrl || new URL(script.src).origin).replace(/\/$/, '');
  return {
    apiUrl,
    chatbotId: script.dataset.chatbotId || 'main',
    position: script.dataset.position === 'bottom-left' ? 'left' : 'right',
    startOpen: script.dataset.open === 'true',
    theme: ['light', 'dark', 'auto'].includes(script.dataset.theme) ? script.dataset.theme : null,
  };
}

export async function fetchConfig({ apiUrl, chatbotId }) {
  const res = await fetch(`${apiUrl}/api/chat/widget-config/${encodeURIComponent(chatbotId)}`);
  if (!res.ok) throw new Error('config');
  return res.json();
}

export async function sendMessage({ apiUrl, chatbotId }, message, sessionId) {
  const res = await fetch(`${apiUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatbotId, message, sessionId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

// Browser storage can be blocked (private mode, cookies off): never let that break the chat.
export const store = {
  get(key, fallback) {
    try {
      return JSON.parse(sessionStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  },
};
