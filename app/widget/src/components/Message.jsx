import { memo, useState } from 'react';
import Robot from './Robot.jsx';
import { CheckIcon, CopyIcon, RefreshIcon } from './icons.jsx';
import { useTypewriter } from '../hooks.js';

const URL_OR_EMAIL = /(https?:\/\/[^\s<]+[^\s<.,;:!?)]|[\w.+-]+@[\w-]+\.[\w.-]+[\w])/g;

// Plain text with clickable links/emails (React escapes everything: no HTML injection).
function Linkified({ text }) {
  return text.split(URL_OR_EMAIL).map((part, i) => {
    if (i % 2 === 0) return part;
    const href = part.includes('@') && !part.startsWith('http') ? `mailto:${part}` : part;
    return (
      <a key={i} href={href} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-fg/40 underline-offset-2 transition hover:decoration-fg">
        {part}
      </a>
    );
  });
}

const clock = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function Message({ msg, avatarUrl, onRetry }) {
  const mine = msg.role === 'user';
  const [animate] = useState(() => Boolean(msg.fresh) && Date.now() - msg.time < 2000);
  const { shown, typing } = useTypewriter(msg.content, animate && !mine && !msg.isError);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: ignore */
    }
  };

  return (
    <div className={`group flex animate-fade-up gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
      {!mine && <Robot src={avatarUrl} className="mt-0.5 h-7 w-7 shrink-0" />}
      <div className={`flex max-w-[82%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
        <div
          className={`whitespace-pre-wrap break-words px-3.5 py-2 text-[13.5px] leading-relaxed ${
            mine
              ? 'rounded-xl rounded-br-sm bg-gradient-to-r from-[color:var(--accent)] to-sky-500 text-white shadow-lg shadow-blue-900/30'
              : msg.isError
                ? 'rounded-xl rounded-bl-sm border border-red-400/30 bg-red-500/10 text-err'
                : 'rounded-xl rounded-bl-sm border border-fg/10 bg-fg/[.06] text-fg/90'
          }`}
        >
          <Linkified text={shown} />
          {typing && <span className="ml-0.5 inline-block h-3.5 w-[3px] translate-y-0.5 animate-pulse rounded bg-blue-400" />}
        </div>
        <div className="mt-0.5 flex items-center gap-2 px-1 text-[10.5px] text-fg/55">
          <span>{clock(msg.time)}</span>
          {msg.isError && msg.retry && (
            <button onClick={() => onRetry(msg)} className="flex items-center gap-1 rounded-full bg-fg/10 px-2 py-0.5 text-fg/90 transition hover:bg-fg/20">
              <RefreshIcon className="h-3 w-3" /> Try again
            </button>
          )}
          {!mine && !msg.isError && !typing && (
            <button onClick={copy} aria-label="Copy answer" className="rounded p-0.5 opacity-0 transition hover:text-fg focus-visible:opacity-100 group-hover:opacity-100">
              {copied ? <CheckIcon className="h-3.5 w-3.5 text-emerald-400" /> : <CopyIcon className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(Message);

export function Typing({ avatarUrl }) {
  return (
    <div className="flex animate-fade-up items-end gap-2.5" role="status" aria-label="Assistant is typing">
      <Robot src={avatarUrl} className="h-7 w-7 shrink-0" />
      <div className="flex gap-1.5 rounded-xl rounded-bl-sm border border-fg/10 bg-fg/[.06] px-3.5 py-3">
        {[0, 0.18, 0.36].map((d) => (
          <span key={d} className="h-2 w-2 animate-dot rounded-full bg-blue-400" style={{ animationDelay: `${d}s` }} />
        ))}
      </div>
    </div>
  );
}
