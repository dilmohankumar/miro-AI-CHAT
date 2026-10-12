import { createContext, useContext } from 'react';

// 'round' (default): circular avatar, the WHOLE image shown centered with breathing room (icons, mascots, logos).
// 'cover': circular avatar, image fills the circle and is cropped (photos of faces).
// 'contain': rounded-square tile, whole image shown (artwork that must not lose its corners).
export const AvatarFit = createContext('round');

// Friendly robot avatar (inline SVG, no image assets). A custom `avatarUrl` from config.json replaces it.
export default function Robot({ src, className = '' }) {
  const fit = useContext(AvatarFit);
  if (src) {
    if (fit === 'round') {
      // The image is scaled down inside the circle so even its corners stay visible.
      return (
        <span className={`inline-block overflow-hidden rounded-full bg-white ${className}`}>
          <img src={src} alt="" draggable={false} className="h-full w-full scale-[.72] object-contain" />
        </span>
      );
    }
    const look = fit === 'cover' ? 'rounded-full object-cover object-top' : 'rounded-[22%] bg-white object-contain p-[3px]';
    return <img src={src} alt="" draggable={false} className={`${look} ${className}`} />;
  }
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="rb-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2563eb" /><stop offset="1" stopColor="#0ea5e9" /></linearGradient>
        <linearGradient id="rb-head" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#cfe3ff" /></linearGradient>
      </defs>
      <circle cx="32" cy="32" r="32" fill="url(#rb-bg)" />
      <line x1="32" y1="9" x2="32" y2="15" stroke="#e0f2fe" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="32" cy="8" r="3" fill="#bae6fd" />
      <rect x="9" y="29" width="5" height="11" rx="2.5" fill="#7dd3fc" />
      <rect x="50" y="29" width="5" height="11" rx="2.5" fill="#7dd3fc" />
      <rect x="13" y="15" width="38" height="33" rx="14" fill="url(#rb-head)" />
      <rect x="18" y="22" width="28" height="19" rx="9" fill="#0b1a3d" />
      <path d="M24 32q3-4 6 0M34 32q3-4 6 0" stroke="#67e8f9" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <path d="M28 38q4 3 8 0" stroke="#7dd3fc" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}
