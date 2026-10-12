import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// Reveals text word by word (a "streaming" feel) in at most ~2s, however long the answer is.
export function useTypewriter(text, enabled) {
  const tokens = useMemo(() => text.split(/(\s+)/), [text]);
  const animate = enabled && !prefersReducedMotion();
  const [count, setCount] = useState(animate ? Math.min(2, tokens.length) : tokens.length);

  useEffect(() => {
    if (!animate) return;
    const step = Math.max(1, Math.ceil(tokens.length / 70));
    const timer = setInterval(() => setCount((c) => (c + step >= tokens.length ? (clearInterval(timer), tokens.length) : c + step)), 30);
    return () => clearInterval(timer);
  }, [animate, tokens]);

  return { shown: animate ? tokens.slice(0, count).join('') : text, typing: animate && count < tokens.length };
}

// Keeps the chat pinned to the newest message unless the user scrolled up to read.
// "The user scrolled up" is only believed when real user input (wheel / touch / keys /
// scrollbar drag) just happened; scroll events caused by layout changes or our own
// smooth scrolling must never switch auto-follow off.
export function useStickToBottom() {
  const scrollRef = useRef(null);
  const [contentEl, setContentEl] = useState(null); // callback ref: the content only exists after the config has loaded
  const stuck = useRef(true);
  const lastUserInput = useRef(0);
  const ownScrollUntil = useRef(0);
  const [showJump, setShowJump] = useState(false);

  const toBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    const animated = smooth && !prefersReducedMotion();
    stuck.current = true;
    ownScrollUntil.current = Date.now() + (animated ? 900 : 120);
    el.scrollTo({ top: el.scrollHeight, behavior: animated ? 'smooth' : 'auto' });
    setShowJump(false);
  }, []);

  const markUserInput = useCallback(() => {
    lastUserInput.current = Date.now();
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (gap < 80) stuck.current = true;
    else if (Date.now() - lastUserInput.current < 1000) stuck.current = false;
    if (Date.now() >= ownScrollUntil.current) setShowJump(gap > 160 && !stuck.current);
  }, []);

  useEffect(() => {
    if (!contentEl) return;
    const ro = new ResizeObserver(() => stuck.current && toBottom(false));
    ro.observe(contentEl);
    return () => ro.disconnect();
  }, [contentEl, toBottom]);

  const inputProps = { onWheel: markUserInput, onTouchMove: markUserInput, onPointerDown: markUserInput, onKeyDown: markUserInput };
  return { scrollRef, contentRef: setContentEl, onScroll, inputProps, showJump, toBottom };
}
