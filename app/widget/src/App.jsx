import { useCallback, useEffect, useRef, useState } from 'react';
import Robot, { AvatarFit } from './components/Robot.jsx';
import Message, { Typing } from './components/Message.jsx';
import Composer from './components/Composer.jsx';
import Tabs from './components/Tabs.jsx';
import VoicePanel from './components/VoicePanel.jsx';
import Launcher from './components/Launcher.jsx';
import { ArrowDownIcon, CloseIcon, NewChatIcon, ShieldIcon } from './components/icons.jsx';
import { fetchConfig, sendMessage, store } from './api.js';
import { useStickToBottom } from './hooks.js';

const DEFAULTS = {
  name: 'Miro',
  heroTitle: 'Hi there! 👋',
  welcomeMessage: 'How can I help you today?',
  teaser: 'Need help? Ask me anything 👋',
  avatarFit: 'round',
  voice: true,
  voiceLang: '',
  voiceGreeting: '',
  quickReplies: [],
  themeColor: '#2563eb',
  theme: 'light',
  avatarUrl: '',
};

const uid = () => crypto.randomUUID();

function useSystemDark() {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const [dark, setDark] = useState(mq.matches);
  useEffect(() => {
    const on = (e) => setDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [mq]);
  return dark;
}

export default function App({ options }) {
  const sessionKey = `chatbot-session:${options.chatbotId}`;
  const msgKey = `chatbot-messages:${options.chatbotId}`;
  const teasedKey = `chatbot-teased:${options.chatbotId}`;

  const [config, setConfig] = useState(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(options.startOpen);
  const [messages, setMessages] = useState(() => store.get(msgKey, []));
  const [sending, setSending] = useState(false);
  const [teaser, setTeaser] = useState(false);
  const [tab, setTab] = useState('chat'); // 'chat' | 'voice'
  const sessionId = useRef(store.get(sessionKey, null) ?? uid());
  const inputRef = useRef(null);
  const launcherRef = useRef(null);
  const systemDark = useSystemDark();
  const { scrollRef, contentRef, onScroll, inputProps, showJump, toBottom } = useStickToBottom();

  useEffect(() => {
    fetchConfig(options)
      .then((c) => setConfig({ ...DEFAULTS, ...c, avatarUrl: c.avatarUrl ? new URL(c.avatarUrl, options.apiUrl).href : '' }))
      .catch(() => setFailed(true));
  }, [options]);

  useEffect(() => store.set(sessionKey, sessionId.current), [sessionKey]);
  // `fresh` (typewriter flag) must not be persisted, or old answers would re-type after a reload.
  useEffect(() => store.set(msgKey, messages.slice(-40).map(({ fresh, ...m }) => m)), [messages, msgKey]);

  // One-time teaser bubble a few seconds after load, if the visitor hasn't opened the chat yet.
  useEffect(() => {
    if (!config || open || store.get(teasedKey, false)) return;
    const show = setTimeout(() => setTeaser(true), 3500);
    const hide = setTimeout(() => setTeaser(false), 16000);
    return () => (clearTimeout(show), clearTimeout(hide));
  }, [config, open, teasedKey]);

  const toggle = useCallback(() => {
    if (open) {
      setTab('chat'); // leaving the voice tab stops the mic and any speech
      launcherRef.current?.focus({ preventScroll: true });
    } else {
      setTeaser(false);
      store.set(teasedKey, true);
      setTimeout(() => (inputRef.current?.focus({ preventScroll: true }), toBottom(false)), 320);
    }
    setOpen(!open);
  }, [open, teasedKey, toBottom]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && open && toggle();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, toggle]);

  const send = useCallback(
    async (text, { retryOf } = {}) => {
      const content = text.trim();
      if (!content || sending) return { ok: false, text: '' };
      setMessages((m) => {
        const base = retryOf ? m.filter((x) => x.id !== retryOf) : [...m, { id: uid(), role: 'user', content, time: Date.now() }];
        return base;
      });
      setSending(true);
      requestAnimationFrame(() => toBottom(true));
      try {
        const data = await sendMessage(options, content, sessionId.current);
        sessionId.current = data.sessionId || sessionId.current;
        setMessages((m) => [...m, { id: uid(), role: 'assistant', content: data.answer, time: Date.now(), fresh: true }]);
        return { ok: true, text: data.answer };
      } catch (err) {
        setMessages((m) => [...m, { id: uid(), role: 'assistant', content: err.message, time: Date.now(), isError: true, retry: content }]);
        return { ok: false, text: err.message };
      } finally {
        setSending(false);
      }
    },
    [options, sending, toBottom]
  );

  const retry = useCallback((msg) => send(msg.retry, { retryOf: msg.id }), [send]);

  const reset = () => {
    sessionId.current = uid();
    store.set(sessionKey, sessionId.current);
    setMessages([]);
  };

  if (failed || !config) return null; // backend unreachable: stay invisible rather than break the host page

  const pref = options.theme || config.theme || 'light'; // 'light' | 'dark' | 'auto'
  const theme = pref === 'auto' ? (systemDark ? 'dark' : 'light') : pref;
  const fit = ['round', 'cover', 'contain'].includes(config.avatarFit) ? config.avatarFit : 'round';
  const tile = Boolean(config.avatarUrl) && fit === 'contain'; // only this mode uses a rounded-square tile
  const voiceOn = config.voice !== false;
  const voiceLang = config.voiceLang || navigator.language || 'en-US';
  const left = options.position === 'left';
  const started = messages.length > 0;
  const quick = config.quickReplies;
  // Under the chat: at most 2 suggestions, skipping ones the visitor already asked.
  const asked = new Set(messages.filter((m) => m.role === 'user').map((m) => m.content));
  const suggestions = quick.filter((q) => !asked.has(q)).slice(0, 2);

  return (
    <AvatarFit.Provider value={fit}>
    <div
      data-theme={theme}
      className={`fixed bottom-4 z-[2147483647] font-sans text-fg antialiased sm:bottom-5 ${left ? 'left-4 sm:left-5' : 'right-4 sm:right-5'}`}
      style={{ '--accent': config.themeColor, fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }}
    >
      <section
        role="dialog"
        aria-label={config.name}
        aria-hidden={!open}
        inert={!open}
        className={`relative mb-3 flex h-[540px] max-h-[calc(100vh-100px)] w-[360px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-2xl border border-fg/10 bg-[image:var(--panel)] shadow-[0_30px_80px_-10px_rgb(20_10_60/.85)] transition-[opacity,transform,visibility] motion-reduce:transition-none max-sm:fixed max-sm:inset-0 max-sm:m-0 max-sm:h-[100dvh] max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:rounded-none ${left ? 'origin-bottom-left' : 'origin-bottom-right'} ${
          open
            ? 'visible translate-y-0 scale-100 opacity-100 duration-[380ms] ease-[cubic-bezier(.34,1.25,.64,1)]'
            : 'pointer-events-none invisible translate-y-5 scale-90 opacity-0 duration-200 ease-in'
        }`}
      >
        <div aria-hidden className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 animate-drift rounded-full bg-blue-600/30 opacity-[var(--blob)] blur-3xl motion-reduce:animate-none" />
        <div aria-hidden className="pointer-events-none absolute -left-16 top-24 h-40 w-40 animate-drift rounded-full bg-sky-600/15 opacity-[var(--blob)] blur-3xl [animation-delay:-4s] motion-reduce:animate-none" />

        <header className="relative flex items-center gap-2 px-4 pb-3 pt-4">
          <div className={`p-0.5 ring-2 ring-blue-400/50 ${tile ? 'rounded-[28%]' : 'rounded-full'}`}>
            <Robot src={config.avatarUrl} className="h-9 w-9" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold leading-tight">{config.name}</h2>
            <p className="flex items-center gap-1.5 text-xs text-fg/70 max-[420px]:hidden">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" /> Online
            </p>
          </div>
          {voiceOn && <Tabs value={tab} onChange={setTab} />}
          <button onClick={reset} disabled={!started} aria-label="New chat" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-fg/10 transition hover:bg-fg/20 active:scale-90 disabled:pointer-events-none disabled:opacity-35">
            <NewChatIcon className="h-4 w-4" />
          </button>
          {/* On phones the panel is full-screen and the launcher is hidden, so keep a close button there. */}
          <button onClick={toggle} aria-label="Close chat" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-fg/10 transition hover:bg-fg/20 active:scale-90 sm:hidden">
            <CloseIcon className="h-4 w-4" />
          </button>
        </header>

        {tab === 'voice' && voiceOn ? (
          <VoicePanel lang={voiceLang} messages={messages} send={send} onUseText={() => setTab('chat')} dark={theme === 'dark'} greeting={config.voiceGreeting || `Hi, I'm ${config.name}. How can I help you?`} />
        ) : (
          <>
        <div className="relative min-h-0 flex-1">
          <div ref={scrollRef} onScroll={onScroll} {...inputProps} role="log" aria-live="polite" aria-relevant="additions" className="scroll-thin h-full overflow-y-auto overscroll-contain px-4 pb-4 pt-2">
            <div ref={contentRef} className="space-y-3">
              {!started && (
                <div className="animate-fade-up rounded-xl border border-fg/10 bg-fg/[.05] p-4 backdrop-blur">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xl font-bold leading-tight">{config.heroTitle}</h3>
                      <p className="mt-1.5 text-sm leading-snug text-fg/70">{config.welcomeMessage}</p>
                    </div>
                    <Robot src={config.avatarUrl} className="h-16 w-16 shrink-0 animate-float drop-shadow-[0_8px_18px_rgb(37_99_235/.6)] motion-reduce:animate-none" />
                  </div>
                  {quick.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {quick.map((q, i) => (
                        <button key={q} onClick={() => send(q)} style={{ animationDelay: `${120 + i * 70}ms` }} className="animate-fade-up rounded-lg border border-fg/10 bg-fg/[.07] px-3 py-1.5 text-xs text-fg/90 transition hover:-translate-y-0.5 hover:border-blue-400/60 hover:bg-fg/[.12] active:scale-95">
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {messages.map((m) => (
                <Message key={m.id ?? m.time} msg={m} avatarUrl={config.avatarUrl} onRetry={retry} />
              ))}
              {sending && <Typing avatarUrl={config.avatarUrl} />}
            </div>
          </div>
          <button
            onClick={() => toBottom(true)}
            aria-label="Scroll to latest message"
            className={`absolute bottom-3 left-1/2 grid h-9 w-9 -translate-x-1/2 place-items-center rounded-lg border border-fg/15 bg-pop/90 shadow-lg backdrop-blur transition duration-200 hover:bg-fg/10 ${showJump ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0'}`}
          >
            <ArrowDownIcon className="h-4 w-4" />
          </button>
        </div>

        {suggestions.length > 0 && started && (
          <div className="relative flex flex-wrap justify-center gap-1.5 px-4 pb-1.5 pt-1">
            {suggestions.map((q) => (
              <button key={q} onClick={() => send(q)} disabled={sending} title={q} className="max-w-full animate-fade-up truncate rounded-md border border-blue-400/30 bg-fg/[.04] px-2.5 py-1 text-[11px] text-fg/85 transition hover:bg-fg/10 active:scale-95 disabled:opacity-50">
                {q}
              </button>
            ))}
          </div>
        )}

        </>
        )}

        <footer className="relative px-4 pb-3 pt-1.5 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {!(tab === 'voice' && voiceOn) && <Composer onSend={send} disabled={sending} inputRef={inputRef} />}
          <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-fg/55">
            <ShieldIcon className="h-3 w-3" /> AI can make mistakes. Check important details.
          </p>
        </footer>
      </section>

      <Launcher open={open} onToggle={toggle} avatarUrl={config.avatarUrl} teaser={teaser && config.teaser} onDismissTeaser={() => (setTeaser(false), store.set(teasedKey, true))} side={left ? 'left' : 'right'} buttonRef={launcherRef} tile={tile} />
    </div>
    </AvatarFit.Provider>
  );
}
