import { useEffect, useState } from 'react';

// useMediaQuery is a tiny wrapper around window.matchMedia that re-renders the
// component when the media-query result flips. Tests can stub
// window.matchMedia to control the value without touching the DOM.
export function useMediaQuery(query: string): boolean {
  const getMatch = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(query).matches;
  };

  const [matches, setMatches] = useState<boolean>(getMatch);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    // Older WebKit fallback; Vitest's jsdom supports addEventListener so this
    // branch is rarely needed but it keeps the hook robust.
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, [query]);

  return matches;
}

// Mobile breakpoint shared with styles.css's @media (max-width: 768px) rule.
export const MOBILE_BREAKPOINT = '(max-width: 768px)';
