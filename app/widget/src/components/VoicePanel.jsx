import { useEffect, useRef, useState } from 'react';
import { SpeechRecognitionImpl, canSpeak, cancelSpeech, speak, startMicLevel } from '../speech.js';
import Wave from './Wave.jsx';
import { MicIcon, MicOffIcon, StopSquareIcon } from './icons.jsx';

const STATUS = {
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
  paused: 'Paused · tap the mic to resume',
};

const FATAL = {
  'not-allowed': 'Microphone is blocked. Allow microphone access in your browser (address bar), then tap the mic.',
  'service-not-allowed': 'Microphone is blocked. Allow microphone access in your browser (address bar), then tap the mic.',
  'audio-capture': 'No microphone found. Connect one, then tap the mic.',
  network: "Voice recognition couldn't connect to the speech service. Check your internet — or, if you're using Brave or an embedded browser (like VS Code's), open this page in Google Chrome, Edge or Safari.",
  'language-not-supported': 'This language is not supported for voice input in your browser.',
};

const MAX_SILENT_RUNS = 3; // ~30s of nobody talking -> pause (saves battery, respects privacy)

// Voice mode: switching to this tab starts a hands-free conversation (listen -> answer out loud ->
// listen again) that stays active until the visitor switches to the Chat tab or closes the widget.
export default function VoicePanel({ lang, messages, send, onUseText, dark = false, greeting }) {
  const [state, setState] = useState('listening'); // listening | thinking | speaking | paused
  const [heard, setHeard] = useState('');
  const [notice, setNotice] = useState(null); // { kind: 'hint' | 'error', text }
  const [brave, setBrave] = useState(false);

  const recognizer = useRef(null);
  const mic = useRef(null);
  const pulseAt = useRef(0);
  const alive = useRef(true);
  const paused = useRef(false);
  const silentRuns = useRef(0);
  const sendRef = useRef(send);
  const opts = useRef({ lang });
  sendRef.current = send;
  opts.current = { lang };

  useEffect(() => {
    alive.current = true;
    // Brave blocks Google's speech service, so recognition cannot work there: say so instead of failing.
    Promise.resolve(navigator.brave?.isBrave?.())
      .catch(() => false)
      .then((isBrave) => {
        if (!alive.current) return;
        if (isBrave) setBrave(true);
        else if (SpeechRecognitionImpl) listen();
      });
    return () => {
      alive.current = false;
      recognizer.current?.abort();
      mic.current?.stop();
      cancelSpeech();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pause(note = null) {
    paused.current = true;
    recognizer.current?.abort();
    recognizer.current = null;
    mic.current?.stop();
    mic.current = null;
    cancelSpeech();
    setNotice(note);
    setState('paused');
  }

  function resume() {
    paused.current = false;
    silentRuns.current = 0;
    listen();
  }

  function listen() {
    if (!alive.current || paused.current) return;
    cancelSpeech();
    setNotice(null);
    setHeard('');
    mic.current ??= startMicLevel();
    let transcript = '';
    let fatal = null;
    const r = new SpeechRecognitionImpl();
    r.lang = opts.current.lang;
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      transcript = [...e.results].map((x) => x[0].transcript).join(' ');
      silentRuns.current = 0;
      pulseAt.current = performance.now();
      setHeard(transcript);
    };
    r.onerror = (e) => {
      if (e.error === 'aborted' || e.error === 'no-speech') return;
      fatal = FATAL[e.error] || 'Voice input failed. Tap the mic to try again.';
    };
    r.onend = () => {
      if (recognizer.current !== r || !alive.current) return;
      recognizer.current = null;
      if (fatal) return pause({ kind: 'error', text: fatal });
      const text = transcript.trim();
      if (text) return respond(text);
      silentRuns.current += 1;
      if (silentRuns.current >= MAX_SILENT_RUNS) return pause({ kind: 'hint', text: "I'm paused because it was quiet." });
      setTimeout(listen, 250);
    };
    recognizer.current = r;
    try {
      r.start();
      setState('listening');
    } catch {
      setTimeout(listen, 400); // "already started": retry shortly
    }
  }

  async function respond(text) {
    setState('thinking');
    const res = await sendRef.current(text);
    if (!alive.current || paused.current) return;
    if (!res.ok) {
      setNotice({ kind: 'error', text: res.text || 'Something went wrong. Please try again.' });
      return void setTimeout(listen, 1500);
    }
    if (!canSpeak) return listen(); // browser can't speak: the answer stays on screen, keep listening
    speak(res.text, { lang: opts.current.lang, onStart: () => alive.current && setState('speaking'), onEnd: () => listen() });
  }

  // One big button: pause the mic / interrupt the answer / resume.
  const onMain = () => {
    if (state === 'speaking') listen(); // interrupt: stop talking and listen right away
    else if (state === 'listening') pause();
    else if (state === 'paused') resume();
  };

  if (!SpeechRecognitionImpl || brave) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-fg/10 text-fg/70"><MicIcon className="h-7 w-7" /></div>
        <p className="text-sm text-fg/80">{brave ? 'Brave blocks the speech service that voice chat needs.' : "Voice chat isn't supported in this browser."} Please open this page in Google Chrome, Edge or Safari — or chat by text.</p>
        <button onClick={onUseText} className="rounded-lg bg-gradient-to-r from-[color:var(--accent)] to-sky-500 px-4 py-2 text-sm font-medium text-white">Use text chat</button>
      </div>
    );
  }

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const lastBot = [...messages].reverse().find((m) => m.role === 'assistant' && !m.isError);
  const said = state === 'listening' ? heard : lastUser?.content;
  // No card: the voice area sits directly on the panel, so colours simply follow the theme tokens (--fg).
  const T = {
    soft: 'text-fg/60', quote: 'text-fg/50', status: 'text-fg/65', err: 'text-err',
    main: 'bg-gradient-to-br from-[color:var(--accent)] to-sky-500 text-white shadow-[0_8px_26px_rgb(37_99_235/.45)]',
    ping: 'bg-blue-500/25', spin: 'border-t-blue-500',
  };

  return (
    <div className="relative mx-4 flex min-h-0 flex-1 flex-col">
      {/* what was said / answered */}
      <div className="no-scrollbar max-h-[44%] min-h-[96px] shrink-0 space-y-1.5 overflow-y-auto px-5 pt-5 text-left" aria-live="polite">
        {notice && <p className={`animate-fade-up text-[13px] leading-snug ${notice.kind === 'error' ? T.err : T.soft}`}>{notice.text}</p>}
        {state === 'listening' && !heard && !notice && <p className={`animate-pulse text-base ${T.soft}`}>{greeting}</p>}
        {said && <p key={said} className={`animate-fade-up text-[13px] italic ${T.quote}`}>“{said}”</p>}
        {state !== 'listening' && lastBot && !notice && <p key={lastBot.id} className="animate-fade-up text-[15px] leading-relaxed">{lastBot.content}</p>}
      </div>

      {/* the wave */}
      <div className="relative min-h-[110px] flex-1">
        <Wave state={state} getLevel={() => mic.current?.level ?? -1} pulseAt={pulseAt} dark={dark} />
      </div>

      {/* controls */}
      <div className="relative pb-4 pt-1">
        <p className={`mb-3 text-center text-xs font-medium ${T.status}`} role="status">{STATUS[state]}</p>
        <div className="flex justify-center">
          <button data-orb onClick={onMain} disabled={state === 'thinking'} aria-label={state === 'speaking' ? 'Stop speaking' : state === 'listening' ? 'Pause microphone' : state === 'paused' ? 'Resume listening' : 'Thinking'} className={`relative grid h-16 w-16 place-items-center rounded-full outline-none transition active:scale-95 focus-visible:ring-4 focus-visible:ring-sky-300/50 disabled:opacity-90 ${T.main}`}>
            {state === 'listening' && <span className={`absolute inset-0 animate-ping rounded-full ${T.ping}`} />}
            {state === 'thinking' && <span className={`absolute -inset-1 animate-spin rounded-full border-[3px] border-transparent ${T.spin}`} />}
            <span className="relative">
              {state === 'speaking' ? <StopSquareIcon className="h-6 w-6" /> : state === 'paused' ? <MicOffIcon className="h-7 w-7" /> : <MicIcon className="h-7 w-7" />}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
