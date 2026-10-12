import Robot from './Robot.jsx';
import { CloseIcon } from './icons.jsx';

// Floating button: robot <-> X cross-fade with rotation, plus a one-time teaser bubble.
export default function Launcher({ open, onToggle, avatarUrl, teaser, onDismissTeaser, side, buttonRef, tile }) {
  const layer = 'absolute inset-0 grid place-items-center transition-all duration-300 ease-[cubic-bezier(.34,1.4,.64,1)] motion-reduce:transition-none';
  return (
    <div className={`relative flex ${side === 'left' ? 'justify-start' : 'justify-end'} ${open ? 'max-sm:hidden' : ''}`}>
      {teaser && !open && (
        <div className={`absolute bottom-[68px] w-max max-w-[240px] animate-tease rounded-xl border border-fg/10 bg-pop/95 py-2.5 pl-3.5 pr-9 text-[13px] leading-snug text-fg/90 shadow-2xl shadow-blue-950/50 backdrop-blur ${side === 'left' ? 'left-0 origin-bottom-left' : 'right-0 origin-bottom-right'}`}>
          <button onClick={onToggle} className="text-left">{teaser}</button>
          <button onClick={onDismissTeaser} aria-label="Dismiss" className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full text-fg/55 transition hover:bg-fg/10 hover:text-fg">
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
          <span className={`absolute -bottom-1.5 h-3 w-3 rotate-45 border-b border-r border-fg/10 bg-pop ${side === 'left' ? 'left-6' : 'right-6'}`} />
        </div>
      )}
      <button
        ref={buttonRef}
        onClick={onToggle}
        aria-label={open ? 'Close chat' : 'Open chat'}
        aria-expanded={open}
        className={`relative h-14 w-14 bg-pop shadow-xl ${tile ? 'rounded-[22%]' : 'rounded-full p-1'} shadow-blue-950/60 ring-2 ring-blue-400/60 transition duration-200 hover:scale-105 hover:ring-blue-300 active:scale-90 ${open ? '' : 'motion-safe:animate-ring'}`}
      >
        <span className={`${layer} ${open ? 'scale-50 rotate-90 opacity-0' : 'scale-100 rotate-0 opacity-100'}`}>
          <Robot src={avatarUrl} className="h-full w-full" />
        </span>
        <span className={`${layer} text-fg ${open ? 'scale-100 rotate-0 opacity-100' : 'scale-50 -rotate-90 opacity-0'}`}>
          <CloseIcon className="h-6 w-6" />
        </span>
        <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-pop bg-emerald-400" />
      </button>
    </div>
  );
}
