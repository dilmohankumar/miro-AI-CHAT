import { useState } from 'react';
import { SendIcon } from './icons.jsx';

const MAX = 2000;

export default function Composer({ onSend, disabled, inputRef }) {
  const [text, setText] = useState('');
  const resize = (el) => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  };

  const submit = () => {
    if (!text.trim() || disabled) return;
    onSend(text);
    setText('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const canSend = text.trim() && !disabled;

  return (
    <form onSubmit={(e) => (e.preventDefault(), submit())} className="flex items-end gap-2 rounded-xl border border-blue-400/30 bg-fg/[.05] p-1 pl-3.5 shadow-[0_0_24px_-6px_rgb(59_130_246/.5)] transition focus-within:border-blue-400/80 focus-within:shadow-[0_0_30px_-4px_rgb(59_130_246/.7)]">
      <textarea
        ref={inputRef}
        rows={1}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          resize(e.target);
        }}
        onKeyDown={onKeyDown}
        maxLength={MAX}
        placeholder="Ask me anything…"
        aria-label="Your message"
        className="max-h-28 min-w-0 flex-1 resize-none bg-transparent py-2 text-base leading-snug text-fg outline-none placeholder:text-fg/50 sm:text-[13.5px]"
      />
      {text.length > MAX - 200 && <span className="self-center text-[11px] text-fg/55">{text.length}/{MAX}</span>}
      <button
        type="submit"
        disabled={!canSend}
        aria-label="Send message"
        className={`grid h-9 w-11 shrink-0 place-items-center rounded-lg bg-gradient-to-r from-[color:var(--accent)] to-sky-500 text-white shadow-lg shadow-blue-900/40 transition duration-200 active:scale-90 ${canSend ? 'scale-100 hover:brightness-110' : 'scale-95 opacity-40'}`}
      >
        <SendIcon className={`h-[18px] w-[18px] transition-transform duration-200 ${canSend ? 'translate-x-0 -rotate-0' : '-translate-x-0.5'}`} />
      </button>
    </form>
  );
}
