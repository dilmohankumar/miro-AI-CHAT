// Thin wrappers around the browser's built-in speech APIs (free, no backend needed).
// Recognition: Chrome / Edge / Safari. Synthesis: all modern browsers.
export const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition || null;
export const canSpeak = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

const cleanForSpeech = (text) =>
  text.replace(/https?:\/\/\S+/g, 'the link').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();

function pickVoice(lang) {
  const voices = speechSynthesis.getVoices();
  const want = lang.toLowerCase();
  return voices.find((v) => v.lang.toLowerCase() === want) || voices.find((v) => v.lang.toLowerCase().startsWith(want.split('-')[0])) || null;
}

let token = 0; // bumped on every cancel so stale callbacks from an old utterance are ignored

export function cancelSpeech() {
  token += 1;
  if (canSpeak) speechSynthesis.cancel();
}

// Speaks sentence by sentence (Chrome silently stops very long single utterances).
export function speak(text, { lang, onStart, onEnd }) {
  cancelSpeech();
  const mine = token;
  const cleaned = cleanForSpeech(text);
  const parts = cleaned.match(/[^.!?।\n]+[.!?।]*/g)?.map((p) => p.trim()).filter(Boolean) ?? [];
  if (!parts.length) return onEnd?.();
  let i = 0;
  const next = () => {
    if (mine !== token) return;
    if (i >= parts.length) return onEnd?.();
    const u = new SpeechSynthesisUtterance(parts[i]);
    u.lang = lang;
    const voice = pickVoice(lang);
    if (voice) u.voice = voice;
    if (i === 0) u.onstart = () => mine === token && onStart?.();
    i += 1;
    u.onend = next;
    u.onerror = (e) => mine === token && !['canceled', 'interrupted'].includes(e.error) && onEnd?.();
    speechSynthesis.speak(u);
  };
  next();
}

// Live microphone loudness (0..1) so the wave can follow the visitor's real voice.
// Purely cosmetic: any failure (no permission, Safari quirks) just means the wave falls back to a simulated motion.
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

export function startMicLevel() {
  let level = -1; // -1 = unavailable
  let stopped = false;
  let stream;
  let ctx;
  let raf;
  const api = {
    get level() {
      return level;
    },
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => {});
    },
  };
  if (isSafari || !navigator.mediaDevices?.getUserMedia) return api;
  navigator.mediaDevices
    .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    .then((s) => {
      if (stopped) return s.getTracks().forEach((t) => t.stop());
      stream = s;
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(s).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      level = 0;
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += ((v - 128) / 128) ** 2;
        level = level * 0.7 + Math.min(1, Math.sqrt(sum / data.length) * 6) * 0.3;
        raf = requestAnimationFrame(tick);
      };
      tick();
    })
    .catch(() => {});
  return api;
}
