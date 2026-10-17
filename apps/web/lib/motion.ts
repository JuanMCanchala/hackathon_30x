/**
 * Motion helpers (docs/DESIGN.md, Motion). The animations themselves are CSS classes in
 * globals.css; these only decide when a class applies, so nothing replays on a poll refresh.
 * `Reveal` lives with `useInView` in components/proof-bar.tsx and `stagger` in components/ui.tsx,
 * so server components can use them.
 */
import { useState } from 'react';

type Key = string | number;

/**
 * Which keys arrived after the list was first shown. A key present at the first render with data
 * is not fresh; one that appears later is (and one that leaves and comes back is fresh again), so
 * a live list animates only what is new to the person looking at it.
 */
export function useFresh(keys: readonly Key[], ready = true): (key: Key) => boolean {
  const [known, setKnown] = useState<ReadonlySet<Key> | null>(null);
  if (known === null) {
    if (ready) setKnown(new Set(keys));
  } else if ([...known].some((k) => !keys.includes(k))) {
    setKnown(new Set([...known].filter((k) => keys.includes(k))));
  }
  return (key) => known !== null && !known.has(key);
}
