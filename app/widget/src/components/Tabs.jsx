import { ChatIcon, MicIcon } from './icons.jsx';

const ITEMS = [
  ['chat', 'Chat', ChatIcon],
  ['voice', 'Voice', MicIcon],
];

// Compact Chat | Voice switch (lives in the header) with a sliding highlight.
export default function Tabs({ value, onChange }) {
  return (
    <div role="tablist" aria-label="Chat mode" className="relative grid shrink-0 grid-cols-2 rounded-xl border border-fg/10 bg-fg/[.05] p-0.5">
      <span
        aria-hidden
        className={`absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-[10px] bg-gradient-to-r from-[color:var(--accent)] to-sky-500 shadow-md shadow-blue-900/30 transition-transform duration-300 ease-[cubic-bezier(.34,1.3,.64,1)] motion-reduce:transition-none ${value === 'voice' ? 'translate-x-full' : ''}`}
      />
      {ITEMS.map(([id, label, Icon]) => (
        <button
          key={id}
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange(id)}
          className={`relative z-10 flex items-center justify-center gap-1 rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors ${value === id ? 'text-white' : 'text-fg/70 hover:text-fg'}`}
        >
          <Icon className="h-3.5 w-3.5" /> {label}
        </button>
      ))}
    </div>
  );
}
